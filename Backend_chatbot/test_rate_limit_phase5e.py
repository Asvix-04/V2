"""
Phase 5E-1: Rate Limiter Identity Fix Test Suite
DigiLab / IGNOU Production Architecture

Verifies:
1. Multiple requests from the same authenticated user share one rate-limit bucket.
2. User A and User B have completely independent rate-limit buckets (User A exhaustion does NOT reject User B).
3. Upload rate-limit quota is isolated per user (User A exhausting upload quota does not affect User B).
4. Verified authenticated identity cannot be spoofed by a client-supplied body user_id.
5. Unauthenticated requests fall back safely to IP-based rate limiting (not unlimited).
6. Guest requests with distinct X-Guest-ID headers are isolated per guest.
"""

import unittest
from unittest.mock import MagicMock
from fastapi import HTTPException
from starlette.requests import Request

import api_server
from api_server import _resolve_rate_limit_identity, _enforce_rate_limit
from utils import RateLimiter


def make_mock_request(client_ip="127.0.0.1", headers=None):
    """Helper to build a mock Starlette Request object."""
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


class TestPhase5ERateLimiterIdentity(unittest.TestCase):

    def setUp(self):
        # Fresh isolated rate limiters for tests
        self.chat_limiter = RateLimiter(max_requests=30, window_seconds=60)
        self.upload_limiter = RateLimiter(max_requests=5, window_seconds=300)

    # ─────────────────────────────────────────────────────────────
    # Test 1: Same user shares one rate-limit bucket
    # ─────────────────────────────────────────────────────────────
    def test_1_same_user_shares_bucket(self):
        req = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_alice"},
        )

        # First 30 requests succeed
        for i in range(30):
            try:
                _enforce_rate_limit(self.chat_limiter, req, "Too many requests", user_id="user_alice")
            except HTTPException:
                self.fail(f"Request {i+1} unexpectedly failed with 429")

        # 31st request must trigger 429
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req, "Too many requests", user_id="user_alice")
        self.assertEqual(ctx.exception.status_code, 429)

    # ─────────────────────────────────────────────────────────────
    # Test 2: User A and User B have independent rate-limit buckets
    # ─────────────────────────────────────────────────────────────
    def test_2_different_users_isolated(self):
        req_alice = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_alice"},
        )
        req_bob = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_bob"},
        )

        # Alice exhausts her 30-request quota
        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_alice, "Too many requests", user_id="user_alice")

        # Alice is now blocked
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_alice, "Too many requests", user_id="user_alice")
        self.assertEqual(ctx.exception.status_code, 429)

        # Bob from the SAME proxy IP (127.0.0.1) must NOT be blocked!
        for i in range(30):
            try:
                _enforce_rate_limit(self.chat_limiter, req_bob, "Too many requests", user_id="user_bob")
            except HTTPException:
                self.fail(f"Bob request {i+1} was blocked due to Alice exhausting her quota!")

        # Only Bob's 31st request triggers 429
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_bob, "Too many requests", user_id="user_bob")
        self.assertEqual(ctx.exception.status_code, 429)

    # ─────────────────────────────────────────────────────────────
    # Test 3: Upload isolation across users
    # ─────────────────────────────────────────────────────────────
    def test_3_upload_rate_limit_isolation(self):
        req_alice = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_alice"},
        )
        req_bob = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_bob"},
        )

        # Alice exhausts her 5 uploads in the 300s window
        for _ in range(5):
            _enforce_rate_limit(self.upload_limiter, req_alice, "Too many uploads", user_id="user_alice")

        # Alice's 6th upload is rejected
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.upload_limiter, req_alice, "Too many uploads", user_id="user_alice")
        self.assertEqual(ctx.exception.status_code, 429)

        # Bob's uploads from the same worker/IP must still succeed up to his own 5 quota
        for i in range(5):
            try:
                _enforce_rate_limit(self.upload_limiter, req_bob, "Too many uploads", user_id="user_bob")
            except HTTPException:
                self.fail(f"Bob's upload {i+1} was blocked by Alice's uploads!")

        # Bob's 6th upload is rejected
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.upload_limiter, req_bob, "Too many uploads", user_id="user_bob")
        self.assertEqual(ctx.exception.status_code, 429)

    # ─────────────────────────────────────────────────────────────
    # Test 4: Identity cannot be spoofed by body user_id
    # ─────────────────────────────────────────────────────────────
    def test_4_identity_cannot_be_spoofed(self):
        # Attacker is verified as "user_attacker" by Node, but attempts to spoof "user_victim" in payload
        req_attacker = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_attacker"},
        )

        identity = _resolve_rate_limit_identity(req_attacker, explicit_user_id="user_victim")
        # Verified header MUST take precedence over untrusted body
        self.assertEqual(identity, "user:user_attacker")

        # Attacker exhausts their quota
        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_attacker, "Too many requests", user_id="user_victim")

        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_attacker, "Too many requests", user_id="user_victim")
        self.assertEqual(ctx.exception.status_code, 429)

        # Victim's genuine requests must still have their FULL budget intact
        req_victim = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-authenticated-user-id": "user_victim"},
        )
        for i in range(30):
            try:
                _enforce_rate_limit(self.chat_limiter, req_victim, "Too many requests", user_id="user_victim")
            except HTTPException:
                self.fail(f"Victim was affected by attacker's spoof attempt on request {i+1}!")

    # ─────────────────────────────────────────────────────────────
    # Test 5: Unauthenticated requests fall back to IP rate limiting
    # ─────────────────────────────────────────────────────────────
    def test_5_ip_fallback(self):
        # Raw unauthenticated request with no auth headers or user_id
        req_anon1 = make_mock_request(client_ip="198.51.100.1", headers={})
        req_anon2 = make_mock_request(client_ip="198.51.100.2", headers={})

        identity1 = _resolve_rate_limit_identity(req_anon1, explicit_user_id=None)
        identity2 = _resolve_rate_limit_identity(req_anon2, explicit_user_id=None)

        self.assertEqual(identity1, "ip:198.51.100.1")
        self.assertEqual(identity2, "ip:198.51.100.2")

        # IP 198.51.100.1 consumes 30 requests
        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_anon1, "Too many requests")

        # IP 198.51.100.1 is now rate-limited
        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_anon1, "Too many requests")
        self.assertEqual(ctx.exception.status_code, 429)

        # Different IP 198.51.100.2 is NOT blocked
        try:
            _enforce_rate_limit(self.chat_limiter, req_anon2, "Too many requests")
        except HTTPException:
            self.fail("IP 198.51.100.2 was unexpectedly blocked by IP 198.51.100.1!")

    # ─────────────────────────────────────────────────────────────
    # Test 6: Guest ID isolation
    # ─────────────────────────────────────────────────────────────
    def test_6_guest_id_isolation(self):
        req_guest1 = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-guest-id": "guest_device_abc"},
        )
        req_guest2 = make_mock_request(
            client_ip="127.0.0.1",
            headers={"x-guest-id": "guest_device_xyz"},
        )

        id1 = _resolve_rate_limit_identity(req_guest1, explicit_user_id="guest")
        id2 = _resolve_rate_limit_identity(req_guest2, explicit_user_id="guest")

        self.assertEqual(id1, "guest:guest_device_abc")
        self.assertEqual(id2, "guest:guest_device_xyz")

        for _ in range(30):
            _enforce_rate_limit(self.chat_limiter, req_guest1, "Too many requests", user_id="guest")

        with self.assertRaises(HTTPException) as ctx:
            _enforce_rate_limit(self.chat_limiter, req_guest1, "Too many requests", user_id="guest")
        self.assertEqual(ctx.exception.status_code, 429)

        # Guest 2 is not blocked
        try:
            _enforce_rate_limit(self.chat_limiter, req_guest2, "Too many requests", user_id="guest")
        except HTTPException:
            self.fail("Guest 2 was blocked by Guest 1 quota exhaustion!")


if __name__ == "__main__":
    unittest.main()
