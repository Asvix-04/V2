"""
Phase 6K: Failure Modes, Resilience & Recovery Testing Suite (Python)
DigiLab QA & Automated Testing Track

Validates that the Python application layer:
1. Fails safely on LLM timeouts and provider errors, returning RATE_LIMIT_MESSAGE without crashing.
2. Does NOT poison exact or semantic caches on failure responses.
3. Recovers cleanly on subsequent requests after an LLM outage.
4. Degrades gracefully on Pinecone namespace queries without aborting the retrieval pipeline.
5. Preserves lexical BM25 fallback when vector search is completely unavailable.
6. Seamlessly routes cache and session operations to LocalMemoryCache during Redis connection/timeout errors.
7. Enforces LocalMemoryCache LRU eviction and TTL expiry boundaries.
8. Rejects corrupt/non-PDF files before processing.
9. Automatically removes partial upload files and transitions status to 'error' on off-domain or downstream failures.
10. Successfully recovers and allows new uploads after an ingestion failure.
11. Preserves multi-tenant session isolation during Redis degradation.
"""

import json
import os
import shutil
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

import chatbot
from chatbot import (
    PDFChatbot,
    RATE_LIMIT_MESSAGE,
    OUT_OF_SCOPE_MESSAGE,
)
from hybrid_retriever import (
    EnhancedHybridRetriever,
    RetrievedContext,
)
from pinecone_client import PineconeClient
from neo4j_client import Neo4jClient
from streaming_llm import StreamingLLM
from follow_up_generator import FollowUpGenerator
from llm_client import UnifiedLLMClient
from redis_client import RedisManager, LocalMemoryCache, REDIS_ERRORS


class MockVectorHit:
    """Mock Pinecone vector search result."""
    def __init__(self, item_id: str, score: float, metadata: dict = None, text: str = ""):
        self.id = item_id
        self.score = score
        self.metadata = metadata or {}
        self.text = text or self.metadata.get("text", "")

    def get(self, key, default=None):
        if key == "id":
            return self.id
        if key == "score":
            return self.score
        if key == "metadata":
            return self.metadata
        if key == "text":
            return self.text
        return default


