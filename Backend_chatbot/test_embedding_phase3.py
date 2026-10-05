"""
Focused test suite for Phase 3: Embedding Model Reuse & Pinecone Initialization Optimization.
Verifies all 8 validation requirements from Step 10:
1. Shared model lazy initialization
2. Concurrent initialization thread safety
3. PineconeClient backwards compatibility
4. Explicit model injection
5. skip_index_check behavior
6. Embedding output consistency and dimension
7. Upload path integration
8. Failure propagation
"""

import os
import threading
import unittest
from unittest.mock import patch, MagicMock
import numpy as np

import pinecone_client
from pinecone_client import (
    PineconeClient,
    get_shared_embedding_model,
    _deterministic_hash,
)


class TestEmbeddingPhase3Optimization(unittest.TestCase):
    def setUp(self):
        # Save original shared model state
        self.orig_shared_model = pinecone_client._SHARED_EMBEDDING_MODEL
        with pinecone_client._INDEX_CACHE_LOCK:
            self.orig_index_cache = dict(pinecone_client._INDEX_CACHE)
            pinecone_client._INDEX_CACHE.clear()

    def tearDown(self):
        # Restore original shared model state
        pinecone_client._SHARED_EMBEDDING_MODEL = self.orig_shared_model
        with pinecone_client._INDEX_CACHE_LOCK:
            pinecone_client._INDEX_CACHE.clear()
            pinecone_client._INDEX_CACHE.update(self.orig_index_cache)

    # ─────────────────────────────────────────────────────────────
    # 1. Shared model lazy initialization
    # ─────────────────────────────────────────────────────────────
    def test_shared_model_lazy_initialization(self):
        """First request initializes model; subsequent requests return the exact same instance."""
        pinecone_client._SHARED_EMBEDDING_MODEL = None
        with patch("pinecone_client.SentenceTransformer") as mock_st_class:
            mock_instance = MagicMock()
            mock_st_class.return_value = mock_instance

            # Before call, model is None (lazy)
            self.assertIsNone(pinecone_client._SHARED_EMBEDDING_MODEL)

            # First retrieval
            m1 = get_shared_embedding_model()
            self.assertIs(m1, mock_instance)
            mock_st_class.assert_called_once_with("all-MiniLM-L6-v2")

            # Subsequent retrieval
            m2 = get_shared_embedding_model()
            self.assertIs(m2, mock_instance)
            self.assertIs(m1, m2)
            # Constructor was still called only once
            mock_st_class.assert_called_once()

    # ─────────────────────────────────────────────────────────────
    # 2. Concurrent initialization thread safety
    # ─────────────────────────────────────────────────────────────
    def test_concurrent_initialization(self):
        """Concurrent threads calling get_shared_embedding_model instantiate SentenceTransformer once."""
        pinecone_client._SHARED_EMBEDDING_MODEL = None
        with patch("pinecone_client.SentenceTransformer") as mock_st_class:
            mock_instance = MagicMock()
            mock_st_class.return_value = mock_instance

            results = []
            threads = []

            def worker():
                m = get_shared_embedding_model()
                results.append(m)

            for _ in range(12):
                t = threading.Thread(target=worker)
                threads.append(t)

            for t in threads:
                t.start()
            for t in threads:
                t.join()

            self.assertEqual(len(results), 12)
            for res in results:
                self.assertIs(res, mock_instance)

            # Constructor must have been invoked exactly once
            mock_st_class.assert_called_once_with("all-MiniLM-L6-v2")

    # ─────────────────────────────────────────────────────────────
    # 3. PineconeClient backwards compatibility
    # ─────────────────────────────────────────────────────────────
    @patch.dict(os.environ, {"PINECONE_API_KEY": "fake-key"})
    @patch("pinecone.Pinecone")
    def test_pinecone_client_backwards_compatibility(self, mock_pinecone_cls):
        """PineconeClient(index_name) default constructor continues to work unchanged."""
        mock_pc = MagicMock()
        mock_index_item = MagicMock()
        mock_index_item.name = "pdf-knowledge-base"
        mock_pc.list_indexes.return_value = [mock_index_item]
        mock_pinecone_cls.return_value = mock_pc

        fake_shared_model = MagicMock()
        pinecone_client._SHARED_EMBEDDING_MODEL = fake_shared_model

        # Call with default arguments (existing caller pattern)
        client = PineconeClient()

        self.assertEqual(client.index_name, "pdf-knowledge-base")
        self.assertIs(client.embedding_model, fake_shared_model)
        # Verify list_indexes was called because skip_index_check defaults to False
        mock_pc.list_indexes.assert_called_once()
        mock_pc.Index.assert_called_once_with("pdf-knowledge-base")

    # ─────────────────────────────────────────────────────────────
    # 4. Explicit model injection
    # ─────────────────────────────────────────────────────────────
    @patch.dict(os.environ, {"PINECONE_API_KEY": "fake-key"})
    @patch("pinecone.Pinecone")
    def test_explicit_model_injection(self, mock_pinecone_cls):
        """Explicitly passed embedding_model is assigned directly without calling get_shared_embedding_model."""
        mock_pc = MagicMock()
        mock_index_item = MagicMock()
        mock_index_item.name = "custom-index"
        mock_pc.list_indexes.return_value = [mock_index_item]
        mock_pinecone_cls.return_value = mock_pc

        custom_model = MagicMock()
        with patch("pinecone_client.get_shared_embedding_model") as mock_get_shared:
            client = PineconeClient(
                index_name="custom-index",
                embedding_model=custom_model,
                skip_index_check=True,
            )
            mock_get_shared.assert_not_called()
            self.assertIs(client.embedding_model, custom_model)

    # ─────────────────────────────────────────────────────────────
    # 5. skip_index_check behavior
    # ─────────────────────────────────────────────────────────────
    @patch.dict(os.environ, {"PINECONE_API_KEY": "fake-key"})
    @patch("pinecone.Pinecone")
    def test_skip_index_check(self, mock_pinecone_cls):
        """skip_index_check=True bypasses pc.list_indexes(); skip_index_check=False performs it."""
        mock_pc = MagicMock()
        mock_index_item = MagicMock()
        mock_index_item.name = "test-index"
        mock_pc.list_indexes.return_value = [mock_index_item]
        mock_pinecone_cls.return_value = mock_pc

        dummy_model = MagicMock()

        # Case A: skip_index_check=False (default behavior)
        c1 = PineconeClient("test-index", embedding_model=dummy_model, skip_index_check=False)
        mock_pc.list_indexes.assert_called_once()
        mock_pc.Index.assert_called_with("test-index")

        mock_pc.reset_mock()
        with pinecone_client._INDEX_CACHE_LOCK:
            pinecone_client._INDEX_CACHE.clear()

        # Case B: skip_index_check=True (upload ingestion optimization)
        c2 = PineconeClient("test-index", embedding_model=dummy_model, skip_index_check=True)
        mock_pc.list_indexes.assert_not_called()
        mock_pc.Index.assert_called_once_with("test-index")

    # ─────────────────────────────────────────────────────────────
    # 6. Embedding behavior & dimension
    # ─────────────────────────────────────────────────────────────
    @patch.dict(os.environ, {"PINECONE_API_KEY": "fake-key"})
    @patch("pinecone.Pinecone")
    def test_embedding_behavior_and_dimension(self, mock_pinecone_cls):
        """create_embeddings, create_embedding_single, create_embeddings_batch return float lists of dimension 384."""
        mock_pc = MagicMock()
        mock_pc.list_indexes.return_value = []
        mock_pinecone_cls.return_value = mock_pc

        fake_model = MagicMock()
        # Mock 384-dimensional numpy vector
        fake_vector = np.full((384,), 0.05, dtype=np.float32)
        fake_model.encode.side_effect = lambda texts, **kw: np.array([fake_vector for _ in texts])

        client = PineconeClient("test-index", embedding_model=fake_model, skip_index_check=True)

        # Batch encode
        embs = client.create_embeddings(["text 1", "text 2"])
        self.assertEqual(len(embs), 2)
        self.assertEqual(len(embs[0]), 384)
        self.assertIsInstance(embs[0][0], float)

        # Single encode
        single_emb = client.create_embedding_single("unique test query single")
        self.assertEqual(len(single_emb), 384)
        self.assertIsInstance(single_emb[0], float)

        # Create embeddings batch
        batch_embs = client.create_embeddings_batch(["q1", "q2", "q3"])
        self.assertEqual(len(batch_embs), 3)
        self.assertEqual(len(batch_embs[0]), 384)

    # ─────────────────────────────────────────────────────────────
    # 7. Upload path integration
    # ─────────────────────────────────────────────────────────────
    def test_upload_path_uses_shared_model_and_skip_index_check(self):
        """_run_pdf_ingestion constructs PineconeClient with shared embedding model and skip_index_check=True."""
        import api_server

        # Verify that in api_server._run_pdf_ingestion Step 4 code calls PineconeClient with skip_index_check=True
        import inspect
        source = inspect.getsource(api_server._run_pdf_ingestion)
        self.assertIn("skip_index_check=True", source)
        self.assertIn("embedding_model=get_shared_embedding_model()", source)

    # ─────────────────────────────────────────────────────────────
    # 8. Failure propagation
    # ─────────────────────────────────────────────────────────────
    def test_failure_propagation(self):
        """Exceptions during model loading or Pinecone operations update _upload_status to 'error'."""
        import api_server

        # Test failure during Step 4
        with patch("pdf_preprocessor.count_document_pages", return_value=1), \
             patch("pdf_preprocessor.extract_and_clean_document", return_value="Media literacy text"), \
             patch("relevance_filter.filter_text", return_value=("Media literacy text", {"total": 1, "kept": 1, "dropped": 0, "method": "mock", "dropped_samples": []})), \
             patch("txt_processor.TXTStructureParser") as mock_parser, \
             patch("pinecone_client.PineconeClient", side_effect=RuntimeError("Pinecone connection lost")):

            mock_parser_instance = MagicMock()
            mock_parser_instance.extract_sections.return_value = [{"title": "Sec", "content": "Text", "page": 1}]
            mock_parser_instance.create_chunks.return_value = [{"id": "chunk_0", "text": "Text", "metadata": {}, "section_path": ["Sec"]}]
            mock_parser.return_value = mock_parser_instance

            # Run ingestion synchronously
            api_server._run_pdf_ingestion("dummy.pdf", "dummy.pdf")

            status = api_server._upload_status
            self.assertEqual(status["status"], "error")
            self.assertIn("Pinecone connection lost", status["error"])


if __name__ == "__main__":
    unittest.main()
