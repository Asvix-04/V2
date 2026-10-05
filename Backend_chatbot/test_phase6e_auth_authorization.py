"""
Phase 6E: Python / FastAPI Identity Resolution & Authorization Test Suite
DigiLab QA & Automated Testing Track

Verifies:
1. Internal bridge header `X-Authenticated-User-Id` resolves to trusted `user:<id>`.
2. Spoofed/invalid user values (e.g. 'guest', empty string) in `X-Authenticated-User-Id` are rejected.
3. Guest header `X-Guest-ID` resolves to `guest:<id>`.
4. Spoofed 'user-guest' values in `X-Guest-ID` are rejected.
5. Explicit `user_id` model field takes priority when header is absent.
6. Fallback identity resolves to `ip:<client_ip>` when no headers or user IDs are present.
7. Identity boundary preserves trusted user identity without cross-contamination.
"""

import unittest
from unittest.mock import MagicMock
from fastapi import Request

from api_server import _resolve_rate_limit_identity, _client_ip


class TestPhase6EAuthAuthorization(unittest.TestCase):

    def _create_mock_request(self, headers=None, client_host="192.168.1.50"):
        req = MagicMock(spec=Request)
        req.headers = headers or {}
        req.client = MagicMock()
        req.client.host = client_host
        return req

    def test_01_trusted_internal_bridge_header_resolves_to_user_identity(self):
        req = self._create_mock_request(headers={"x-authenticated-user-id": "user-alice-123"})
        identity = _resolve_rate_limit_identity(req)
        self.assertEqual(identity, "user:user-alice-123")

    def test_02_guest_value_in_auth_header_is_rejected_as_user(self):
        req = self._create_mock_request(headers={
            "x-authenticated-user-id": "guest",
            "x-guest-id": "guest_charlie_real"
        })
        identity = _resolve_rate_limit_identity(req)
        self.assertEqual(identity, "guest:guest_charlie_real")

    def test_03_guest_header_resolves_to_guest_identity(self):
        req = self._create_mock_request(headers={"x-guest-id": "guest_abc_999"})
        identity = _resolve_rate_limit_identity(req)
        self.assertEqual(identity, "guest:guest_abc_999")

    def test_04_user_guest_prefix_in_guest_header_is_rejected(self):
        req = self._create_mock_request(headers={"x-guest-id": "user-guest-spoof"}, client_host="10.0.0.1")
        identity = _resolve_rate_limit_identity(req)
        # Should reject the user-guest spoof and fall back to IP
        self.assertEqual(identity, "ip:10.0.0.1")

    def test_05_explicit_user_id_in_model_resolves_when_header_absent(self):
        req = self._create_mock_request(headers={})
        identity = _resolve_rate_limit_identity(req, explicit_user_id="user-direct-client")
        self.assertEqual(identity, "user:user-direct-client")

    def test_06_trusted_header_takes_precedence_over_explicit_body_user_id(self):
        # Even if a client sends a conflicting body user_id, trusted bridge header wins
        req = self._create_mock_request(headers={"x-authenticated-user-id": "user-alice-real"})
        identity = _resolve_rate_limit_identity(req, explicit_user_id="user-bob-spoofed")
        self.assertEqual(identity, "user:user-alice-real")

    def test_07_fallback_to_client_ip_when_no_identity_headers(self):
        req = self._create_mock_request(headers={}, client_host="172.16.0.42")
        identity = _resolve_rate_limit_identity(req)
        self.assertEqual(identity, "ip:172.16.0.42")


if __name__ == '__main__':
    unittest.main()
