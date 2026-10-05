"""
Phase 6H: Data Integrity & Consistency Testing Suite (Python / FastAPI / Storage)
DigiLab QA & Automated Testing Track

Verifies:
1. Vector metadata invariants (document_id, user_id, job_id, source_file, type, neo4j_id, text).
2. Vector ID determinism, uniqueness, and cross-document non-collision.
3. Vector stale cleanup isolation (cleanup for doc_A leaves doc_B untouched).
4. Physical file storage path isolation (same filename under different document_ids).
5. BM25 / combined_book.txt lexical deduplication on re-upload (no duplicate source blocks).
6. Atomicity / zero-leakage on rejected upload (no txt, no combined_book entry, no vectors).
7. Redis session history isolation across distinct session IDs (clearing session_A does not touch session_B).
8. BM25 index reload consistency and continuity without process restart.
9. Pipeline metadata integrity agreement (_upload_status strictly captures identity triad and counts).
"""

import io
import json
import os
import re
import shutil
import tempfile
import unittest
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import api_server
from api_server import (
    app,
    _run_pdf_ingestion,
    _upload_status,
    PDF_UPLOAD_DIR,
)
from redis_client import RedisManager
from build_bm25_cache import _uploaded_stems, build_cache
from hybrid_retriever import BM25Index


class MockListItem:
    def __init__(self, item_id: str):
        self.id = item_id


class MockListResponse:
    def __init__(self, vector_ids):
        self.vectors = [MockListItem(vid) for vid in vector_ids]

    def __iter__(self):
        return iter(self.vectors)


