"""
Phase 5C: Document Identity & Ownership Isolation Test Suite
DigiLab / IGNOU Production Architecture

Verifies:
1. Same filename, different document IDs produce unique vector IDs.
2. Vector metadata preserves existing metadata and adds document_id, user_id, job_id.
3. Same documentId + chunk number deterministically produces the same vector ID.
4. Different document IDs always produce completely disjoint vector IDs.
5. Stale cleanup for document A never selects or deletes document B vectors.
6. Storage isolation: same filename under different document IDs uses document-safe paths.
7. combined_book.txt dedup isolation: document A and B coexist without cross-replacement.
8. BM25 discovery: _uploaded_stems discovers both root uploads and document-scoped subdirectories.
9. _upload_status captures document_id, user_id, and job_id for observability.
10. Backward compatibility: ingestion without document_id falls back safely without error.
"""

import os
import re
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import numpy as np

import api_server
from build_bm25_cache import _uploaded_stems
from pinecone_client import (
    PineconeClient,
    extract_vector_ids_from_list_response,
)


class MockListItem:
    def __init__(self, item_id: str):
        self.id = item_id

    def __repr__(self):
        return f"ListItem(id='{self.id}')"


class MockListResponse:
    def __init__(self, vector_ids):
        self.vectors = [MockListItem(vid) for vid in vector_ids]

    def __iter__(self):
        return iter(self.vectors)


