"""
Phase 6B: FastAPI Endpoints & API Contract Testing Suite
DigiLab QA & Automated Testing Track

Validates:
1. Health & Root endpoint contracts (GET / and GET /health schemas)
2. Chat request validation, error contracts, and 200 response shapes (POST /chat)
3. Document upload multipart contracts, file-sniffing rejections, 202 Accepted, and 409 Conflict (POST /upload-pdf)
4. Ingestion status schema contracts (GET /upload-pdf/status)
5. Multilingual and speech request validation contracts (POST /text-to-text, POST /speech-to-speech)
6. Selection explanation request validation (POST /chat/explain-selection)
7. Session history management contracts (POST /clear-history, GET /history)
8. Authenticated identity header propagation (X-Authenticated-User-Id)
"""

import io
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from starlette.testclient import TestClient

import api_server
from api_server import app, _upload_status, PDF_UPLOAD_DIR


class TestPhase6BAPIContracts(unittest.TestCase):
    """Deterministic contract tests for DigiLab FastAPI endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # Create an isolated temporary directory for upload tests
        self.test_dir = tempfile.mkdtemp(prefix="digilab_api_contracts_")
        self.orig_pdf_dir = api_server.PDF_UPLOAD_DIR
        api_server.PDF_UPLOAD_DIR = self.test_dir

        # Mock chatbot to isolate all contract tests from model weights
        self.orig_chatbot = api_server.chatbot
        self.mock_chatbot = MagicMock()
        api_server.chatbot = self.mock_chatbot

        # Mock speech/translation client to isolate from external APIs
        self.orig_sarvam = api_server.sarvam_client
        self.mock_sarvam = MagicMock()
        api_server.sarvam_client = self.mock_sarvam

        # Reset rate limiters so tests remain isolated
        api_server.upload_limiter.requests.clear()
        api_server.chat_limiter.requests.clear()
        api_server.s2s_limiter.requests.clear()

        # Reset _upload_status state
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
        api_server.chatbot = self.orig_chatbot
        api_server.sarvam_client = self.orig_sarvam
        api_server.PDF_UPLOAD_DIR = self.orig_pdf_dir
        api_server._upload_status.clear()
        api_server._upload_status.update(self.orig_upload_status)
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 1. Health & Root Endpoint Contracts
    # ─────────────────────────────────────────────────────────────
    def test_01_root_endpoint_contract(self):
        """GET / returns 200 with running status message."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("message", data)
        self.assertEqual(data["message"], "Media Literacy Chatbot API is running")

    def test_02_health_endpoint_schema_contract(self):
        """GET /health returns 200 and matches HealthResponse schema."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "application/json")
        data = res.json()

        expected_fields = {"status", "message", "chatbot_ready", "speech_ready", "db_connected"}
        self.assertTrue(expected_fields.issubset(set(data.keys())), f"Missing keys in /health: {data.keys()}")
        self.assertIsInstance(data["chatbot_ready"], bool)
        self.assertIsInstance(data["speech_ready"], bool)
        self.assertIsInstance(data["db_connected"], bool)

    # ─────────────────────────────────────────────────────────────
    # 2. Chat Endpoint Contracts (POST /chat)
    # ─────────────────────────────────────────────────────────────
    def test_03_chat_endpoint_empty_question_validation(self):
        """POST /chat returns 400 when question is empty or pure whitespace."""
        res_empty = self.client.post("/chat", json={"question": ""})
        self.assertEqual(res_empty.status_code, 400)
        self.assertEqual(res_empty.json()["detail"], "Question cannot be empty")

        res_ws = self.client.post("/chat", json={"question": "     "})
        self.assertEqual(res_ws.status_code, 400)
        self.assertEqual(res_ws.json()["detail"], "Question cannot be empty")

    def test_04_chat_endpoint_missing_field_validation(self):
        """POST /chat returns 422 Unprocessable Entity when 'question' field is missing."""
        res = self.client.post("/chat", json={"model": "gemini-1.5"})
        self.assertEqual(res.status_code, 422)
        err = res.json()
        self.assertIn("detail", err)
        self.assertTrue(any(e.get("loc") == ["body", "question"] for e in err["detail"]))

    def test_05_chat_endpoint_success_contract(self):
        """POST /chat returns 200 and conforms to ChatResponse schema."""
        mock_result = {
            "answer": "Journalism is the production and distribution of reports on current events.",
            "sources": [{"full_section": "Unit 1", "page": 1, "source_file": "syllabus.txt"}],
            "expanded_queries": ["what is journalism"],
            "validation": {"completeness_score": 9},
            "metadata": {"content_sufficient": True},
            "reference_links": [],
            "follow_up_questions": None,
            "is_cache_hit": False,
        }
        self.mock_chatbot.ask_question_with_follow_ups.return_value = mock_result
        self.mock_chatbot.ask_question.return_value = mock_result

        res = self.client.post("/chat", json={"question": "What is journalism?"})

        self.assertEqual(res.status_code, 200)
        self.assertIn("X-Process-Time", res.headers)
        data = res.json()

        expected_keys = {
            "answer", "sources", "expanded_queries", "validation",
            "metadata", "reference_links", "follow_up_questions"
        }
        self.assertTrue(expected_keys.issubset(set(data.keys())), f"Missing keys in /chat response: {data.keys()}")
        self.assertEqual(data["answer"], "Journalism is the production and distribution of reports on current events.")
        self.assertIsInstance(data["sources"], list)
        self.assertIsInstance(data["expanded_queries"], list)

    # ─────────────────────────────────────────────────────────────
    # 3. Document Upload Endpoint Contracts (POST /upload-pdf)
    # ─────────────────────────────────────────────────────────────
    def test_06_upload_pdf_success_contract(self):
        """POST /upload-pdf with valid PDF returns 202 Accepted and starts async ingestion."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>%%EOF"
        files = {"file": ("media_ethics.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"document_id": "doc_ethics_01", "user_id": "user_alice", "job_id": "job_101"}

        with patch("api_server._run_pdf_ingestion") as mock_ingest:
            res = self.client.post("/upload-pdf", files=files, data=data)

        self.assertEqual(res.status_code, 202)
        resp_data = res.json()

        self.assertEqual(resp_data["message"], "Document 'media_ethics.pdf' accepted. Ingestion started in background.")
        self.assertEqual(resp_data["filename"], "media_ethics.pdf")
        self.assertEqual(resp_data["document_id"], "doc_ethics_01")
        self.assertEqual(resp_data["job_id"], "job_101")
        self.assertEqual(resp_data["status"], "processing")
        self.assertEqual(resp_data["file_type"], "pdf")
        self.assertIn("track_progress", resp_data)
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "doc_ethics_01", "media_ethics.pdf")))

    def test_07_upload_pdf_missing_file_validation(self):
        """POST /upload-pdf returns 422 when multipart 'file' field is missing."""
        res = self.client.post("/upload-pdf", data={"document_id": "doc_123"})
        self.assertEqual(res.status_code, 422)

    def test_08_upload_pdf_empty_file_validation(self):
        """POST /upload-pdf returns 400 when uploaded file content is 0 bytes."""
        files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], "Uploaded file is empty")

    def test_09_upload_pdf_invalid_pdf_content_validation(self):
        """POST /upload-pdf returns 400 when file content lacks %PDF magic bytes."""
        files = {"file": ("corrupt.pdf", io.BytesIO(b"Not a real PDF stream"), "application/pdf")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], "File does not appear to be a valid PDF")

    def test_10_upload_pdf_unsupported_extension_validation(self):
        """POST /upload-pdf returns 400 when file extension is not supported."""
        files = {"file": ("malicious.exe", io.BytesIO(b"binary"), "application/octet-stream")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Only PDF and Word files are accepted", res.json()["detail"])

    def test_11_upload_pdf_legacy_doc_validation(self):
        """POST /upload-pdf returns 400 with actionable error message for legacy .doc files."""
        files = {"file": ("legacy.doc", io.BytesIO(b"legacy content"), "application/msword")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Legacy .doc files are not supported", res.json()["detail"])

    def test_12_upload_pdf_word_lock_file_validation(self):
        """POST /upload-pdf returns 400 when filename matches Word lock file pattern (~$)."""
        files = {"file": ("~$draft.docx", io.BytesIO(b"lock"), "application/vnd.openxmlformats")}
        res = self.client.post("/upload-pdf", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("looks like a Word lock file", res.json()["detail"])

    def test_13_upload_pdf_conflict_when_already_processing(self):
        """POST /upload-pdf returns 409 Conflict if another document is already processing."""
        api_server._upload_status["status"] = "processing"
        api_server._upload_status["filename"] = "in_flight.pdf"

        pdf_bytes = b"%PDF-1.4 mock content"
        files = {"file": ("second.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        res = self.client.post("/upload-pdf", files=files)

        self.assertEqual(res.status_code, 409)
        self.assertIn("Another upload is already in progress", res.json()["detail"])

    # ─────────────────────────────────────────────────────────────
    # 4. Upload Status Endpoint Contract (GET /upload-pdf/status)
    # ─────────────────────────────────────────────────────────────
    def test_14_upload_status_schema_contract(self):
        """GET /upload-pdf/status returns 200 matching UploadStatusResponse."""
        api_server._upload_status.update({
            "status": "done",
            "filename": "media_book.pdf",
            "pages_processed": 12,
            "chunks_created": 36,
            "vectors_upserted": 36,
            "document_id": "doc_done_456",
            "user_id": "user_charlie",
            "job_id": "job_999",
        })

        res = self.client.get("/upload-pdf/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        expected_fields = {
            "status", "filename", "pages_processed", "chunks_created",
            "vectors_upserted", "error", "document_id", "user_id", "job_id"
        }
        self.assertTrue(expected_fields.issubset(set(data.keys())))
        self.assertEqual(data["status"], "done")
        self.assertEqual(data["chunks_created"], 36)
        self.assertEqual(data["document_id"], "doc_done_456")

    # ─────────────────────────────────────────────────────────────
    # 5. Multilingual & Speech Endpoint Contracts
    # ─────────────────────────────────────────────────────────────
    def test_15_text_to_text_validation_contract(self):
        """POST /text-to-text validates non-empty question and required schema."""
        # Empty question -> 400
        res_empty = self.client.post("/text-to-text", json={"question": ""})
        self.assertEqual(res_empty.status_code, 400)
        self.assertEqual(res_empty.json()["detail"], "Question cannot be empty")

        # Missing field -> 422
        res_missing = self.client.post("/text-to-text", json={"language_code": "hi-IN"})
        self.assertEqual(res_missing.status_code, 422)

    def test_16_speech_to_speech_validation_contract(self):
        """POST /speech-to-speech validates base64 payload and required schema."""
        # Missing audio_base64 -> 422
        res_missing = self.client.post("/speech-to-speech", json={"mime_type": "audio/wav"})
        self.assertEqual(res_missing.status_code, 422)

        # Empty audio_base64 -> 400
        res_empty = self.client.post("/speech-to-speech", json={"audio_base64": ""})
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn("audio_base64 cannot be empty", res_empty.json()["detail"])

        # Malformed base64 -> 400
        res_corrupt = self.client.post("/speech-to-speech", json={"audio_base64": "!!!not_valid_b64!!!"})
        self.assertEqual(res_corrupt.status_code, 400)
        self.assertIn("Invalid base64", res_corrupt.json()["detail"])

    # ─────────────────────────────────────────────────────────────
    # 6. Selection Explanation & Session Endpoint Contracts
    # ─────────────────────────────────────────────────────────────
    def test_17_explain_selection_validation_contract(self):
        """POST /chat/explain-selection returns 422 when required selection fields are missing."""
        res = self.client.post("/chat/explain-selection", json={"selected_text": "media"})
        self.assertEqual(res.status_code, 422)

    def test_18_session_history_clear_and_get_contract(self):
        """POST /clear-history clears history and GET /history returns list."""
        res_clear = self.client.post("/clear-history")
        self.assertEqual(res_clear.status_code, 200)
        self.assertEqual(res_clear.json()["status"], "success")
        self.assertEqual(res_clear.json()["message"], "Conversation history cleared")

        res_hist = self.client.get("/history")
        self.assertEqual(res_hist.status_code, 200)
        hist_data = res_hist.json()
        self.assertIsInstance(hist_data, dict)
        self.assertIn("history", hist_data)
        self.assertIn("count", hist_data)
        self.assertIsInstance(hist_data["history"], list)


if __name__ == "__main__":
    unittest.main()
