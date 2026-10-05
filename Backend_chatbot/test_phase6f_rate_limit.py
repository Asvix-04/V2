"""
Phase 6F: Rate Limiting & Abuse Testing Test Suite (Python / FastAPI)
DigiLab QA & Automated Testing Track

Verifies:
1. RateLimiter core sliding-window calculation (N-1, N allowed; N+1 rejected).
2. RateLimiter window expiration and reset behavior using controlled/mocked time.
3. Chat rate limiter boundary (30 req / 60s, HTTP 429 "Too many requests. Please slow down.").
4. Upload rate limiter boundary (5 req / 300s, HTTP 429 "Too many uploads. Please wait before retrying.").
5. Speech-to-speech rate limiter boundary (5 req / 60s, HTTP 429 "Too many requests. Try again in a minute.").
6. User identity isolation (USER_A quota exhaustion does NOT impact USER_B).
7. Guest identity isolation (GUEST_A quota exhaustion does NOT impact GUEST_B).
8. IP fallback isolation (IP_A quota exhaustion does NOT impact IP_B).
9. Identity manipulation defense:
   - Client body user_id cannot spoof authenticated X-Authenticated-User-Id header.
   - Malformed/guest values in X-Authenticated-User-Id are ignored.
   - "user-guest" prefixed X-Guest-ID cannot bypass guest namespace.
   - X-Forwarded-For header spoofing is rejected when TRUST_PROXY_HEADERS is False.
10. Legitimate traffic preservation below configured limits.
"""

import unittest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from starlette.requests import Request

import api_server
from api_server import _resolve_rate_limit_identity, _enforce_rate_limit, _client_ip
from utils import RateLimiter


def make_mock_request(client_ip="127.0.0.1", headers=None):
    """Helper to construct a mock Starlette Request object."""
    headers_dict = {k.lower(): v for k, v in (headers or {}).items()}
    headers_bytes = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in headers_dict.items()]

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/chat",
        "headers": headers_bytes,
        "client": (client_ip, 50000),
    }
    return Request(scope)


