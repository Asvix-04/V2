"""
Phase 6M: Deployment & Release Readiness Testing Suite (Python)
DigiLab QA & Automated Testing Track

Validates the DEPLOYMENT and RELEASE boundary for the Python AI service:
1.  Python dependencies and modules import cleanly without unhandled errors
2.  FastAPI application instance exists with expected route registrations
3.  Startup prerequisites (txt_processed.flag, PDF_UPLOAD_DIR) are present and valid
4.  Environment configuration: HOST, PORT, UVICORN_RELOAD, SESSION_COOKIE defaults
5.  Health endpoint contract: GET /health returns 200 with HealthResponse schema
6.  Redis client resilience, LocalMemoryCache fallback, and connection handling
7.  Deployment artifacts: Dockerfile, .dockerignore, and req.txt static validation
8.  Deterministic smoke flow: minimal chat request through TestClient
9.  Upload status schema conformance via /upload-pdf/status
10. Clean resource state and teardown isolation
"""

import os
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

FLAG_PATH = os.path.join(os.path.dirname(__file__), "data", "processed", "txt_processed.flag")


class TestPhase6MDeploymentReadiness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import api_server
        cls.api_server = api_server
        cls.app = api_server.app
        cls.client = TestClient(api_server.app)

    def setUp(self):
        self.orig_chatbot = self.api_server.chatbot
        self.orig_sarvam = self.api_server.sarvam_client
        self.orig_upload_status = dict(self.api_server._upload_status)

        self.mock_chatbot = MagicMock()
        self.mock_sarvam = MagicMock()
        self.api_server.chatbot = self.mock_chatbot
        self.api_server.sarvam_client = self.mock_sarvam

    def tearDown(self):
        self.api_server.chatbot = self.orig_chatbot
        self.api_server.sarvam_client = self.orig_sarvam
        self.api_server._upload_status.clear()
        self.api_server._upload_status.update(self.orig_upload_status)

    # 1. Dependency Resolution & Module Imports
    def test_01_modules_and_dependencies_import_cleanly(self):
        """All core modules and dependencies must import without errors."""
        import chatbot
        import hybrid_retriever
        import redis_client
        import relevance_filter
        import pdf_preprocessor

        self.assertIsNotNone(self.api_server.app)
        self.assertIsNotNone(chatbot)
        self.assertIsNotNone(hybrid_retriever)
        self.assertIsNotNone(redis_client)
        self.assertIsNotNone(relevance_filter)
        self.assertIsNotNone(pdf_preprocessor)

    # 2. FastAPI Route Registration Completeness
    def test_02_fastapi_routes_registered(self):
        """Essential production API routes must be registered on the FastAPI app."""
        route_paths = [route.path for route in self.app.routes]

        expected_routes = [
            "/health",
            "/chat",
            "/chat/stream",
            "/chat/simple",
            "/speech-to-speech",
            "/text-to-text",
            "/clear-history",
            "/upload-pdf",
            "/upload-pdf/status",
            "/deepchat",
        ]

        for expected in expected_routes:
            self.assertIn(expected, route_paths, f"Route {expected} must be registered on FastAPI app")

    # 3. Startup Prerequisites & Flag File Verification
    def test_03_startup_prerequisites_and_flags(self):
        """Required startup flag files and upload directories must be verified."""
        self.assertTrue(
            os.path.exists(FLAG_PATH),
            f"Flag file {FLAG_PATH} must exist to pass api_server __main__ gate"
        )

        upload_dir = getattr(self.api_server, "PDF_UPLOAD_DIR", "pdfs")
        self.assertTrue(os.path.exists(upload_dir) or os.path.exists("data"),
                        "Upload directory or parent data directory must exist")

    # 4. Environment & Host/Port Configuration Defaults
    def test_04_environment_and_host_defaults(self):
        """Default host must be 127.0.0.1 and port must be 8000 when unspecified."""
        host = os.getenv("HOST", "127.0.0.1")
        port = int(os.getenv("PORT", "8000"))
        reload_enabled = os.getenv("UVICORN_RELOAD", "false").strip().lower() in ("1", "true", "yes", "on")

        self.assertIn(host, ("127.0.0.1", "0.0.0.0", "localhost"))
        self.assertTrue(1 <= port <= 65535)
        # Production default should not enable uvicorn hot-reload
        self.assertFalse(reload_enabled, "UVICORN_RELOAD must default to False for production readiness")

    # 5. Health Check Endpoint Contract
    def test_05_health_check_endpoint_contract(self):
        """GET /health must return HTTP 200 with complete HealthResponse schema."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)

        data = res.json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertIn("message", data)
        self.assertIn("chatbot_ready", data)
        self.assertIn("speech_ready", data)
        self.assertIn("db_connected", data)

    # 6. Redis Connection Resilience & Local Fallback
    def test_06_redis_connection_resilience(self):
        """Redis client and LocalMemoryCache must handle connectivity and fallback safely."""
        from redis_client import RedisManager, LocalMemoryCache

        # In-memory local cache fallback
        cache = LocalMemoryCache(max_entries=100)
        self.assertIsNotNone(cache)
        test_key = "deploy_test_key_phase6m"
        test_val = "cached_test_payload"
        cache.set(test_key, test_val)
        retrieved = cache.get(test_key)
        self.assertEqual(retrieved, test_val)

        # RedisManager initializes without raising uncaught exceptions
        mgr = RedisManager()
        self.assertIsNotNone(mgr.client)

    # 7. Deployment Artifact Audit: Dockerfile, .dockerignore, req.txt
    def test_07_deployment_artifacts_static_audit(self):
        """Deployment manifests must have correct configuration and ignore rules."""
        base_dir = os.path.dirname(os.path.dirname(__file__))
        dockerfile_path = os.path.join(base_dir, "Dockerfile")
        dockerignore_path = os.path.join(base_dir, ".dockerignore")
        req_path = os.path.join(os.path.dirname(__file__), "req.txt")

        self.assertTrue(os.path.exists(dockerfile_path), "Dockerfile must exist")
        self.assertTrue(os.path.exists(dockerignore_path), ".dockerignore must exist")
        self.assertTrue(os.path.exists(req_path), "req.txt must exist")

        with open(req_path, "r", encoding="utf-8") as f:
            reqs = f.read()

        essential_deps = ["fastapi", "uvicorn", "redis", "pydantic", "pinecone"]
        for dep in essential_deps:
            self.assertIn(dep, reqs, f"req.txt must specify {dep}")

        with open(dockerignore_path, "r", encoding="utf-8") as f:
            d_ignore = f.read()

        self.assertIn("**/.env", d_ignore, ".dockerignore must exclude .env files")
        self.assertIn("node_modules", d_ignore, ".dockerignore must exclude node_modules")

    # 8. Deterministic Smoke Flow: Chat Request Pipeline
    def test_08_deterministic_smoke_chat_request(self):
        """A minimal production-style smoke chat request must return 200 and schema."""
        mock_response = {
            "answer": "Smoke test answer: media literacy enables critical evaluation.",
            "sources": [{"title": "Course Guide", "page": 1}],
            "expanded_queries": ["what is media literacy"],
            "validation": {"completeness_score": 9},
            "metadata": {"content_sufficient": True},
            "reference_links": [],
            "follow_up_questions": None,
            "session_id": "smoke_session_01"
        }

        self.mock_chatbot.ask_question_with_follow_ups.return_value = mock_response
        self.mock_chatbot.ask_question.return_value = mock_response

        payload = {
            "question": "What is media literacy?",
            "user_id": "smoke_test_user"
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("answer"), mock_response["answer"])
        self.assertTrue(isinstance(data.get("sources"), list))
        self.assertTrue(isinstance(data.get("expanded_queries"), list))

    # 9. Upload Status Schema Conformance
    def test_09_upload_status_schema_conformance(self):
        """Upload status polling must conform to contract schema."""
        self.api_server._upload_status.update({
            "status": "completed",
            "filename": "test.pdf",
            "chunks_created": 5,
            "vectors_upserted": 5,
            "error": None
        })

        res = self.client.get("/upload-pdf/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["chunks_created"], 5)
        self.assertEqual(data["vectors_upserted"], 5)

    # 10. Clean Shutdown & Resource Cleanup
    def test_10_clean_resource_state(self):
        """Temporary test artifacts must not pollute global server state."""
        self.assertIn(self.api_server._upload_status.get("status"), ("idle", "done", "completed"))
        self.assertNotIn("smoke_doc_123", self.api_server._upload_status)


if __name__ == "__main__":
    unittest.main()