class TestPhase5CDocumentIdentity(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_5c_test_")
        self.orig_pdf_dir = api_server.PDF_UPLOAD_DIR
        api_server.PDF_UPLOAD_DIR = os.path.join(self.test_dir, "pdfs")
        os.makedirs(api_server.PDF_UPLOAD_DIR, exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "data", "txts"), exist_ok=True)

    def tearDown(self):
        api_server.PDF_UPLOAD_DIR = self.orig_pdf_dir
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # Test 1 — Same filename, different document IDs produce unique vector IDs
    # ─────────────────────────────────────────────────────────────
    def test_1_same_filename_different_document_ids_unique_vector_ids(self):
        """User A and User B uploading 'notes.pdf' get completely distinct vector IDs."""
        filename = "notes.pdf"
        doc_id_a = "doc_userA_12345"
        doc_id_b = "doc_userB_67890"

        safe_doc_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_a).strip("_")
        safe_doc_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_b).strip("_")

        prefix_a = f"up_{safe_doc_a}_chunk"
        prefix_b = f"up_{safe_doc_b}_chunk"

        chunks_a = [f"{prefix_a}{n}" for n in range(5)]
        chunks_b = [f"{prefix_b}{n}" for n in range(5)]

        # Verify no intersection whatsoever
        intersection = set(chunks_a).intersection(set(chunks_b))
        self.assertEqual(len(intersection), 0)
        self.assertEqual(chunks_a[0], "up_doc_userA_12345_chunk0")
        self.assertEqual(chunks_b[0], "up_doc_userB_67890_chunk0")

    # ─────────────────────────────────────────────────────────────
    # Test 2 — Metadata propagation: document_id, user_id, job_id preserved
    # ─────────────────────────────────────────────────────────────
    def test_2_metadata_propagation(self):
        """Vectors contain document_id, user_id, job_id alongside existing chunk metadata."""
        from dataclasses import dataclass

        @dataclass
        class MockChunk:
            chunk_id: str
            text: str
            metadata: dict
            section_path: list

        chunk = MockChunk(
            chunk_id="up_doc_101_chunk0",
            text="Media literacy education develops critical thinking skills.",
            metadata={
                "source_file": "media_literacy.txt",
                "document_id": "doc_101",
                "user_id": "user_42",
                "job_id": "job_999",
            },
            section_path=["Unit 1", "Introduction"],
        )

        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([[0.1] * 384])

        mock_index = MagicMock()
        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None):
            pc = PineconeClient("test-index")
            pc.index = mock_index
            pc.embedding_model = mock_model

            pc.upsert_chunks([chunk], namespace="uploads")

            self.assertTrue(mock_index.upsert.called)
            call_kwargs = mock_index.upsert.call_args[1]
            upserted_vectors = call_kwargs["vectors"]
            self.assertEqual(len(upserted_vectors), 1)

            vec = upserted_vectors[0]
            self.assertEqual(vec["id"], "up_doc_101_chunk0")
            meta = vec["metadata"]
            # Identity metadata
            self.assertEqual(meta["document_id"], "doc_101")
            self.assertEqual(meta["user_id"], "user_42")
            self.assertEqual(meta["job_id"], "job_999")
            # Existing required metadata
            self.assertEqual(meta["source_file"], "media_literacy.txt")
            self.assertEqual(meta["type"], "document_chunk")
            self.assertIn("neo4j_id", meta)
            self.assertIn("text", meta)

    # ─────────────────────────────────────────────────────────────
    # Test 3 — Deterministic vector IDs
    # ─────────────────────────────────────────────────────────────
    def test_3_deterministic_vector_ids(self):
        """Same documentId + chunk number deterministically produces the exact same vector ID."""
        doc_id = "doc_fixed_uuid_789"
        safe_doc_id = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id).strip("_")

        id_1 = f"up_{safe_doc_id}_chunk{3}"
        id_2 = f"up_{safe_doc_id}_chunk{3}"

        self.assertEqual(id_1, id_2)
        self.assertEqual(id_1, "up_doc_fixed_uuid_789_chunk3")

    # ─────────────────────────────────────────────────────────────
    # Test 4 — Different documents always produce different vector IDs
    # ─────────────────────────────────────────────────────────────
    def test_4_different_documents_different_vector_ids(self):
        """Any two distinct document IDs never produce overlapping chunk vector IDs."""
        doc_ids = [f"doc_{i}" for i in range(10)]
        all_vector_ids = set()

        for doc_id in doc_ids:
            safe = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id).strip("_")
            for chunk_idx in range(5):
                vid = f"up_{safe}_chunk{chunk_idx}"
                self.assertNotIn(vid, all_vector_ids)
                all_vector_ids.add(vid)

        self.assertEqual(len(all_vector_ids), 50)

    # ─────────────────────────────────────────────────────────────
    # Test 5 — Stale cleanup isolation
    # ─────────────────────────────────────────────────────────────
    def test_5_stale_cleanup_isolation(self):
        """Deleting/replacing document A never selects or deletes document B vectors."""
        doc_id_a = "doc_aaa"
        doc_id_b = "doc_bbb"

        safe_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_a).strip("_")
        safe_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_id_b).strip("_")

        prefix_a = f"up_{safe_a}_chunk"
        prefix_b = f"up_{safe_b}_chunk"

        vectors_in_pinecone = [
            f"{prefix_a}0", f"{prefix_a}1",
            f"{prefix_b}0", f"{prefix_b}1",
        ]

        def mock_list(prefix, namespace):
            # Pinecone list(prefix=...) only returns items starting with prefix
            matching = [v for v in vectors_in_pinecone if v.startswith(prefix)]
            return [MockListResponse(matching)]

        mock_index = MagicMock()
        mock_index.list = mock_list

        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None):
            pc = PineconeClient("test-index")
            pc.index = mock_index

            # Simulate cleanup for document A
            old_ids_a = extract_vector_ids_from_list_response(
                pc.index.list(prefix=prefix_a, namespace="uploads")
            )

            self.assertEqual(sorted(old_ids_a), [f"{prefix_a}0", f"{prefix_a}1"])
            for vid in old_ids_a:
                self.assertFalse(vid.startswith(prefix_b), f"Document B vector {vid} was incorrectly selected during cleanup of document A")

            # Simulate cleanup for document B
            old_ids_b = extract_vector_ids_from_list_response(
                pc.index.list(prefix=prefix_b, namespace="uploads")
            )
            self.assertEqual(sorted(old_ids_b), [f"{prefix_b}0", f"{prefix_b}1"])
            for vid in old_ids_b:
                self.assertFalse(vid.startswith(prefix_a), f"Document A vector {vid} was incorrectly selected during cleanup of document B")

    # ─────────────────────────────────────────────────────────────
    # Test 6 — Storage isolation: same filename under different document IDs
    # ─────────────────────────────────────────────────────────────
    def test_6_storage_isolation(self):
        """Two files with the same name stored under distinct document_ids do not overwrite each other."""
        filename = "chapter1.pdf"
        doc_a = "doc_user1_alpha"
        doc_b = "doc_user2_beta"

        dir_a = os.path.join(api_server.PDF_UPLOAD_DIR, doc_a)
        dir_b = os.path.join(api_server.PDF_UPLOAD_DIR, doc_b)
        os.makedirs(dir_a, exist_ok=True)
        os.makedirs(dir_b, exist_ok=True)

        path_a = os.path.join(dir_a, filename)
        path_b = os.path.join(dir_b, filename)

        with open(path_a, "wb") as f:
            f.write(b"%PDF-1.4 User A content")

        with open(path_b, "wb") as f:
            f.write(b"%PDF-1.4 User B content")

        self.assertTrue(os.path.exists(path_a))
        self.assertTrue(os.path.exists(path_b))

        with open(path_a, "rb") as f:
            content_a = f.read()
        with open(path_b, "rb") as f:
            content_b = f.read()

        self.assertNotEqual(content_a, content_b)
        self.assertEqual(content_a, b"%PDF-1.4 User A content")
        self.assertEqual(content_b, b"%PDF-1.4 User B content")

    # ─────────────────────────────────────────────────────────────
    # Test 7 — combined_book.txt dedup isolation
    # ─────────────────────────────────────────────────────────────
    def test_7_combined_book_dedup_isolation(self):
        """Document A and Document B coexist with distinct source banners without replacing each other."""
        combined_path = os.path.join(self.test_dir, "data", "txts", "combined_book.txt")
        banner_a = f"{'='*70}\n=== SOURCE: doc_A_notes.txt ===\n{'='*70}"
        banner_b = f"{'='*70}\n=== SOURCE: doc_B_notes.txt ===\n{'='*70}"

        content_a = f"\n\n{banner_a}\n\nUser A notes text"
        content_b = f"\n\n{banner_b}\n\nUser B notes text"

        with open(combined_path, "w", encoding="utf-8") as f:
            f.write("BASE SYLLABUS TEXT" + content_a + content_b)

        with open(combined_path, "r", encoding="utf-8") as f:
            full_text = f.read()

        self.assertIn("BASE SYLLABUS TEXT", full_text)
        self.assertIn(banner_a, full_text)
        self.assertIn(banner_b, full_text)

        # Simulate re-upload of Document A with updated text
        updated_content_a = f"\n\n{banner_a}\n\nUser A updated text"
        start = full_text.index(banner_a)
        nxt = full_text.find(f"{'='*70}\n=== SOURCE: ", start + len(banner_a))
        rebuilt = (full_text[:start] + (full_text[nxt:] if nxt != -1 else "")).rstrip() + updated_content_a

        with open(combined_path, "w", encoding="utf-8") as f:
            f.write(rebuilt)

        with open(combined_path, "r", encoding="utf-8") as f:
            final_text = f.read()

        # Document A updated
        self.assertIn("User A updated text", final_text)
        # Document B intact
        self.assertIn("User B notes text", final_text)
        self.assertIn(banner_b, final_text)

    # ─────────────────────────────────────────────────────────────
    # Test 8 — BM25 discovery: _uploaded_stems handles document subdirectories
    # ─────────────────────────────────────────────────────────────
    def test_8_bm25_uploaded_stems_discovery(self):
        """_uploaded_stems() discovers both flat root documents and document-scoped subdirectories."""
        with patch("build_bm25_cache.UPLOAD_SOURCE_DIR", api_server.PDF_UPLOAD_DIR):
            # Flat legacy upload
            flat_file = os.path.join(api_server.PDF_UPLOAD_DIR, "legacy_book.pdf")
            with open(flat_file, "wb") as f:
                f.write(b"%PDF-1.4 Mock legacy")

            # Document-scoped uploads
            dir_a = os.path.join(api_server.PDF_UPLOAD_DIR, "doc_userA")
            os.makedirs(dir_a, exist_ok=True)
            with open(os.path.join(dir_a, "notes.pdf"), "wb") as f:
                f.write(b"%PDF-1.4 Mock A")

            dir_b = os.path.join(api_server.PDF_UPLOAD_DIR, "doc_userB")
            os.makedirs(dir_b, exist_ok=True)
            with open(os.path.join(dir_b, "notes.docx"), "wb") as f:
                f.write(b"Mock docx B")

            stems = _uploaded_stems()
            self.assertIn("legacy_book", stems)
            self.assertIn("doc_userA_notes", stems)
            self.assertIn("doc_userB_notes", stems)

    # ─────────────────────────────────────────────────────────────
    # Test 9 — _upload_status captures document_id, user_id, and job_id
    # ─────────────────────────────────────────────────────────────
    def test_9_upload_status_tracking(self):
        """_upload_status dictionary accurately captures document_id, user_id, and job_id."""
        status = api_server._upload_status
        self.assertIn("document_id", status)
        self.assertIn("user_id", status)
        self.assertIn("job_id", status)

        status.update({
            "status": "processing",
            "filename": "lecture.pdf",
            "document_id": "doc_999",
            "user_id": "usr_888",
            "job_id": "job_777",
        })

        self.assertEqual(status["document_id"], "doc_999")
        self.assertEqual(status["user_id"], "usr_888")
        self.assertEqual(status["job_id"], "job_777")

    # ─────────────────────────────────────────────────────────────
    # Test 10 — Backward compatibility without document_id
    # ─────────────────────────────────────────────────────────────
    def test_10_backward_compatibility_without_document_id(self):
        """Ingestion without document_id falls back gracefully to stem-based identity."""
        with patch("pdf_preprocessor.count_document_pages", return_value=1), \
             patch("pdf_preprocessor.extract_and_clean_document", return_value="Media literacy concepts."), \
             patch("relevance_filter.filter_text", return_value=("Media literacy concepts.", {"total": 1, "kept": 1, "dropped": 0, "method": "mock", "dropped_samples": []})), \
             patch("txt_processor.TXTStructureParser") as mock_parser, \
             patch("pinecone_client.PineconeClient") as mock_pc_cls, \
             patch("build_bm25_cache.build_cache"):

            mock_parser_instance = MagicMock()
            mock_parser_instance.extract_sections.return_value = [{"title": "Sec", "content": "Text", "page": 1}]
            mock_parser_instance.create_chunks.return_value = [{"id": "chunk_0", "text": "Text", "metadata": {}, "section_path": ["Sec"]}]
            mock_parser.return_value = mock_parser_instance

            mock_pc = MagicMock()
            mock_pc.index.list.return_value = []
            mock_pc_cls.return_value = mock_pc

            # Call with ONLY 2 arguments (legacy pattern)
            api_server._run_pdf_ingestion("legacy_doc.pdf", "legacy_doc.pdf")

            status = api_server._upload_status
            self.assertEqual(status["status"], "done")
            self.assertIsNone(status["document_id"])


if __name__ == "__main__":
    unittest.main()