class TestPhase6FRateLimitAbuse(unittest.TestCase):

    def setUp(self):
        # Create fresh isolated rate limiters for deterministic testing
        self.chat_limiter = RateLimiter(max_requests=30, window_seconds=60)
        self.upload_limiter = RateLimiter(max_requests=5, window_seconds=300)
        self.s2s_limiter = RateLimiter(max_requests=5, window_seconds=60)

    # ─────────────────────────────────────────────────────────────
    # 1. RateLimiter Core Boundary (Unit)
    # ─────────────────────────────────────────────────────────────
    def test_01_core_rate_limiter_boundary(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        client = "test_client_01"

        # N-1 (2 requests): allowed
        self.assertTrue(limiter.is_allowed(client))
        self.assertTrue(limiter.is_allowed(client))

        # N (3rd request): allowed (boundary)
        self.assertTrue(limiter.is_allowed(client))

        # N+1 (4th request): rejected
        self.assertFalse(limiter.is_allowed(client))

    # ─────────────────────────────────────────────────────────────
    # 2. Window Expiration & Reset (Mocked Time)
    # ─────────────────────────────────────────────────────────────
    def test_02_window_expiration_and_reset(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        client = "test_client_02"

        base_time = 1000.0
        with patch("time.time", return_value=base_time):
            # Exhaust quota at T=1000.0
            self.assertTrue(limiter.is_allowed(client))
            self.assertTrue(limiter.is_allowed(client))
            self.assertFalse(limiter.is_allowed(client))

        # Still blocked at T=1030.0 (30s elapsed < 60s window)
        with patch("time.time", return_value=base_time + 30.0):
            self.assertFalse(limiter.is_allowed(client))

        # Reset after window expires at T=1061.0 (> 60s elapsed)
        with patch("time.time", return_value=base_time + 61.0):
            self.assertTrue(limiter.is_allowed(client), "Limiter must reset after window expiration")

    # ─────────────────────────────────────────────────────────────
    # 3. Chat Rate Limit Boundary
    # ─────────────────────────────────────────────────────────────
    def test_03_chat_rate_limit_boundary(self):
        req = make_mock_request(headers={"x-authenticated-user-id": "user_chat_test"})

        # Requests 1 to 29 succeed (N-1)
        for _ in range(29):
            _enforce_rate_limit(self.chat_limiter, req, "Too many requests. Please slow down.", user_id="user_chat_test")

        # Request 30 succeeds (boundary N)
        _enforce_rate_limit(self.chat_limiter, req, "Too many requests. Please slow down.", user_id="user_chat_test")

        # Request 31 fails with 429 and expected contract (N+1)
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req, "Too many requests. Please slow down.", user_id="user_chat_test")
        
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.detail, "Too many requests. Please slow down.")

    # ─────────────────────────────────────────────────────────────
    # 4. Upload Rate Limit Boundary
    # ─────────────────────────────────────────────────────────────
    def test_04_upload_rate_limit_boundary(self):
        req = make_mock_request(headers={"x-authenticated-user-id": "user_upload_test"})

        # Requests 1 to 4 succeed
        for _ in range(4):
            _enforce_rate_limit(self.upload_limiter, req, "Too many uploads. Please wait before retrying.", user_id="user_upload_test")

        # Request 5 succeeds (boundary N)
        _enforce_rate_limit(self.upload_limiter, req, "Too many uploads. Please wait before retrying.", user_id="user_upload_test")

        # Request 6 fails with 429 and expected contract (N+1)
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.upload_limiter, req, "Too many uploads. Please wait before retrying.", user_id="user_upload_test")
        
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.detail, "Too many uploads. Please wait before retrying.")

    # ─────────────────────────────────────────────────────────────
    # 5. Speech-to-Speech Rate Limit Boundary
    # ─────────────────────────────────────────────────────────────
    def test_05_speech_to_speech_rate_limit_boundary(self):
        req = make_mock_request(headers={"x-authenticated-user-id": "user_s2s_test"})

        for _ in range(4):
            _enforce_rate_limit(self.s2s_limiter, req, "Too many requests. Try again in a minute.")

        # Request 5 succeeds
        _enforce_rate_limit(self.s2s_limiter, req, "Too many requests. Try again in a minute.")

        # Request 6 fails with 429
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.s2s_limiter, req, "Too many requests. Try again in a minute.")

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.detail, "Too many requests. Try again in a minute.")

    # ─────────────────────────────────────────────────────────────
    # 6. Identity Isolation: USER_A vs USER_B
    # ─────────────────────────────────────────────────────────────
    def test_06_user_isolation(self):
        req_a = make_mock_request(client_ip="10.0.0.1", headers={"x-authenticated-user-id": "user_alice"})
        req_b = make_mock_request(client_ip="10.0.0.1", headers={"x-authenticated-user-id": "user_bob"})

        # USER_A exhausts full budget (30 requests)
        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_a, "Too many requests. Please slow down.", user_id="user_alice")

        # USER_A is blocked
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_a, "Too many requests. Please slow down.", user_id="user_alice")
        self.assertEqual(ctx.exception.status_code, 429)

        # USER_B sharing same proxy IP is completely unblocked and can make requests
        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_b, "Too many requests. Please slow down.", user_id="user_bob")

        # Only on request 31 does USER_B get blocked
        with self.assertRaises(HTTPException):
            _enforce_rate_limit(self.chat_limiter, req_b, "Too many requests. Please slow down.", user_id="user_bob")

    # ─────────────────────────────────────────────────────────────
    # 7. Identity Isolation: GUEST_A vs GUEST_B
    # ─────────────────────────────────────────────────────────────
    def test_07_guest_isolation(self):
        req_g1 = make_mock_request(client_ip="10.0.0.1", headers={"x-guest-id": "guest_device_alpha"})
        req_g2 = make_mock_request(client_ip="10.0.0.1", headers={"x-guest-id": "guest_device_beta"})

        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_g1, "Too many requests. Please slow down.", user_id="guest")

        # Guest 1 is blocked
        with self.assertRaises(HTTPException):
            _enforce_rate_limit(self.chat_limiter, req_g1, "Too many requests. Please slow down.", user_id="guest")

        # Guest 2 from same IP is unaffected
        _enforce_rate_limit(self.chat_limiter, req_g2, "Too many requests. Please slow down.", user_id="guest")

    # ─────────────────────────────────────────────────────────────
    # 8. Identity Isolation: IP Fallback
    # ─────────────────────────────────────────────────────────────
    def test_08_ip_fallback_isolation(self):
        req_ip1 = make_mock_request(client_ip="198.51.100.10", headers={})
        req_ip2 = make_mock_request(client_ip="198.51.100.20", headers={})

        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_ip1, "Too many requests. Please slow down.")

        # IP 1 is blocked
        with self.assertRaises(HTTPException):
            _enforce_rate_limit(self.chat_limiter, req_ip1, "Too many requests. Please slow down.")

        # IP 2 is unaffected
        _enforce_rate_limit(self.chat_limiter, req_ip2, "Too many requests. Please slow down.")

    # ─────────────────────────────────────────────────────────────
    # 9. Identity Manipulation & Header Tampering Defense
    # ─────────────────────────────────────────────────────────────
    def test_09_identity_manipulation_defense(self):
        # A. Body user_id cannot spoof authenticated header
        req_auth = make_mock_request(headers={"x-authenticated-user-id": "user_genuine"})
        identity_a = _resolve_rate_limit_identity(req_auth, explicit_user_id="user_target_spoof")
        self.assertEqual(identity_a, "user:user_genuine", "Authenticated header must take precedence over body spoof")

        # B. 'guest' value in authenticated user header is not treated as a valid user
        req_spoof_guest = make_mock_request(headers={"x-authenticated-user-id": "guest", "x-guest-id": "guest_real_dev"})
        identity_b = _resolve_rate_limit_identity(req_spoof_guest)
        self.assertEqual(identity_b, "guest:guest_real_dev", "'guest' in auth header must be rejected and fall back")

        # C. 'user-guest' prefix in X-Guest-ID is ignored
        req_spoof_prefix = make_mock_request(client_ip="10.0.0.5", headers={"x-guest-id": "user-guest-fake"})
        identity_c = _resolve_rate_limit_identity(req_spoof_prefix)
        self.assertEqual(identity_c, "ip:10.0.0.5", "'user-guest' prefix must be ignored and fall back to IP")

        # D. X-Forwarded-For header spoofing is rejected when TRUST_PROXY_HEADERS is False
        with patch.object(api_server, "TRUST_PROXY_HEADERS", False):
            req_spoof_ip = make_mock_request(client_ip="10.0.0.99", headers={"x-forwarded-for": "203.0.113.195"})
            resolved_ip = _client_ip(req_spoof_ip)
            self.assertEqual(resolved_ip, "10.0.0.99", "Untrusted X-Forwarded-For must be ignored")

    # ─────────────────────────────────────────────────────────────
    # 10. Normal Legitimate Traffic Unaffected
    # ─────────────────────────────────────────────────────────────
    def test_10_legitimate_traffic_unaffected(self):
        req = make_mock_request(headers={"x-authenticated-user-id": "user_legitimate"})

        # Normal user submits 5 queries (well under limit of 30)
        for i in range(5):
            try:
                _enforce_rate_limit(self.chat_limiter, req, "Too many requests. Please slow down.", user_id="user_legitimate")
            except HTTPException:
                self.fail(f"Legitimate query {i+1} was falsely rate-limited")

    # ─────────────────────────────────────────────────────────────
    # 11. Chat Route HTTP 429 Contract (ASGI / TestClient)
    # ─────────────────────────────────────────────────────────────
    def test_11_chat_route_http_429_response(self):
        from starlette.testclient import TestClient
        client = TestClient(api_server.app)

        test_limiter = RateLimiter(max_requests=2, window_seconds=60)
        mock_chat_result = {
            "answer": "Test answer",
            "sources": [],
            "expanded_queries": [],
            "validation": {"completeness_score": 10},
            "metadata": {"content_sufficient": True},
            "reference_links": [],
            "follow_up_questions": None,
            "is_cache_hit": False,
        }

        with patch.object(api_server, "chat_limiter", test_limiter), \
             patch.object(api_server, "chatbot", MagicMock()) as mock_bot:
            mock_bot.ask_question_with_follow_ups.return_value = mock_chat_result

            headers = {"X-Authenticated-User-Id": "user_route_test"}
            # Request 1: 200 OK
            res1 = client.post("/chat", json={"question": "Hello 1"}, headers=headers)
            self.assertEqual(res1.status_code, 200)

            # Request 2: 200 OK (at limit)
            res2 = client.post("/chat", json={"question": "Hello 2"}, headers=headers)
            self.assertEqual(res2.status_code, 200)

            # Request 3: 429 Too Many Requests (over limit)
            res3 = client.post("/chat", json={"question": "Hello 3"}, headers=headers)
            self.assertEqual(res3.status_code, 429)
            self.assertEqual(res3.json(), {"detail": "Too many requests. Please slow down."})

    # ─────────────────────────────────────────────────────────────
    # 12. Upload Route HTTP 429 Contract (ASGI / TestClient)
    # ─────────────────────────────────────────────────────────────
    def test_12_upload_route_http_429_response(self):
        from starlette.testclient import TestClient
        import io
        client = TestClient(api_server.app)

        test_limiter = RateLimiter(max_requests=2, window_seconds=300)
        with patch.object(api_server, "upload_limiter", test_limiter), \
             patch.object(api_server, "_upload_status", {"status": "idle"}), \
             patch("api_server.threading.Thread"):
            # Mock threading.Thread so background ingestion doesn't trigger
            headers = {"X-Authenticated-User-Id": "user_upload_route_test"}
            file_data = io.BytesIO(b"%PDF-1.4 test dummy content")

            # Upload 1: 202 Accepted
            res1 = client.post("/upload-pdf", files={"file": ("test1.pdf", file_data, "application/pdf")}, headers=headers)
            self.assertEqual(res1.status_code, 202)

            # Upload 2: 202 Accepted (at limit)
            file_data.seek(0)
            res2 = client.post("/upload-pdf", files={"file": ("test2.pdf", file_data, "application/pdf")}, headers=headers)
            self.assertEqual(res2.status_code, 202)

            # Upload 3: 429 Too Many Requests (over limit)
            file_data.seek(0)
            res3 = client.post("/upload-pdf", files={"file": ("test3.pdf", file_data, "application/pdf")}, headers=headers)
            self.assertEqual(res3.status_code, 429)
            self.assertEqual(res3.json(), {"detail": "Too many uploads. Please wait before retrying."})


if __name__ == "__main__":
    unittest.main()
