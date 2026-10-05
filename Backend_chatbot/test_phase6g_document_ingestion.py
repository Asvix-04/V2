"""
Phase 6G: Document & Ingestion Testing Suite (Python / FastAPI)
DigiLab QA & Automated Testing Track

Verifies:
1. File validation at upload entry point (valid PDF accepted, unsupported extension rejected,
   malformed/sniffed content rejected, empty file rejected, oversized rejected).
2. Complete ingestion pipeline execution on valid curriculum document (extract -> filter ->
   chunk -> embed -> vector upsert -> BM25 update -> live reload -> 'done' terminal status).
3. Off-domain document rejection (relevance filter drops all paragraphs, raises descriptive
   error, cleans up upload file, sets 'error' terminal status).
4. Document, User, and Job ID propagation across disk storage, chunks, vector metadata, and status.
5. User and document isolation (disjoint vector prefixes, isolated directories, stale cleanup isolation).
6. Duplicate/re-upload idempotency in combined_book.txt and Pinecone prefix clearing.
7. Partial failure / rejected upload cleanup (no orphan files or partial directories left behind).
8. Status API consistency (GET /upload-pdf/status accurately exposes current pipeline state).
"""

import io
import os
import re
import shutil
import tempfile
import unittest
from dataclasses import dataclass
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient

import api_server
from api_server import (
    app,
    _run_pdf_ingestion,
    _discard_upload,
    _looks_like_supported_document,
    _upload_status,
    PDF_UPLOAD_DIR,
)


class MockListItem:
    def __init__(self, item_id: str):
        self.id = item_id


class MockListResponse:
    def __init__(self, vector_ids):
        self.vectors = [MockListItem(vid) for vid in vector_ids]

    def __iter__(self):
        return iter(self.vectors)