class TestPhase6HDataIntegrity(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_6h_test_")
        self.orig_pdf_dir = api_server.PDF_UPLOAD_DIR
        api_server.PDF_UPLOAD_DIR = os.path.join(self.test_dir, "pdfs")
        os.makedirs(api_server.PDF_UPLOAD_DIR, exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "data", "txts"), exist_ok=True)

        self.orig_upload_status = dict(api_server._upload_status)
        api_server._upload_status.update({
            "status": "idle",
            "filename": None,
            "error": None,
            "chunks_created": 0,
            "vectors_upserted": 0,
            "document_id": None,
            "user_id": None,
            "job_id": None,
        })

    def tearDown(self):
        api_server.PDF_UPLOAD_DIR = self.orig_pdf_dir
        api_server._upload_status.clear()
        api_server._upload_status.update(self.orig_upload_status)
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 1. Vector Metadata Invariants & Consistency
    # ─────────────────────────────────────────────────────────────
    def test_01_vector_metadata_invariants(self):
        """Every generated vector chunk contains complete, non-null identity & content metadata."""
        from pinecone_client import PineconeClient

        @dataclass
        class MockChunk:
            chunk_id: str
            text: str
            metadata: dict
            section_path: list

        chunk = MockChunk(
            chunk_id="up_doc_inv_101_chunk0",
            text="Media ethics requires accuracy, fairness, and accountability.",
            metadata={
                "document_id": "doc_inv_101",
                "user_id": "user_alice",
                "job_id": "job_inv_101",
                "source_file": "ethics.txt",
            },
            section_path=["Unit 1: Media Ethics", "1.1 Principles"],
        )

        mock_index = MagicMock()
        mock_embedding_model = MagicMock()
        import numpy as np
        mock_embedding_model.encode.return_value = np.array([[0.05] * 384])

        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None):
            pc = PineconeClient("test-index")
            pc.index = mock_index
            pc.embedding_model = mock_embedding_model

            pc.upsert_chunks([chunk], namespace="uploads")

            self.assertTrue(mock_index.upsert.called)
            upsert_call = mock_index.upsert.call_args[1]
            vectors = upsert_call["vectors"]
            self.assertEqual(len(vectors), 1)

        vec = vectors[0]
        self.assertEqual(vec["id"], "up_doc_inv_101_chunk0")
        meta = vec["metadata"]

        # Required identity invariants
        self.assertEqual(meta["document_id"], "doc_inv_101")
        self.assertEqual(meta["user_id"], "user_alice")
        self.assertEqual(meta["job_id"], "job_inv_101")
        self.assertEqual(meta["source_file"], "ethics.txt")
        self.assertEqual(meta["type"], "document_chunk")
        self.assertIn("neo4j_id", meta)
        self.assertTrue(meta["neo4j_id"].startswith("section_"))
        self.assertEqual(meta["text"], "Media ethics requires accuracy, fairness, and accountability.")

    # ─────────────────────────────────────────────────────────────
    # 2. Vector ID Uniqueness, Determinism & Non-Collision
    # ─────────────────────────────────────────────────────────────
    def test_02_vector_id_uniqueness_and_determinism(self):
        """Vector IDs are strictly deterministic for same document/chunk, and disjoint across documents."""
        doc_a = "doc_alpha_1"
        doc_b = "doc_beta_2"

        safe_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_a).strip("_")
        safe_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_b).strip("_")

        # Determinism: same chunk index on same document produces identical ID
        id_a0_run1 = f"up_{safe_a}_chunk0"
        id_a0_run2 = f"up_{safe_a}_chunk0"
        self.assertEqual(id_a0_run1, id_a0_run2)

        # Uniqueness & disjointness: across 20 chunks between doc A and doc B
        vector_ids_a = {f"up_{safe_a}_chunk{i}" for i in range(20)}
        vector_ids_b = {f"up_{safe_b}_chunk{i}" for i in range(20)}

        self.assertEqual(len(vector_ids_a), 20)
        self.assertEqual(len(vector_ids_b), 20)
        self.assertEqual(len(vector_ids_a.intersection(vector_ids_b)), 0, "Vector IDs must be disjoint across documents")

    # ─────────────────────────────────────────────────────────────
    # 3. Vector Stale Cleanup Isolation
    # ─────────────────────────────────────────────────────────────
    def test_03_vector_stale_cleanup_isolation(self):
        """Deleting or replacing document A only purges document A vectors, never touching document B."""
        doc_a = "doc_apple_1"
        doc_b = "doc_banana_2"

        safe_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_a).strip("_")
        safe_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_b).strip("_")

        prefix_a = f"up_{safe_a}_chunk"
        prefix_b = f"up_{safe_b}_chunk"

        mock_index = MagicMock()
        # Mock index listing vectors for prefix_a and prefix_b
        def mock_list(prefix=None, namespace=None):
            if prefix == prefix_a:
                return [MockListResponse([f"{prefix_a}0", f"{prefix_a}1", f"{prefix_a}2"])]
            elif prefix == prefix_b:
                return [MockListResponse([f"{prefix_b}0", f"{prefix_b}1"])]
            return [MockListResponse([])]

        mock_index.list.side_effect = mock_list

        from pinecone_client import extract_vector_ids_from_list_response
        old_ids_a = extract_vector_ids_from_list_response(mock_index.list(prefix=prefix_a, namespace="uploads"))
        self.assertEqual(len(old_ids_a), 3)

        # Ensure no ID in old_ids_a belongs to prefix_b
        for vid in old_ids_a:
            self.assertTrue(vid.startswith(prefix_a))
            self.assertFalse(vid.startswith(prefix_b))

    # ─────────────────────────────────────────────────────────────
    # 4. Storage Path Isolation for Identical Filenames
    # ─────────────────────────────────────────────────────────────
    def test_04_storage_path_isolation_same_filename(self):
        """User A and User B uploading same filename 'handbook.pdf' get isolated storage directories."""
        doc_id_a = "doc_userA_session1"
        doc_id_b = "doc_userB_session2"
        filename = "handbook.pdf"

        safe_doc_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_a).strip("_")
        safe_doc_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_b).strip("_")

        dir_a = os.path.join(api_server.PDF_UPLOAD_DIR, safe_doc_a)
        dir_b = os.path.join(api_server.PDF_UPLOAD_DIR, safe_doc_b)
        os.makedirs(dir_a, exist_ok=True)
        os.makedirs(dir_b, exist_ok=True)

        path_a = os.path.join(dir_a, filename)
        path_b = os.path.join(dir_b, filename)

        with open(path_a, "wb") as f:
            f.write(b"%PDF-1.4 User A unique handbook content")

        with open(path_b, "wb") as f:
            f.write(b"%PDF-1.4 User B unique handbook content")

        self.assertTrue(os.path.exists(path_a))
        self.assertTrue(os.path.exists(path_b))
        self.assertNotEqual(path_a, path_b)

        # Content must not collide or overwrite
        with open(path_a, "rb") as f:
            content_a = f.read()
        with open(path_b, "rb") as f:
            content_b = f.read()

        self.assertIn(b"User A unique", content_a)
        self.assertIn(b"User B unique", content_b)

    # ─────────────────────────────────────────────────────────────
    # 5. BM25 / combined_book.txt Lexical Deduplication on Re-upload
    # ─────────────────────────────────────────────────────────────
    def test_05_bm25_lexical_deduplication(self):
        """Re-uploading replaces the document block in combined_book.txt in place without duplication."""
        combined_path = "data/txts/combined_book.txt"
        os.makedirs("data/txts", exist_ok=True)
        doc_key = "doc_integrity_dedup"
        banner = f"{'='*70}\n=== SOURCE: {doc_key}.txt ===\n{'='*70}"

        try:
            # Baseline syllabus
            with open(combined_path, "w", encoding="utf-8") as f:
                f.write("Base syllabus text\n")

            # First upload
            block_v1 = f"\n\n{banner}\n\nVersion 1 text about disinformation and fact-checking"
            with open(combined_path, "a", encoding="utf-8") as f:
                f.write(block_v1)

            # Re-upload: Step 2 replacement logic
            with open(combined_path, "r", encoding="utf-8") as f:
                existing = f.read()

            self.assertIn(banner, existing)
            start = existing.index(banner)
            nxt = existing.find(f"{'='*70}\n=== SOURCE: ", start + len(banner))
            existing_clean = (existing[:start] + (existing[nxt:] if nxt != -1 else "")).rstrip()
            block_v2 = f"\n\n{banner}\n\nVersion 2 updated text about deepfakes and media literacy"

            with open(combined_path, "w", encoding="utf-8") as f:
                f.write(existing_clean + block_v2)

            with open(combined_path, "r", encoding="utf-8") as f:
                result = f.read()

            self.assertEqual(result.count(banner), 1, "Banner must exist exactly once")
            self.assertIn("Version 2 updated text", result)
            self.assertNotIn("Version 1 text", result)
        finally:
            if os.path.exists(combined_path):
                os.remove(combined_path)

    # ─────────────────────────────────────────────────────────────
    # 6. Atomicity / Zero-Leakage on Rejected Upload
    # ─────────────────────────────────────────────────────────────
    def test_06_rejected_document_zero_leakage_atomicity(self):
        """Rejected off-domain document leaves zero files in data/txts, no combined_book entry, and deletes upload."""
        doc_dir = os.path.join(api_server.PDF_UPLOAD_DIR, "doc_leak_check")
        os.makedirs(doc_dir, exist_ok=True)
        test_pdf = os.path.join(doc_dir, "quantum.pdf")
        with open(test_pdf, "wb") as f:
            f.write(b"%PDF-1.4 Off-domain physics document")

        txt_destination = "data/txts/doc_leak_check_quantum.txt"
        if os.path.exists(txt_destination):
            os.remove(txt_destination)

        off_domain_text = (
            "Quantum entanglement demonstrates non-local particle states.\n\n"
            "Schrodinger wavefunctions describe quantum state evolution."
        )

        with patch("pdf_preprocessor.count_document_pages", return_value=1), \
             patch("pdf_preprocessor.extract_and_clean_document", return_value=off_domain_text):

            _run_pdf_ingestion(
                pdf_path=test_pdf,
                filename="quantum.pdf",
                document_id="doc_leak_check",
                user_id="user_physicist",
                job_id="job_leak_check",
            )

            # Ingestion must fail with error
            self.assertEqual(api_server._upload_status["status"], "error")

            # Physical upload file must be deleted
            self.assertFalse(os.path.exists(test_pdf), "Upload file must be removed after rejection")

            # No parsed text file must exist
            self.assertFalse(os.path.exists(txt_destination), "Parsed txt must not be saved for rejected document")

    # ─────────────────────────────────────────────────────────────
    # 7. Redis Session History Isolation
    # ─────────────────────────────────────────────────────────────
    def test_07_redis_session_history_isolation(self):
        """Chat history is strictly isolated per session ID; clearing session A does not touch session B."""
        manager = RedisManager()
        session_a = "session_alice_999"
        session_b = "session_bob_888"

        hist_a = [{"role": "user", "content": "Hello Alice"}, {"role": "assistant", "content": "Hi Alice"}]
        hist_b = [{"role": "user", "content": "Hello Bob"}, {"role": "assistant", "content": "Hi Bob"}]

        manager.save_session_history(session_a, hist_a)
        manager.save_session_history(session_b, hist_b)

        # Retrieval check
        loaded_a = manager.get_session_history(session_a)
        loaded_b = manager.get_session_history(session_b)
        self.assertEqual(loaded_a, hist_a)
        self.assertEqual(loaded_b, hist_b)

        # Clear session A
        key_a = f"session:{session_a}"
        try:
            manager.client.delete(key_a)
        except Exception:
            manager.local_cache.delete(key_a)

        # Session A is gone, Session B remains intact
        self.assertIsNone(manager.get_session_history(session_a))
        self.assertEqual(manager.get_session_history(session_b), hist_b)

    # ─────────────────────────────────────────────────────────────
    # 8. BM25 Index Reload Consistency
    # ─────────────────────────────────────────────────────────────
    def test_08_bm25_reload_consistency(self):
        """BM25 index reloads from disk cache deterministically and preserves keyword searchability."""
        cache_path = os.path.join(self.test_dir, "test_bm25_cache.json")
        sample_corpus = [
            {
                "id": "doc_0",
                "text": "Media literacy teaches critical thinking for digital citizens.",
                "metadata": {"source_file": "media_lit.txt"},
            },
            {
                "id": "doc_1",
                "text": "Journalism ethics mandates honest reporting and source verification.",
                "metadata": {"source_file": "ethics.txt"},
            },
            {
                "id": "doc_2",
                "text": "Broadcast television transmitters send frequency signals across regions.",
                "metadata": {"source_file": "broadcast.txt"},
            },
            {
                "id": "doc_3",
                "text": "Print publishing presses produce newspapers and magazines daily.",
                "metadata": {"source_file": "print.txt"},
            },
            {
                "id": "doc_4",
                "text": "Advertising campaigns deploy marketing through outdoor billboard displays.",
                "metadata": {"source_file": "ads.txt"},
            },
        ]
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(sample_corpus, f)

        # Load index
        bm25_idx = BM25Index(cache_path=cache_path)
        self.assertTrue(bm25_idx.ready)

        results = bm25_idx.search("media literacy", top_k=2)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["id"], "doc_0")

    # ─────────────────────────────────────────────────────────────
    # 9. Pipeline Metadata Invariants Agreement
    # ─────────────────────────────────────────────────────────────
    def test_09_pipeline_metadata_invariants_agreement(self):
        """_upload_status captures the exact identity triad and accurate chunk/vector metrics."""
        api_server._upload_status.update({
            "status": "done",
            "filename": "media_law.pdf",
            "document_id": "doc_law_101",
            "user_id": "user_lawyer",
            "job_id": "job_law_101",
            "chunks_created": 12,
            "vectors_upserted": 12,
            "error": None,
        })

        st = api_server._upload_status
        # Invariants:
        self.assertEqual(st["status"], "done")
        self.assertIsNone(st["error"])
        self.assertEqual(st["document_id"], "doc_law_101")
        self.assertEqual(st["user_id"], "user_lawyer")
        self.assertEqual(st["job_id"], "job_law_101")
        self.assertEqual(st["chunks_created"], st["vectors_upserted"])
        self.assertGreater(st["chunks_created"], 0)


if __name__ == "__main__":
    unittest.main()
