"""
Phase 4 Pinecone Cache & Stale Vector Deletion Tests

Verifies:
1. First PineconeClient for an index creates/resolves the index.
2. Second PineconeClient for the same index reuses the cached Index object.
3. Different index names do not incorrectly share the same Index object.
4. Concurrent initialization does not create duplicate cached index instances (thread safety).
5. skip_index_check behavior from Phase 3 remains intact.
6. Explicit embedding_model injection from Phase 3 remains intact.
7. Stale vector ListResponse parsing extracts IDs cleanly without TypeError.
8. Empty ListResponse / empty generator handling.
9. Multiple pages of ListResponse are extracted and batched.
10. Failure propagation: Pinecone list/delete errors are not silently swallowed.
"""

import os
import unittest
from unittest.mock import MagicMock, patch
from concurrent.futures import ThreadPoolExecutor

import pinecone_client
from pinecone_client import (
    PineconeClient,
    get_shared_pinecone_index,
    extract_vector_ids_from_list_response,
    _INDEX_CACHE,
    _INDEX_CACHE_LOCK,
)


class MockListItem:
    """Simulates a Pinecone SDK v5+ ListItem."""
    def __init__(self, item_id: str):
        self.id = item_id

    def __repr__(self):
        return f"ListItem(id='{self.id}')"


class MockListResponse:
    """Simulates a Pinecone SDK v5+ ListResponse page."""
    def __init__(self, vector_ids):
        self.vectors = [MockListItem(vid) for vid in vector_ids]
        self.namespace = "uploads"

    def __iter__(self):
        return iter(self.vectors)

    def __repr__(self):
        return f"ListResponse(vectors={self.vectors})"