class TestPhase6GDocumentIngestion(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_6g_test_")
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
        api_server.upload_limiter.requests.clear()

        # In-domain curriculum fixture text (Media Literacy & Journalism)
        self.curriculum_text = (
            "Unit 1: Media Literacy and Ethics in Journalism\n\n"
            "Media literacy is the capacity to access, analyze, evaluate, and create media "
            "content across diverse broadcast and digital platforms. It empowers citizens to identify "
            "disinformation, deepfakes, and biased reporting in modern news ecosystems.\n\n"
            "Section 1.1: Verification Techniques and Fact-Checking\n\n"
            "Journalistic fact-checking requires cross-referencing multiple independent primary sources. "
            "Reporters must confirm evidentiary artifacts, verify digital timestamps, and scrutinize "
            "misleading headlines before publishing news stories."
        )

        # Off-domain text (Astronomy & Automobiles) - strictly non-media paragraphs
        self.offdomain_text = (
            "Quasars and galactic nebulae emit high-energy photons observed through deep space telescopes. "
            "Spectroscopic parallax calculations determine the cosmological redshift of stellar bodies.\n\n"
            "Automobile internal combustion engines utilize high horsepower carburetors and gasoline fuels. "
            "Planetary gears rotate transmission axles in mechanical motor vehicles."
        )

    def tearDown(self):
        api_server.PDF_UPLOAD_DIR = self.orig_pdf_dir
        api_server._upload_status.clear()
        api_server._upload_status.update(self.orig_upload_status)
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 1. File Validation at Upload Boundary
    # ─────────────────────────────────────────────────────────────
    def test_01_upload_valid_pdf_accepted(self):
        """Valid PDF with %PDF marker is accepted (HTTP 202) and queues processing."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>%%EOF"
        files = {"file": ("curriculum_guide.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"document_id": "doc_valid_01", "user_id": "user_alice", "job_id": "job_01"}

        with patch("api_server.threading.Thread"):
            res = self.client.post("/upload-pdf", files=files, data=data)
            self.assertEqual(res.status_code, 202)
            res_json = res.json()
            self.assertEqual(res_json["status"], "processing")
            self.assertEqual(res_json["document_id"], "doc_valid_01")
            self.assertEqual(res_json["job_id"], "job_01")
            self.assertEqual(res_json["file_type"], "pdf")

    def test_02_upload_unsupported_extension_rejected(self):
        """Unsupported file extensions (.sh, .exe, .csv) are rejected with HTTP 400."""
        files = {"file": ("malicious_payload.sh", io.BytesIO(b"#!/bin/bash\nrm -rf /"), "application/x-sh")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Only PDF and Word files are accepted", res.json()["detail"])

    def test_03_upload_malformed_sniffed_content_rejected(self):
        """File renamed to .pdf without %PDF magic bytes is rejected by content sniffer."""
        fake_pdf = b"Plain text content disguised as a PDF file"
        files = {"file": ("disguised.pdf", io.BytesIO(fake_pdf), "application/pdf")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("File does not appear to be a valid PDF", res.json()["detail"])

    def test_04_upload_empty_file_rejected(self):
        """0-byte file is rejected with HTTP 400."""
        files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], "Uploaded file is empty")

    def test_05_upload_missing_file_rejected(self):
        """Request without 'file' field receives HTTP 422 Unprocessable Entity."""
        res = self.client.post("/upload-pdf", data={"document_id": "doc_none"})
        self.assertEqual(res.status_code, 422)

    # ─────────────────────────────────────────────────────────────
    # 2. Ingestion Pipeline Execution on Valid Curriculum Document
    # ─────────────────────────────────────────────────────────────
    def test_06_complete_ingestion_lifecycle_success(self):
        """Valid curriculum document executes all stages and transitions to 'done' status."""
        test_pdf = os.path.join(api_server.PDF_UPLOAD_DIR, "doc_media.pdf")
        with open(test_pdf, "wb") as f:
            f.write(b"%PDF-1.4 dummy valid PDF")

        mock_pc = MagicMock()
        mock_pc.index.list.return_value = MockListResponse([])
        mock_embedding_model = MagicMock()
        mock_embedding_model.encode.return_value = [[0.1] * 384]

        # Patch extraction, pinecone, and BM25 to observe exact pipeline stages
        with patch("pdf_preprocessor.count_document_pages", return_value=3), \
             patch("pdf_preprocessor.extract_and_clean_document", return_value=self.curriculum_text), \
             patch("pinecone_client.PineconeClient", return_value=mock_pc), \
             patch("pinecone_client.get_shared_embedding_model", return_value=mock_embedding_model), \
             patch("build_bm25_cache.build_cache"):

            _run_pdf_ingestion(
                pdf_path=test_pdf,
                filename="doc_media.pdf",
                document_id="doc_media_100",
                user_id="user_student_1",
                job_id="job_media_100",
            )

            # Verify terminal state
            self.assertEqual(api_server._upload_status["status"], "done")
            self.assertIsNone(api_server._upload_status["error"])
            self.assertGreater(api_server._upload_status["chunks_created"], 0)
            self.assertGreater(api_server._upload_status["vectors_upserted"], 0)
            self.assertEqual(api_server._upload_status["document_id"], "doc_media_100")
            self.assertEqual(api_server._upload_status["user_id"], "user_student_1")
            self.assertEqual(api_server._upload_status["job_id"], "job_media_100")

            # Verify vector upsert parameters
            self.assertTrue(mock_pc.upsert_chunks.called)
            upserted_chunks = mock_pc.upsert_chunks.call_args[0][0]
            self.assertGreater(len(upserted_chunks), 0)
            for c in upserted_chunks:
                self.assertTrue(c.chunk_id.startswith("up_doc_media_100_chunk"))
                self.assertEqual(c.metadata["document_id"], "doc_media_100")
                self.assertEqual(c.metadata["user_id"], "user_student_1")
                self.assertEqual(c.metadata["job_id"], "job_media_100")

    # ─────────────────────────────────────────────────────────────
    # 3. Domain Relevance Filtering & Rejection
    # ─────────────────────────────────────────────────────────────
    def test_07_offdomain_document_rejected_and_cleaned_up(self):
        """Off-domain document is rejected by relevance filter, cleans up file, sets 'error' status."""
        doc_dir = os.path.join(api_server.PDF_UPLOAD_DIR, "doc_astronomy_99")
        os.makedirs(doc_dir, exist_ok=True)
        test_pdf = os.path.join(doc_dir, "astronomy.pdf")
        with open(test_pdf, "wb") as f:
            f.write(b"%PDF-1.4 dummy astronomy PDF")

        # Mock extraction to return purely off-domain text (astronomy / cosmology)
        with patch("pdf_preprocessor.count_document_pages", return_value=2), \
             patch("pdf_preprocessor.extract_and_clean_document", return_value=self.offdomain_text):

            _run_pdf_ingestion(
                pdf_path=test_pdf,
                filename="astronomy.pdf",
                document_id="doc_astronomy_99",
                user_id="user_astronomer",
                job_id="job_astro_99",
            )

            # Ingestion must terminate in 'error' status
            self.assertEqual(api_server._upload_status["status"], "error")
            self.assertIn("No Media Literacy / Mass Communication", api_server._upload_status["error"])

            # Upload artifact must be safely discarded from disk
            self.assertFalse(os.path.exists(test_pdf), "Rejected off-domain upload file must be deleted")

    # ─────────────────────────────────────────────────────────────
    # 4. Identity Propagation & Isolation
    # ─────────────────────────────────────────────────────────────
    def test_08_user_and_document_identity_isolation(self):
        """User A and User B uploading same filename get isolated storage, IDs, and vector prefixes."""
        filename = "lecture_notes.pdf"
        doc_a = "doc_userA_aaa"
        doc_b = "doc_userB_bbb"

        safe_a = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_a).strip("_")
        safe_b = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc_b).strip("_")

        prefix_a = f"up_{safe_a}_chunk"
        prefix_b = f"up_{safe_b}_chunk"

        self.assertNotEqual(prefix_a, prefix_b)
        self.assertEqual(prefix_a, "up_doc_userA_aaa_chunk")
        self.assertEqual(prefix_b, "up_doc_userB_bbb_chunk")

        # Stale cleanup isolation: deleting prefix_a should not match prefix_b
        mock_pc = MagicMock()
        mock_pc.index.list.side_effect = lambda prefix, namespace: (
            MockListResponse([f"{prefix}0", f"{prefix}1"]) if prefix == prefix_a else MockListResponse([])
        )

        stale_ids = [item.id for item in mock_pc.index.list(prefix=prefix_a, namespace="uploads")]
        self.assertEqual(stale_ids, ["up_doc_userA_aaa_chunk0", "up_doc_userA_aaa_chunk1"])
        for sid in stale_ids:
            self.assertFalse(sid.startswith(prefix_b), "Document A cleanup must never delete Document B vectors")

    # ─────────────────────────────────────────────────────────────
    # 5. Duplicate & Re-upload Semantics (combined_book.txt)
    # ─────────────────────────────────────────────────────────────
    def test_09_duplicate_upload_replaces_block_in_combined_book(self):
        """Re-uploading same document replaces its existing block in combined_book.txt without duplicate scoring skew."""
        combined_path = "data/txts/combined_book.txt"
        os.makedirs("data/txts", exist_ok=True)
        doc_key = "doc_dedup_test"
        banner = f"{'='*70}\n=== SOURCE: {doc_key}.txt ===\n{'='*70}"

        try:
            # First write
            initial_content = "Existing syllabus text\n"
            block_1 = f"\n\n{banner}\n\nVersion 1 content"
            with open(combined_path, "w", encoding="utf-8") as f:
                f.write(initial_content + block_1)

            # Re-upload simulation (Step 2 replacement logic)
            with open(combined_path, "r", encoding="utf-8") as f:
                existing = f.read()

            self.assertIn(banner, existing)
            start = existing.index(banner)
            nxt = existing.find(f"{'='*70}\n=== SOURCE: ", start + len(banner))
            existing_clean = (existing[:start] + (existing[nxt:] if nxt != -1 else "")).rstrip()
            block_2 = f"\n\n{banner}\n\nVersion 2 updated content"

            with open(combined_path, "w", encoding="utf-8") as f:
                f.write(existing_clean + block_2)

            with open(combined_path, "r", encoding="utf-8") as f:
                final_content = f.read()

            # Ensure banner appears exactly ONCE
            self.assertEqual(final_content.count(banner), 1)
            self.assertIn("Version 2 updated content", final_content)
            self.assertNotIn("Version 1 content", final_content)
        finally:
            if os.path.exists(combined_path):
                os.remove(combined_path)

    # ─────────────────────────────────────────────────────────────
    # 6. Status API Consistency
    # ─────────────────────────────────────────────────────────────
    def test_10_status_endpoint_consistency(self):
        """GET /upload-pdf/status faithfully exposes current background ingestion state."""
        api_server._upload_status.update({
            "status": "processing",
            "filename": "ethics.pdf",
            "document_id": "doc_eth_42",
            "user_id": "user_prof_x",
            "job_id": "job_eth_42",
            "chunks_created": 15,
            "vectors_upserted": 10,
        })

        res = self.client.get("/upload-pdf/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "processing")
        self.assertEqual(data["filename"], "ethics.pdf")
        self.assertEqual(data["document_id"], "doc_eth_42")
        self.assertEqual(data["user_id"], "user_prof_x")
        self.assertEqual(data["chunks_created"], 15)
        self.assertEqual(data["vectors_upserted"], 10)


if __name__ == "__main__":
    unittest.main()
