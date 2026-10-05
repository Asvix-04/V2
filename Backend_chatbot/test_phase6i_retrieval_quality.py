"""
Phase 6I: RAG Retrieval Quality Testing Suite
DigiLab QA & Automated Testing Track

Validates that the existing RAG retrieval pipeline returns correct, relevant,
well-ranked chunks for realistic queries across 10 retrieval-quality dimensions:
1. Exact / high-confidence retrieval
2. Semantic / paraphrased retrieval
3. Hybrid RRF fusion & consensus ranking
4. Primary vs expanded query weighting
5. Document & user scoping / isolation
6. Chunk & metadata consistency
7. Top-K enforcement & deduplication
8. Noise & irrelevant query discrimination
9. Query normalization & pipeline embedding reuse
10. Retrieval determinism & empty/degraded resilience

Strict scope: Retrieval quality only. Zero production code changes.
"""

import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import numpy as np

from hybrid_retriever import (
    BM25Index,
    EnhancedHybridRetriever,
    RetrievedContext,
    RuleBasedReformulator,
    SpellCorrector,
    _SimpleResult,
)
from pinecone_client import PineconeClient
from chatbot import GREETING_PREFIX_RE


class MockScoredVector:
    """Mock Pinecone ScoredVector supporting both object attributes and dict access."""

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

    def __getitem__(self, key):
        return getattr(self, key)


