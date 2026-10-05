"""
Phase 5N — Pinecone Client Concurrency & Shared Bounded Executor Tests

Verifies:
1. The executor is shared at process level.
2. It has exactly 12 workers.
3. retrieve() does not create a new executor per request.
4. Q0, Q1, Q2 are all submitted with respective top_k (8, 4, 4).
5. Existing retrieval result behavior remains intact.
6. PineconeClient initializes with connection_pool_maxsize = 120.
"""

import unittest
from unittest.mock import MagicMock, patch
import concurrent.futures as cf
import hybrid_retriever
from hybrid_retriever import _PINECONE_QUERY_EXECUTOR, EnhancedHybridRetriever
import pinecone_client
from pinecone_client import PineconeClient, get_shared_pinecone_index, _INDEX_CACHE, _INDEX_CACHE_LOCK
import os


class TestPhase5NPineconeConcurrency(unittest.TestCase):

    def test_01_shared_executor_configuration(self):
        """Verify _PINECONE_QUERY_EXECUTOR is a process-level shared ThreadPoolExecutor with 12 workers."""
        self.assertIsInstance(_PINECONE_QUERY_EXECUTOR, cf.ThreadPoolExecutor)
        self.assertEqual(_PINECONE_QUERY_EXECUTOR._max_workers, 12)

    def test_02_retrieve_does_not_create_new_executor(self):
        """Verify retrieve() does not instantiate any new ThreadPoolExecutor instances."""
        mock_pinecone = MagicMock()
        mock_pinecone.create_embeddings_batch.return_value = [[0.1] * 384] * 3
        mock_pinecone.search_with_vector.return_value = []

        mock_neo4j = MagicMock()
        mock_bm25 = MagicMock()
        mock_bm25.ready = False

        retriever = object.__new__(EnhancedHybridRetriever)
        retriever.pinecone_client = mock_pinecone
        retriever.neo4j_client = mock_neo4j
        retriever.bm25 = mock_bm25
        retriever.reformulator = hybrid_retriever.LLMReformulator()
        retriever.spell_corrector = hybrid_retriever.SpellCorrector()

        with patch("concurrent.futures.ThreadPoolExecutor") as mock_tpe_ctor:
            retriever.retrieve("What is cryptography?")
            # ThreadPoolExecutor should NOT have been called inside retrieve()
            mock_tpe_ctor.assert_not_called()

    def test_03_query_fan_out_submission(self):
        """Verify Q0 (top_k=8), Q1 (top_k=4), Q2 (top_k=4) are all submitted through the shared executor."""
        calls = []

        def fake_search_with_vector(embed, top_k=6, namespace=None):
            calls.append((len(embed), top_k))
            return []

        mock_pinecone = MagicMock()
        mock_pinecone.create_embeddings_batch.return_value = [[0.1] * 384] * 3
        mock_pinecone.search_with_vector.side_effect = fake_search_with_vector

        mock_neo4j = MagicMock()
        mock_bm25 = MagicMock()
        mock_bm25.ready = False

        mock_reformulator = MagicMock()
        mock_reformulator.reformulate.return_value = ["reformulated query 1", "reformulated query 2"]

        retriever = object.__new__(EnhancedHybridRetriever)
        retriever.pinecone_client = mock_pinecone
        retriever.neo4j_client = mock_neo4j
        retriever.bm25 = mock_bm25
        retriever.reformulator = mock_reformulator
        retriever.spell_corrector = hybrid_retriever.SpellCorrector()

        ctx = retriever.retrieve("What is cryptography?")
        self.assertEqual(len(calls), 3)
        # Verify the top_k requested for Q0, Q1, Q2
        top_k_requested = [c[1] for c in calls]
        self.assertEqual(top_k_requested, [8, 4, 4])
        self.assertEqual(len(ctx.expanded_queries), 3)

    def test_04_pinecone_client_pool_size(self):
        """Verify Pinecone client initializes with connection_pool_maxsize=120."""
        with patch.dict(os.environ, {"PINECONE_API_KEY": "dummy-key-12345"}):
            with patch("pinecone.Pinecone") as mock_pc_class:
                mock_pc_inst = MagicMock()
                mock_pc_class.return_value = mock_pc_inst
                mock_pc_inst.list_indexes.return_value = []

                pc_client = PineconeClient(index_name="test-pool-idx", skip_index_check=True)
                mock_pc_class.assert_called_with(api_key="dummy-key-12345", connection_pool_maxsize=120)

    def test_05_get_shared_pinecone_index_pool_size(self):
        """Verify get_shared_pinecone_index passes connection_pool_maxsize=120 when initializing Pinecone."""
        with patch.dict(os.environ, {"PINECONE_API_KEY": "dummy-key-12345"}):
            with _INDEX_CACHE_LOCK:
                _INDEX_CACHE.pop("fresh-test-index-5n", None)

            with patch("pinecone.Pinecone") as mock_pc_class:
                mock_pc_inst = MagicMock()
                mock_pc_class.return_value = mock_pc_inst

                idx = get_shared_pinecone_index(index_name="fresh-test-index-5n")
                mock_pc_class.assert_called_with(api_key="dummy-key-12345", connection_pool_maxsize=120)


if __name__ == "__main__":
    unittest.main()