class TestPhase6KFailureRecovery(unittest.TestCase):
    """Phase 6K unit and functional tests for failure modes and resilience."""

    def setUp(self):
        # Build an isolated mock PDFChatbot instance
        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None), \
             patch.object(Neo4jClient, "__init__", lambda self, **kw: None), \
             patch.object(UnifiedLLMClient, "__init__", lambda self, cfg: None), \
             patch.object(StreamingLLM, "__init__", lambda self: None), \
             patch.object(FollowUpGenerator, "__init__", lambda self, client: None):
            self.bot = PDFChatbot()

        # Isolate from filesystem uploads
        self.bot._uploaded_docs = {}

        # Reset Redis client exact match and session mocks
        self.redis_patcher_exact = patch.object(chatbot.redis_client, "get_exact_match", return_value=None)
        self.redis_patcher_hash = patch.object(chatbot.redis_client, "get_by_hash", return_value=None)
        self.redis_patcher_save = patch.object(chatbot.redis_client, "save_session_history", return_value=None)
        self.redis_patcher_resp = patch.object(chatbot.redis_client, "save_response", return_value="cache:test_hash")

        self.redis_patcher_exact.start()
        self.redis_patcher_hash.start()
        self.redis_patcher_save.start()
        self.redis_patcher_resp.start()

        # Mock Pinecone client semantic cache
        self.bot.retriever.pinecone_client = MagicMock()
        self.bot.retriever.pinecone_client.upsert_semantic_cache = MagicMock()

    def tearDown(self):
        self.redis_patcher_exact.stop()
        self.redis_patcher_hash.stop()
        self.redis_patcher_save.stop()
        self.redis_patcher_resp.stop()

    # ─────────────────────────────────────────────────────────────
    # Dimension 1 & 2: LLM Failure, Timeout & Safe Refusal
    # ─────────────────────────────────────────────────────────────

    def test_01_llm_timeout_fails_safely_to_rate_limit_message(self):
        """When LLM provider times out or returns None, chatbot safely returns RATE_LIMIT_MESSAGE."""
        # Setup mock retrieval returning high-scoring in-domain context
        fake_hit = MockVectorHit("doc1_c1", 0.95, {"source": "media_guide.pdf", "page": 2, "text": "News ethics require verification."})
        fake_context = RetrievedContext(
            vector_results=[fake_hit],
            graph_context={},
            combined_context="News ethics require verification.",
            expanded_queries=["journalism ethics"],
        )
        self.bot.retriever.retrieve = MagicMock(return_value=fake_context)

        # Simulate LLM timeout returning None
        with patch.object(self.bot, "_call_llm", return_value=None):
            result = self.bot.ask_question("What do journalism ethics require?", use_history=False)

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("answer"), RATE_LIMIT_MESSAGE)
        self.assertIn("experiencing high traffic", result.get("answer"))

    def test_02_llm_failure_response_not_saved_to_cache(self):
        """A failed/rate-limited LLM response must NEVER be saved to Redis exact cache or Pinecone semantic cache."""
        fake_hit = MockVectorHit("doc1_c1", 0.95, {"source": "media_guide.pdf", "page": 2, "text": "Fact checking."})
        fake_context = RetrievedContext(
            vector_results=[fake_hit],
            graph_context={},
            combined_context="Fact checking guidelines.",
            expanded_queries=["fact checking"],
        )
        self.bot.retriever.retrieve = MagicMock(return_value=fake_context)

        with patch.object(self.bot, "_call_llm", return_value=None), \
             patch.object(chatbot.redis_client, "save_response") as mock_save:
            res = self.bot.ask_question("Fact checking guidelines?", use_history=False)

        self.assertEqual(res.get("answer"), RATE_LIMIT_MESSAGE)
        mock_save.assert_not_called()
        self.bot.retriever.pinecone_client.upsert_semantic_cache.assert_not_called()

    def test_03_llm_unrecoverable_failure_and_subsequent_request_recovery(self):
        """A failed request does not poison subsequent healthy requests on the same chatbot instance."""
        fake_hit = MockVectorHit("doc1_c1", 0.95, {"source": "media_guide.pdf", "page": 2, "text": "Fact checking."})
        fake_context = RetrievedContext(
            vector_results=[fake_hit],
            graph_context={},
            combined_context="Fact checking guidelines.",
            expanded_queries=["fact checking"],
        )
        self.bot.retriever.retrieve = MagicMock(return_value=fake_context)

        # Request 1: Provider failure
        with patch.object(self.bot, "_call_llm", return_value=None):
            res1 = self.bot.ask_question("Fact checking guidelines?", use_history=False)
        self.assertEqual(res1.get("answer"), RATE_LIMIT_MESSAGE)

        # Request 2: Provider recovered
        healthy_answer = "Fact checking requires multiple independent sources."
        with patch.object(self.bot, "_call_llm", return_value=healthy_answer):
            res2 = self.bot.ask_question("Fact checking guidelines?", use_history=False)

        self.assertEqual(res2.get("answer"), healthy_answer)
        self.assertNotEqual(res2.get("answer"), RATE_LIMIT_MESSAGE)

    def test_04_gemini_client_daily_quota_exhausted_immediate_bailout(self):
        """UnifiedLLMClient._call_gemini terminates immediately on 429 daily quota without burning retry time."""
        from llm_client import UnifiedLLMClient, ModelConfig
        config = ModelConfig(
            id="gemini-3.6-flash",
            display_name="Test Flash",
            api="gemini",
            description="Test client",
        )

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_key_for_test"}):
            with patch("google.genai.Client"):
                client = UnifiedLLMClient(config)

        # Mock generate_content raising daily quota 429
        mock_error = Exception("429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Daily Requests' per day")
        with patch.object(client, "_genai_types"):
            with patch.object(client.client.models, "generate_content_stream", side_effect=mock_error), \
                 patch.object(client.client.models, "generate_content", side_effect=mock_error):
                t0 = time.time()
                resp = client._call_gemini("Test prompt", None, 0.4, 100, 0.95, max_retries=3, timeout=5)
                duration = time.time() - t0

        self.assertIsNone(resp)
        # Bails out immediately without 3 exponential waits (wait=5, wait=10, wait=20 = 35s)
        self.assertLess(duration, 3.0)

    # ─────────────────────────────────────────────────────────────
    # Dimension 3: Pinecone Failure, Degradation & BM25 Fallback
    # ─────────────────────────────────────────────────────────────

    def test_05_pinecone_namespace_failure_resilience(self):
        """When one namespace query raises an exception, search_with_vector isolates the failure and returns other namespaces."""
        with patch.dict(os.environ, {"PINECONE_API_KEY": "fake_key"}):
            with patch("pinecone.Pinecone"):
                pc_client = PineconeClient("pdf-knowledge-base", skip_index_check=True)

        pc_client.index = MagicMock()

        def side_effect_query(vector, top_k, include_metadata, namespace, filter):
            if namespace == "uploads":
                raise RuntimeError("Uploads namespace temporarily unavailable (HTTP 503)")
            return {
                "matches": [
                    {"id": "default_doc_1", "score": 0.88, "metadata": {"source": "core.pdf", "text": "Core text"}}
                ]
            }

        pc_client.index.query.side_effect = side_effect_query

        # Execute search across ["", "uploads"]
        results = pc_client.search_with_vector([0.1] * 384, top_k=5, namespaces=["", "uploads"])

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "default_doc_1")
        self.assertEqual(results[0]["score"], 0.88)

    def test_06_pinecone_outage_bm25_lexical_fallback(self):
        """When Pinecone returns 0 results or errors, hybrid retriever successfully surfaces BM25 hits."""
        with patch("hybrid_retriever.PineconeClient"), \
             patch("hybrid_retriever.Neo4jClient"), \
             patch("hybrid_retriever.LLMReformulator"), \
             patch("hybrid_retriever.SpellCorrector"), \
             patch("hybrid_retriever.StreamingLLM"):
            retriever = EnhancedHybridRetriever()

        # Pinecone returns empty
        retriever.pinecone_client.create_embeddings_batch.return_value = [[0.1] * 384]
        retriever.pinecone_client.search_with_vector.return_value = []

        # BM25 is ready and returns matching lexical hit
        retriever.bm25 = MagicMock()
        retriever.bm25.ready = True
        retriever.bm25.search.return_value = [
            {"id": "bm25_chunk_99", "score": 12.5, "metadata": {"source": "manual.pdf", "page": 5}, "text": "Media framing effect"}
        ]
        retriever.reformulator.reformulate.return_value = []
        retriever.spell_corrector.correct.return_value = "media framing"

        context = retriever.retrieve("media framing", top_k=5)

        self.assertGreater(len(context.vector_results), 0)
        top_hit = context.vector_results[0]
        self.assertEqual(top_hit.id, "bm25_chunk_99")
        self.assertIn("Media framing effect", top_hit.text)

    # ─────────────────────────────────────────────────────────────
    # Dimension 4: Redis Failure & LocalMemoryCache Fallback
    # ─────────────────────────────────────────────────────────────

    def test_07_redis_connection_error_fallback_to_local_cache(self):
        """When Redis throws ConnectionError, RedisManager transparently falls back to LocalMemoryCache."""
        manager = RedisManager()
        # Mock underlying redis client to simulate ConnectionError on get
        mock_redis = MagicMock()
        import redis
        mock_redis.get.side_effect = redis.ConnectionError("Redis connection refused")
        mock_redis.setex.side_effect = redis.ConnectionError("Redis connection refused")
        manager.client = mock_redis

        # Store in fallback
        key = manager.save_response("test question", {"answer": "Saved in memory", "confidence": 0.99})
        self.assertIn("cache:response:", key)

        # Retrieve should fail on redis.client, catch REDIS_ERRORS, and return from local_cache
        cached = manager.get_exact_match("test question")
        self.assertIsNotNone(cached)
        self.assertEqual(cached.get("answer"), "Saved in memory")

    def test_08_redis_timeout_error_fallback(self):
        """When Redis throws TimeoutError on session memory, LocalMemoryCache maintains continuity without crashing."""
        manager = RedisManager()
        mock_redis = MagicMock()
        import redis
        mock_redis.get.side_effect = redis.TimeoutError("Socket timeout on Redis read")
        mock_redis.setex.side_effect = redis.TimeoutError("Socket timeout on Redis write")
        manager.client = mock_redis

        # Save session history under simulated Redis timeout
        history_data = [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}]
        manager.save_session_history("sess_12345", history_data)

        # Retrieve session history under simulated Redis timeout
        retrieved = manager.get_session_history("sess_12345")
        self.assertIsNotNone(retrieved)
        self.assertEqual(len(retrieved), 2)
        self.assertEqual(retrieved[0]["content"], "Hi")

    def test_09_local_memory_cache_lru_and_ttl_eviction(self):
        """LocalMemoryCache enforces max_entries LRU eviction and TTL expiration boundaries."""
        # Create a small cache with capacity of 2 items
        cache = LocalMemoryCache(max_entries=2)

        cache.setex("key1", 3600, "val1")
        cache.setex("key2", 3600, "val2")
        self.assertEqual(cache.get("key1"), "val1")
        self.assertEqual(cache.get("key2"), "val2")

        # Adding key3 must evict key1 (least recently used)
        cache.setex("key3", 3600, "val3")
        self.assertIsNone(cache.get("key1"))
        self.assertEqual(cache.get("key2"), "val2")
        self.assertEqual(cache.get("key3"), "val3")

        # Test TTL expiration (ttl = 0 seconds)
        cache.setex("expired_key", 0, "stale_value")
        self.assertIsNone(cache.get("expired_key"))

    # ─────────────────────────────────────────────────────────────
    # Dimension 5 & 10: Ingestion Failures, Rejection & Cleanup
    # ─────────────────────────────────────────────────────────────

    def test_10_ingestion_corrupted_file_validation_rejection(self):
        """Corrupt or non-PDF/non-DOCX files are detected and rejected by format validators."""
        from api_server import _looks_like_pdf, _looks_like_docx

        with tempfile.TemporaryDirectory() as tmpdir:
            corrupt_pdf = os.path.join(tmpdir, "fake.pdf")
            with open(corrupt_pdf, "wb") as f:
                f.write(b"NOT_A_PDF_HEADER_JUST_RANDOM_TEXT")

            corrupt_docx = os.path.join(tmpdir, "fake.docx")
            with open(corrupt_docx, "wb") as f:
                f.write(b"NOT_A_ZIP_CONTAINER")

            valid_pdf = os.path.join(tmpdir, "valid.pdf")
            with open(valid_pdf, "wb") as f:
                f.write(b"%PDF-1.4 header content")

            self.assertFalse(_looks_like_pdf(corrupt_pdf))
            self.assertFalse(_looks_like_docx(corrupt_docx))
            self.assertTrue(_looks_like_pdf(valid_pdf))

    def test_11_ingestion_off_domain_failure_cleans_up_file(self):
        """Off-domain upload triggers ValueError and discards the uploaded file from disk."""
        import api_server

        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = os.path.join(tmpdir, "astronomy.pdf")
            with open(test_file, "w", encoding="utf-8") as f:
                f.write("Planets orbit the sun in elliptical orbits.")

            self.assertTrue(os.path.exists(test_file))

            with patch("pdf_preprocessor.count_document_pages", return_value=1), \
                 patch("pdf_preprocessor.extract_and_clean_document", return_value="Planets orbit the sun."), \
                 patch("relevance_filter.filter_text", return_value=("", {"total": 1, "kept": 0, "dropped": 1, "method": "two-tier", "dropped_samples": []})):

                api_server._run_pdf_ingestion(
                    pdf_path=test_file,
                    filename="astronomy.pdf",
                    document_id="doc_astro_1",
                    user_id="user_1",
                    job_id="job_astro_1",
                )

            # File must be deleted from disk
            self.assertFalse(os.path.exists(test_file))
            status = api_server._upload_status
            self.assertEqual(status.get("status"), "error")
            self.assertIn("No Media Literacy", status.get("error"))

    def test_12_ingestion_downstream_stage_failure_state(self):
        """Downstream vector upsert failure sets status to 'error' and records error message."""
        import api_server

        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = os.path.join(tmpdir, "journalism.pdf")
            with open(test_file, "w", encoding="utf-8") as f:
                f.write("Media reporting standards and news literacy.")

            mock_pc = MagicMock()
            mock_pc.index.list.return_value = []
            mock_pc.upsert_chunks.side_effect = RuntimeError("Pinecone API 500: Server Error")
            mock_embedding_model = MagicMock()
            mock_embedding_model.encode.return_value = [[0.1] * 384]

            with patch("pdf_preprocessor.count_document_pages", return_value=1), \
                 patch("pdf_preprocessor.extract_and_clean_document", return_value="Media reporting standards."), \
                 patch("relevance_filter.filter_text", return_value=("Media reporting standards.", {"total": 1, "kept": 1, "dropped": 0, "method": "two-tier", "dropped_samples": []})), \
                 patch("pinecone_client.PineconeClient", return_value=mock_pc), \
                 patch("pinecone_client.get_shared_embedding_model", return_value=mock_embedding_model):

                api_server._run_pdf_ingestion(
                    pdf_path=test_file,
                    filename="journalism.pdf",
                    document_id="doc_downstream_1",
                    user_id="user_1",
                    job_id="job_downstream_1",
                )

            status = api_server._upload_status
            self.assertEqual(status.get("status"), "error")
            self.assertIn("Pinecone API 500", status.get("error"))
            self.assertNotEqual(status.get("status"), "processing")

    def test_13_ingestion_recovery_subsequent_upload_succeeds(self):
        """System recovers from previous upload failure and allows subsequent upload to finish 'done'."""
        import api_server

        # State 1: Previous upload ended in error
        api_server._upload_status.update({
            "status": "error",
            "error": "Previous transient failure",
        })

        with tempfile.TemporaryDirectory() as tmpdir:
            healthy_file = os.path.join(tmpdir, "news_guide.pdf")
            with open(healthy_file, "w", encoding="utf-8") as f:
                f.write("News literacy guide.")

            mock_pc = MagicMock()
            mock_pc.index.list.return_value = []
            mock_embedding_model = MagicMock()
            mock_embedding_model.encode.return_value = [[0.1] * 384]

            with patch("pdf_preprocessor.count_document_pages", return_value=2), \
                 patch("pdf_preprocessor.extract_and_clean_document", return_value="News literacy guide."), \
                 patch("relevance_filter.filter_text", return_value=("News literacy guide.", {"total": 1, "kept": 1, "dropped": 0, "method": "two-tier", "dropped_samples": []})), \
                 patch("pinecone_client.PineconeClient", return_value=mock_pc), \
                 patch("pinecone_client.get_shared_embedding_model", return_value=mock_embedding_model), \
                 patch("build_bm25_cache.build_cache"):

                api_server._run_pdf_ingestion(
                    pdf_path=healthy_file,
                    filename="news_guide.pdf",
                    document_id="doc_healthy_1",
                    user_id="user_1",
                    job_id="job_healthy_1",
                )

            status = api_server._upload_status
            self.assertEqual(status.get("status"), "done")
            self.assertIsNone(status.get("error"))
            self.assertEqual(status.get("filename"), "news_guide.pdf")

    # ─────────────────────────────────────────────────────────────
    # Dimension 7 & 8: Persistence & Tenant Isolation under Failure
    # ─────────────────────────────────────────────────────────────

    def test_14_session_history_isolation_during_redis_degraded_mode(self):
        """Under Redis failure, LocalMemoryCache maintains complete session isolation between users."""
        manager = RedisManager()
        # Force fallback to local cache
        manager.client = manager.local_cache

        user_a_history = [{"role": "user", "content": "User A private question"}]
        user_b_history = [{"role": "user", "content": "User B distinct question"}]

        manager.save_session_history("user_a_session", user_a_history)
        manager.save_session_history("user_b_session", user_b_history)

        res_a = manager.get_session_history("user_a_session")
        res_b = manager.get_session_history("user_b_session")

        self.assertEqual(len(res_a), 1)
        self.assertEqual(res_a[0]["content"], "User A private question")
        self.assertEqual(len(res_b), 1)
        self.assertEqual(res_b[0]["content"], "User B distinct question")
        self.assertNotEqual(res_a[0]["content"], res_b[0]["content"])


if __name__ == "__main__":
    unittest.main()