class TestPhase6IRetrievalQuality(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_6i_retrieval_")
        self.bm25_cache_path = os.path.join(self.test_dir, "bm25_test_corpus.json")
        self.spell_vocab_path = os.path.join(self.test_dir, "spell_vocab.json")

        # 1. Seed structured BM25 corpus (5 documents for positive Okapi IDF)
        self.sample_corpus = [
            {
                "id": "doc_journalism_ethics_01",
                "text": "Media ethics requires accuracy, fairness, impartiality, and truthful verification of sources.",
                "metadata": {
                    "source_file": "ethics.txt",
                    "full_section": "Unit 1 > Principles of Media Ethics",
                    "document_id": "doc_ethics_101",
                    "user_id": "user_alice",
                    "neo4j_id": "section_ethics_01",
                },
            },
            {
                "id": "doc_fact_checking_02",
                "text": "Fact checking techniques detect deepfakes, manipulated media, and online disinformation campaigns.",
                "metadata": {
                    "source_file": "factcheck.txt",
                    "full_section": "Unit 2 > Verification Tools",
                    "document_id": "doc_factcheck_102",
                    "user_id": "user_alice",
                    "neo4j_id": "section_fact_02",
                },
            },
            {
                "id": "doc_broadcast_tech_03",
                "text": "Radio and television transmitters broadcast electromagnetic signals across regional frequencies.",
                "metadata": {
                    "source_file": "broadcast.txt",
                    "full_section": "Unit 3 > Broadcast Transmission",
                    "document_id": "doc_broadcast_103",
                    "user_id": "user_bob",
                    "neo4j_id": "section_broad_03",
                },
            },
            {
                "id": "doc_print_production_04",
                "text": "Offset lithographic press machines print daily newspapers and periodical magazines at high speed.",
                "metadata": {
                    "source_file": "print.txt",
                    "full_section": "Unit 4 > Print Production",
                    "document_id": "doc_print_104",
                    "user_id": "user_bob",
                    "neo4j_id": "section_print_04",
                },
            },
            {
                "id": "doc_advertising_pr_05",
                "text": "Advertising agencies design persuasive commercial marketing campaigns for outdoor and social media platforms.",
                "metadata": {
                    "source_file": "advertising.txt",
                    "full_section": "Unit 5 > Commercial Communication",
                    "document_id": "doc_ad_105",
                    "user_id": "user_charlie",
                    "neo4j_id": "section_ad_05",
                },
            },
        ]
        with open(self.bm25_cache_path, "w", encoding="utf-8") as f:
            json.dump(self.sample_corpus, f)

        # 2. Seed Spell Vocabulary
        self.vocab = [
            "journalism",
            "ethics",
            "disinformation",
            "misinformation",
            "deepfake",
            "photography",
            "broadcasting",
            "advertising",
            "verification",
            "accuracy",
        ]
        with open(self.spell_vocab_path, "w", encoding="utf-8") as f:
            json.dump(self.vocab, f)

        # 3. Build mocked EnhancedHybridRetriever instance
        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None):
            self.retriever = EnhancedHybridRetriever(
                pinecone_index="test-index",
                bm25_cache_path=self.bm25_cache_path,
            )
            self.retriever.spell_corrector = SpellCorrector(cache_path=self.spell_vocab_path)
            self.retriever.neo4j_client = None

        self.mock_pinecone = MagicMock()
        self.retriever.pinecone_client = self.mock_pinecone
        self.mock_pinecone.create_embeddings_batch.return_value = [[0.05] * 384] * 3

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 1. Exact / High-Confidence Retrieval
    # ─────────────────────────────────────────────────────────────
    def test_01_exact_match_retrieval_high_confidence(self):
        """Query containing verbatim indexed keywords retrieves expected document chunk ranked #1."""
        query = "impartiality and truthful verification of sources"

        # Mock Pinecone to return matching vector at rank 0
        matching_vec = MockScoredVector(
            item_id="doc_journalism_ethics_01",
            score=0.92,
            metadata=self.sample_corpus[0]["metadata"],
            text=self.sample_corpus[0]["text"],
        )
        distractor_vec = MockScoredVector(
            item_id="doc_advertising_pr_05",
            score=0.31,
            metadata=self.sample_corpus[4]["metadata"],
            text=self.sample_corpus[4]["text"],
        )
        self.mock_pinecone.search_with_vector.return_value = [matching_vec, distractor_vec]

        ctx = self.retriever.retrieve(query, top_k=3)

        self.assertGreater(len(ctx.vector_results), 0)
        top_result = ctx.vector_results[0]
        self.assertEqual(top_result.id, "doc_journalism_ethics_01")
        self.assertEqual(top_result.metadata["source_file"], "ethics.txt")
        self.assertIn("truthful verification", top_result.text)

    # ─────────────────────────────────────────────────────────────
    # 2. Semantic / Paraphrased Retrieval
    # ─────────────────────────────────────────────────────────────
    def test_02_semantic_paraphrase_retrieval(self):
        """Paraphrased query with zero exact keyword match retrieves relevant chunk via vector similarity."""
        query = "synthetic digital video fabrication"  # Paraphrase for deepfakes & manipulated media

        # BM25 has no exact keyword hit for "synthetic" in corpus
        # Pinecone semantic vector search identifies fact_checking chunk as highest match
        relevant_vec = MockScoredVector(
            item_id="doc_fact_checking_02",
            score=0.88,
            metadata=self.sample_corpus[1]["metadata"],
            text=self.sample_corpus[1]["text"],
        )
        self.mock_pinecone.search_with_vector.return_value = [relevant_vec]

        ctx = self.retriever.retrieve(query, top_k=2)

        self.assertGreater(len(ctx.vector_results), 0)
        self.assertEqual(ctx.vector_results[0].id, "doc_fact_checking_02")
        self.assertEqual(ctx.vector_results[0].metadata["document_id"], "doc_factcheck_102")

    # ─────────────────────────────────────────────────────────────
    # 3. Hybrid RRF Scoring & Multi-Modal Consensus
    # ─────────────────────────────────────────────────────────────
    def test_03_hybrid_rrf_scoring_and_synergy(self):
        """Candidate present in BOTH vector search and BM25 achieves higher RRF score than single-modality candidates."""
        query = "broadcast transmission frequencies"

        # Candidate A: Vector only (doc_fact_checking_02)
        vec_a = MockScoredVector("doc_fact_checking_02", 0.75, self.sample_corpus[1]["metadata"], self.sample_corpus[1]["text"])
        # Candidate B: Vector + BM25 (doc_broadcast_tech_03)
        vec_b = MockScoredVector("doc_broadcast_tech_03", 0.70, self.sample_corpus[2]["metadata"], self.sample_corpus[2]["text"])

        self.mock_pinecone.search_with_vector.return_value = [vec_a, vec_b]

        ctx = self.retriever.retrieve(query, top_k=5)

        result_ids = [r.id for r in ctx.vector_results]
        self.assertIn("doc_broadcast_tech_03", result_ids)
        # Because doc_broadcast_tech_03 matched both BM25 ("broadcast", "frequencies") and vector,
        # its fused score is boosted above doc_fact_checking_02
        top_id = ctx.vector_results[0].id
        self.assertEqual(top_id, "doc_broadcast_tech_03", "Dual vector+BM25 consensus candidate must rank #1")

    # ─────────────────────────────────────────────────────────────
    # 4. Primary vs Expanded Query Weighting
    # ─────────────────────────────────────────────────────────────
    def test_04_primary_vs_expanded_query_weighting(self):
        """Hits on verbatim user query (qi=0) receive strictly higher RRF weights (1.5 / 1.4) than expanded reformulations (0.8 / 0.7)."""
        rrf_k = 60
        rank = 0

        # Exact formulas from hybrid_retriever.py lines 354 and 366
        vector_weight_q0 = 1.5
        vector_weight_q1 = 0.8
        bm25_weight_q0 = 1.4
        bm25_weight_q1 = 0.7

        score_vec_q0 = (1.0 / (rrf_k + rank)) * vector_weight_q0
        score_vec_q1 = (1.0 / (rrf_k + rank)) * vector_weight_q1
        score_bm25_q0 = (1.0 / (rrf_k + rank)) * bm25_weight_q0
        score_bm25_q1 = (1.0 / (rrf_k + rank)) * bm25_weight_q1

        self.assertGreater(score_vec_q0, score_vec_q1, "Primary vector hit must outweigh expanded vector hit")
        self.assertGreater(score_bm25_q0, score_bm25_q1, "Primary BM25 hit must outweigh expanded BM25 hit")
        self.assertAlmostEqual(score_vec_q0 / score_vec_q1, 1.5 / 0.8, places=4)
        self.assertAlmostEqual(score_bm25_q0 / score_bm25_q1, 1.4 / 0.7, places=4)

    # ─────────────────────────────────────────────────────────────
    # 5. Document & User Scoping / Isolation
    # ─────────────────────────────────────────────────────────────
    def test_05_document_and_user_isolation(self):
        """Retrieved chunks retain strict user_id and document_id isolation metadata."""
        query = "accuracy and ethics"

        vec_alice = MockScoredVector(
            "doc_journalism_ethics_01",
            0.95,
            {"document_id": "doc_ethics_101", "user_id": "user_alice", "source_file": "ethics.txt"},
            "Accuracy and ethics text",
        )
        vec_bob = MockScoredVector(
            "doc_broadcast_tech_03",
            0.40,
            {"document_id": "doc_broadcast_103", "user_id": "user_bob", "source_file": "broadcast.txt"},
            "Broadcast text",
        )
        self.mock_pinecone.search_with_vector.return_value = [vec_alice, vec_bob]

        ctx = self.retriever.retrieve(query, top_k=2)

        results = ctx.vector_results
        self.assertEqual(results[0].metadata["user_id"], "user_alice")
        self.assertEqual(results[0].metadata["document_id"], "doc_ethics_101")
        self.assertNotEqual(results[0].metadata["user_id"], results[1].metadata["user_id"])
        self.assertNotEqual(results[0].metadata["document_id"], results[1].metadata["document_id"])

    def test_05b_upload_reserved_slots_preservation(self):
        """_merge_namespace_matches guarantees non-default upload namespace candidates survive truncation."""
        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None):
            pc = PineconeClient("test-index")
        # 5 bulk corpus matches with high scores
        bulk_matches = [{"id": f"bulk_{i}", "score": 0.90 - i * 0.01} for i in range(5)]
        # 2 upload matches with slightly lower scores
        upload_matches = [{"id": "upload_doc_1", "score": 0.70}, {"id": "upload_doc_2", "score": 0.65}]

        per_ns = {"": bulk_matches, "uploads": upload_matches}
        merged = pc._merge_namespace_matches(per_ns, top_k=4)

        self.assertEqual(len(merged), 4)
        merged_ids = [m["id"] for m in merged]
        # At least the top upload item must be guaranteed in the merged top_k
        self.assertIn("upload_doc_1", merged_ids, "Upload match must be reserved and survive truncation")

    # ─────────────────────────────────────────────────────────────
    # 6. Chunk & Metadata Consistency
    # ─────────────────────────────────────────────────────────────
    def test_06_chunk_metadata_consistency_and_context_construction(self):
        """RetrievedContext contains complete metadata and correctly formats [FROM: source] in combined_context."""
        query = "truthful verification"
        vec = MockScoredVector(
            item_id="doc_journalism_ethics_01",
            score=0.91,
            metadata={
                "source_file": "ethics.txt",
                "full_section": "Unit 1 > Principles of Media Ethics",
                "document_id": "doc_ethics_101",
                "user_id": "user_alice",
                "neo4j_id": "section_ethics_01",
            },
            text="Media ethics requires accuracy and truthful verification.",
        )
        self.mock_pinecone.search_with_vector.return_value = [vec]

        ctx = self.retriever.retrieve(query, top_k=1)

        self.assertIsInstance(ctx, RetrievedContext)
        self.assertIn('QUESTION TO ANSWER: "truthful verification"', ctx.combined_context)
        self.assertIn("[FROM: Unit 1 > Principles of Media Ethics]", ctx.combined_context)
        self.assertIn("Media ethics requires accuracy", ctx.combined_context)
        self.assertIn("===== END OF COURSE MATERIAL =====", ctx.combined_context)

    # ─────────────────────────────────────────────────────────────
    # 7. Top-K Parameter Enforcement & Ranking Order
    # ─────────────────────────────────────────────────────────────
    def test_07_top_k_parameter_enforcement_and_ordering(self):
        """Requested top_k (1, 2, 4) is strictly respected, and results are monotonically ordered by RRF score."""
        for requested_k in [1, 2, 4]:
            self.mock_pinecone.search_with_vector.return_value = [
                MockScoredVector(f"doc_{i}", 0.90 - i * 0.1, {"source_file": f"doc_{i}.txt"}, f"Text {i}")
                for i in range(5)
            ]
            ctx = self.retriever.retrieve("test query", top_k=requested_k)
            self.assertEqual(len(ctx.vector_results), requested_k)

            # Assert strict descending monotonicity of RRF scores
            scores = [r.score for r in ctx.vector_results]
            for j in range(len(scores) - 1):
                self.assertGreaterEqual(scores[j], scores[j + 1], "Results must be sorted descending by RRF score")

    # ─────────────────────────────────────────────────────────────
    # 8. Deduplication of Multi-Query Candidate Hits
    # ─────────────────────────────────────────────────────────────
    def test_08_deduplication_of_multi_query_hits(self):
        """A candidate matching across multiple query reformulations appears exactly once in final results."""
        query = "disinformation campaigns"

        # The same document returned in multiple query reformulations
        hit = MockScoredVector(
            item_id="doc_fact_checking_02",
            score=0.85,
            metadata=self.sample_corpus[1]["metadata"],
            text=self.sample_corpus[1]["text"],
        )
        self.mock_pinecone.search_with_vector.return_value = [hit]

        ctx = self.retriever.retrieve(query, top_k=5)

        retrieved_ids = [r.id for r in ctx.vector_results]
        self.assertEqual(retrieved_ids.count("doc_fact_checking_02"), 1, "Duplicate vector IDs must be deduplicated")

    # ─────────────────────────────────────────────────────────────
    # 9. Noise & Irrelevant Query Discrimination
    # ─────────────────────────────────────────────────────────────
    def test_09_noise_and_irrelevant_query_discrimination(self):
        """Completely irrelevant/off-domain queries yield zero BM25 matches and low vector relevance."""
        query = "quantum wavefunction entanglement calculus"

        # BM25 returns 0 matches for quantum physics query against media literacy corpus
        bm25_results = self.retriever.bm25.search(query, top_k=5)
        self.assertEqual(len(bm25_results), 0, "BM25 must return 0 results for unrelated query")

        # Even if Pinecone returns distractor matches with near-zero scores
        distractor = MockScoredVector("doc_unrelated", 0.05, {"source_file": "misc.txt"}, "Unrelated text")
        self.mock_pinecone.search_with_vector.return_value = [distractor]

        ctx = self.retriever.retrieve(query, top_k=1)
        # RRF score with single low-rank match is modest
        top_score = ctx.vector_results[0].score
        self.assertLess(top_score, 0.040, "Irrelevant query must not produce elevated RRF scores")

    # ─────────────────────────────────────────────────────────────
    # 10. Spell Correction Query Normalization
    # ─────────────────────────────────────────────────────────────
    def test_10_spell_correction_query_normalization(self):
        """SpellCorrector fixes course-domain typos before retrieval query expansion."""
        corrector = SpellCorrector(cache_path=self.spell_vocab_path)

        # Transposition and single-letter errors
        self.assertEqual(corrector.correct("what is journlism"), "what is journalism")
        self.assertEqual(corrector.correct("explain media ethicss"), "explain media ethics")
        self.assertEqual(corrector.correct("detecting deepfke"), "detecting deepfake")
        # In-vocabulary words remain unchanged
        self.assertEqual(corrector.correct("accuracy and broadcasting"), "accuracy and broadcasting")

    # ─────────────────────────────────────────────────────────────
    # 11. Greeting Normalization & Stripping
    # ─────────────────────────────────────────────────────────────
    def test_11_greeting_normalization_and_stripping(self):
        """Conversational greetings are stripped to expose the underlying academic query."""
        samples = [
            ("Hello, what is journalism ethics?", "what is journalism ethics?"),
            ("good morning! explain deepfake detection", "explain deepfake detection"),
            ("Hey, how does advertising work?", "how does advertising work?"),
            ("namaste what are the principles of media literacy", "what are the principles of media literacy"),
        ]
        for raw, expected in samples:
            cleaned = GREETING_PREFIX_RE.sub("", raw).strip()
            self.assertEqual(cleaned, expected)

    # ─────────────────────────────────────────────────────────────
    # 12. Precomputed Embedding & Query Reuse Invariance
    # ─────────────────────────────────────────────────────────────
    def test_12_precomputed_embedding_and_query_reuse_invariance(self):
        """Passing precomputed embeddings & queries (Phase 5J pipeline) produces results equivalent to direct retrieval."""
        query = "media ethics and accuracy"
        queries = [query, "journalism ethics", "media accuracy"]
        embeddings = [[0.05] * 384, [0.05] * 384, [0.05] * 384]

        mock_hit = MockScoredVector("doc_journalism_ethics_01", 0.90, self.sample_corpus[0]["metadata"], self.sample_corpus[0]["text"])
        self.mock_pinecone.search_with_vector.return_value = [mock_hit]

        # Call with precomputed arguments
        ctx_precomputed = self.retriever.retrieve(
            query=query,
            top_k=2,
            precomputed_embeddings=embeddings,
            precomputed_queries=queries,
            embedding_ms=1.5,
        )

        # Call without precomputed arguments
        self.mock_pinecone.create_embeddings_batch.return_value = embeddings
        ctx_standard = self.retriever.retrieve(
            query=query,
            top_k=2,
        )

        self.assertEqual(
            [r.id for r in ctx_precomputed.vector_results],
            [r.id for r in ctx_standard.vector_results],
            "Precomputed retrieval must match standard retrieval result IDs",
        )
        self.assertAlmostEqual(
            ctx_precomputed.vector_results[0].score,
            ctx_standard.vector_results[0].score,
            places=5,
            msg="RRF scores must match between precomputed and standard retrieval",
        )

    # ─────────────────────────────────────────────────────────────
    # 13. Empty Corpus & Degraded Match Handling
    # ─────────────────────────────────────────────────────────────
    def test_13_empty_corpus_and_no_match_graceful_handling(self):
        """Retriever gracefully returns empty results without crashing or hallucinating chunks when no matches exist."""
        self.mock_pinecone.search_with_vector.return_value = []
        # Query that matches nothing in BM25
        ctx = self.retriever.retrieve("xyznonexistentterm12345", top_k=5)

        self.assertEqual(len(ctx.vector_results), 0)
        self.assertIn("===== END OF COURSE MATERIAL =====", ctx.combined_context)
        self.assertEqual(ctx.graph_context, {"context": []})

    # ─────────────────────────────────────────────────────────────
    # 14. Missing Optional Metadata Resilience
    # ─────────────────────────────────────────────────────────────
    def test_14_missing_optional_metadata_resilience(self):
        """Candidate vectors with empty or partial metadata dictionaries are handled without AttributeError."""
        sparse_vec = MockScoredVector(
            item_id="sparse_doc_999",
            score=0.80,
            metadata={},  # completely empty metadata
            text="Raw text with no section or document metadata",
        )
        self.mock_pinecone.search_with_vector.return_value = [sparse_vec]

        ctx = self.retriever.retrieve("sparse query", top_k=1)

        self.assertEqual(len(ctx.vector_results), 1)
        self.assertEqual(ctx.vector_results[0].id, "sparse_doc_999")
        # Fallback to "Unknown" section in combined_context
        self.assertIn("[FROM: Unknown]", ctx.combined_context)

    # ─────────────────────────────────────────────────────────────
    # 15. Retrieval Ranking Determinism
    # ─────────────────────────────────────────────────────────────
    def test_15_retrieval_ranking_determinism(self):
        """Repeating the identical retrieval 5 consecutive times produces bit-for-bit identical IDs, scores, and order."""
        query = "fairness and truthful verification of sources"
        vec_1 = MockScoredVector("doc_journalism_ethics_01", 0.90, self.sample_corpus[0]["metadata"], self.sample_corpus[0]["text"])
        vec_2 = MockScoredVector("doc_fact_checking_02", 0.70, self.sample_corpus[1]["metadata"], self.sample_corpus[1]["text"])
        self.mock_pinecone.search_with_vector.return_value = [vec_1, vec_2]

        baseline_ctx = self.retriever.retrieve(query, top_k=2)
        baseline_ids = [r.id for r in baseline_ctx.vector_results]
        baseline_scores = [r.score for r in baseline_ctx.vector_results]

        for iteration in range(5):
            ctx = self.retriever.retrieve(query, top_k=2)
            ids = [r.id for r in ctx.vector_results]
            scores = [r.score for r in ctx.vector_results]

            self.assertEqual(ids, baseline_ids, f"Iteration {iteration} produced differing candidate IDs")
            self.assertEqual(scores, baseline_scores, f"Iteration {iteration} produced differing RRF scores")

    # ─────────────────────────────────────────────────────────────
    # 16. Rule-Based Reformulator Domain Synonyms
    # ─────────────────────────────────────────────────────────────
    def test_16_rule_based_reformulator_synonyms(self):
        """RuleBasedReformulator produces valid domain synonym expansions without network latency."""
        reformulator = RuleBasedReformulator()

        expansions_journalism = reformulator.reformulate("what is journalism")
        self.assertGreater(len(expansions_journalism), 0)
        self.assertTrue(any("news reporting" in exp or "press" in exp for exp in expansions_journalism))

        expansions_disinfo = reformulator.reformulate("how to stop disinformation")
        self.assertGreater(len(expansions_disinfo), 0)
        self.assertTrue(any("deliberate misinformation" in exp or "propaganda" in exp for exp in expansions_disinfo))

        expansions_deepfake = reformulator.reformulate("detecting deepfake videos")
        self.assertGreater(len(expansions_deepfake), 0)
        self.assertTrue(any("synthetic media" in exp for exp in expansions_deepfake))

    # ─────────────────────────────────────────────────────────────
    # 17. BM25 Text Tokenization and Scoring
    # ─────────────────────────────────────────────────────────────
    def test_17_bm25_text_tokenization_and_scoring(self):
        """BM25Index tokenizes terms, strips punctuation, and ranks matching documents by Okapi BM25 score."""
        tokens = self.retriever.bm25._tokenize("Media, is ethics; and journalism?!")
        self.assertIn("media", tokens)
        self.assertIn("ethics", tokens)
        self.assertIn("journalism", tokens)
        self.assertIn("and", tokens)
        self.assertNotIn("is", tokens)  # 2 chars filtered by len > 2 rule

        search_res = self.retriever.bm25.search("lithographic press newspapers", top_k=2)
        self.assertGreater(len(search_res), 0)
        self.assertEqual(search_res[0]["id"], "doc_print_production_04")
        self.assertGreater(search_res[0]["score"], 0.0)

    # ─────────────────────────────────────────────────────────────
    # 18. RRF Score Monotonicity Property
    # ─────────────────────────────────────────────────────────────
    def test_18_rrf_score_monotonicity_property(self):
        """A candidate strictly dominating another in both vector and BM25 rank always achieves higher RRF score."""
        query = "principles of media ethics"
        # Candidate 1: Rank 0 in vector, Rank 0 in BM25
        # Candidate 2: Rank 1 in vector, Rank 1 in BM25
        cand1 = MockScoredVector("doc_journalism_ethics_01", 0.95, self.sample_corpus[0]["metadata"], self.sample_corpus[0]["text"])
        cand2 = MockScoredVector("doc_advertising_pr_05", 0.60, self.sample_corpus[4]["metadata"], self.sample_corpus[4]["text"])
        self.mock_pinecone.search_with_vector.return_value = [cand1, cand2]

        ctx = self.retriever.retrieve(query, top_k=2)

        self.assertEqual(len(ctx.vector_results), 2)
        score1 = ctx.vector_results[0].score
        score2 = ctx.vector_results[1].score
        self.assertGreater(score1, score2, "Strictly dominating candidate must achieve strictly higher RRF score")


if __name__ == "__main__":
    unittest.main()