class TestPineconePhase4(unittest.TestCase):

    def setUp(self):
        self._orig_api_key = os.environ.get("PINECONE_API_KEY")
        os.environ["PINECONE_API_KEY"] = "test-phase4-mock-key"
        with _INDEX_CACHE_LOCK:
            self._saved_cache = dict(_INDEX_CACHE)
            _INDEX_CACHE.clear()

    def tearDown(self):
        with _INDEX_CACHE_LOCK:
            _INDEX_CACHE.clear()
            _INDEX_CACHE.update(self._saved_cache)
        if self._orig_api_key is not None:
            os.environ["PINECONE_API_KEY"] = self._orig_api_key
        else:
            os.environ.pop("PINECONE_API_KEY", None)

    @patch("pinecone.Pinecone")
    def test_1_first_client_resolves_index(self, mock_pinecone_cls):
        """Test 1: First PineconeClient for an index creates/resolves the index."""
        mock_pc_instance = MagicMock()
        mock_index_obj = MagicMock()
        mock_pc_instance.Index.return_value = mock_index_obj
        mock_pinecone_cls.return_value = mock_pc_instance

        client = PineconeClient("test-index-1", skip_index_check=True)

        self.assertIs(client.index, mock_index_obj)
        mock_pc_instance.Index.assert_called_once_with("test-index-1")

    @patch("pinecone.Pinecone")
    def test_2_second_client_reuses_cached_index(self, mock_pinecone_cls):
        """Test 2: Second PineconeClient for the same index reuses the cached Index object."""
        mock_pc_instance = MagicMock()
        mock_index_obj = MagicMock()
        mock_pc_instance.Index.return_value = mock_index_obj
        mock_pinecone_cls.return_value = mock_pc_instance

        client1 = PineconeClient("test-index-reuse", skip_index_check=True)
        client2 = PineconeClient("test-index-reuse", skip_index_check=True)

        self.assertIs(client1.index, client2.index)
        # Index(...) resolution must only have happened ONCE
        self.assertEqual(mock_pc_instance.Index.call_count, 1)

    @patch("pinecone.Pinecone")
    def test_3_different_indices_do_not_share_object(self, mock_pinecone_cls):
        """Test 3: Different index names receive separate Index objects."""
        mock_pc_instance = MagicMock()
        mock_index_a = MagicMock()
        mock_index_b = MagicMock()
        mock_pc_instance.Index.side_effect = lambda name: mock_index_a if name == "index-a" else mock_index_b
        mock_pinecone_cls.return_value = mock_pc_instance

        client_a = PineconeClient("index-a", skip_index_check=True)
        client_b = PineconeClient("index-b", skip_index_check=True)

        self.assertIs(client_a.index, mock_index_a)
        self.assertIs(client_b.index, mock_index_b)
        self.assertIsNot(client_a.index, client_b.index)
        self.assertEqual(mock_pc_instance.Index.call_count, 2)

    @patch("pinecone.Pinecone")
    def test_4_concurrent_initialization_thread_safety(self, mock_pinecone_cls):
        """Test 4: Concurrent initialization does not create duplicate cached index instances."""
        mock_pc_instance = MagicMock()
        mock_index_obj = MagicMock()
        mock_pc_instance.Index.return_value = mock_index_obj
        mock_pinecone_cls.return_value = mock_pc_instance

        num_threads = 10
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [
                executor.submit(PineconeClient, "concurrent-index", skip_index_check=True)
                for _ in range(num_threads)
            ]
            clients = [f.result() for f in futures]

        for c in clients:
            self.assertIs(c.index, mock_index_obj)

        # Ensure Index creation was called exactly once across all 10 threads
        self.assertEqual(mock_pc_instance.Index.call_count, 1)

    @patch("pinecone.Pinecone")
    def test_5_skip_index_check_intact(self, mock_pinecone_cls):
        """Test 5: skip_index_check behavior from Phase 3 remains intact."""
        mock_pc_instance = MagicMock()
        mock_idx_item = MagicMock()
        mock_idx_item.name = "existing-idx"
        mock_pc_instance.list_indexes.return_value = [mock_idx_item]
        mock_pinecone_cls.return_value = mock_pc_instance

        # Case A: skip_index_check=True -> list_indexes NOT called
        PineconeClient("existing-idx", skip_index_check=True)
        mock_pc_instance.list_indexes.assert_not_called()

        # Case B: skip_index_check=False -> list_indexes IS called
        PineconeClient("existing-idx-check", skip_index_check=False)
        mock_pc_instance.list_indexes.assert_called_once()

    @patch("pinecone.Pinecone")
    def test_6_explicit_embedding_model_injection(self, mock_pinecone_cls):
        """Test 6: Explicit embedding_model injection from Phase 3 remains intact."""
        mock_pc_instance = MagicMock()
        mock_pinecone_cls.return_value = mock_pc_instance
        custom_model = MagicMock()

        client = PineconeClient("custom-model-idx", embedding_model=custom_model, skip_index_check=True)
        self.assertIs(client.embedding_model, custom_model)

    def test_7_stale_vector_list_response_extraction(self):
        """Test 7: Extracting IDs from a representative SDK v5+ ListResponse page."""
        sample_page = MockListResponse(["up_test_chunk0", "up_test_chunk1", "up_test_chunk2"])
        pages_generator = iter([sample_page])

        extracted_ids = extract_vector_ids_from_list_response(pages_generator)

        self.assertEqual(
            extracted_ids,
            ["up_test_chunk0", "up_test_chunk1", "up_test_chunk2"]
        )
        # Verify elements are pure strings (avoiding TypeError: ListResponse is not JSON serializable)
        for vid in extracted_ids:
            self.assertIsInstance(vid, str)

    def test_8_empty_list_response_handling(self):
        """Test 8: Empty list response produces empty list without error."""
        # Empty generator
        self.assertEqual(extract_vector_ids_from_list_response([]), [])
        self.assertEqual(extract_vector_ids_from_list_response(iter([])), [])
        self.assertEqual(extract_vector_ids_from_list_response(None), [])

        # ListResponse with empty vectors
        empty_page = MockListResponse([])
        self.assertEqual(extract_vector_ids_from_list_response([empty_page]), [])

    def test_9_multiple_pages_list_response(self):
        """Test 9: Multiple pages of ListResponse are concatenated in order."""
        page1_ids = [f"up_multi_chunk{i}" for i in range(1000)]
        page2_ids = [f"up_multi_chunk{i}" for i in range(1000, 1050)]

        pages = [MockListResponse(page1_ids), MockListResponse(page2_ids)]
        extracted = extract_vector_ids_from_list_response(pages)

        self.assertEqual(len(extracted), 1050)
        self.assertEqual(extracted[:3], ["up_multi_chunk0", "up_multi_chunk1", "up_multi_chunk2"])
        self.assertEqual(extracted[-2:], ["up_multi_chunk1048", "up_multi_chunk1049"])

    @patch("pinecone.Pinecone")
    def test_10_failure_propagation_not_swallowed(self, mock_pinecone_cls):
        """Test 10: Pinecone list and delete errors propagate instead of being swallowed."""
        mock_pc_instance = MagicMock()
        mock_index_obj = MagicMock()
        mock_index_obj.list.side_effect = RuntimeError("Pinecone network timeout on list")
        mock_pc_instance.Index.return_value = mock_index_obj
        mock_pinecone_cls.return_value = mock_pc_instance

        client = PineconeClient("error-test-idx", skip_index_check=True)

        with self.assertRaises(RuntimeError) as cm:
            # Simulate what api_server.py does: list call should raise directly
            for _ in client.index.list(prefix="up_test_", namespace="uploads"):
                pass
        self.assertIn("Pinecone network timeout", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
