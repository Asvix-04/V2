import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    with patch("app.get_chatbot") as mock_get_chatbot:
        mock_chatbot = MagicMock()
        mock_chatbot.ask_question.return_value = {
            "answer": "This is a test answer about media literacy.",
            "sources": [
                {
                    "full_section": "Unit 1 > Introduction",
                    "page": "5",
                    "source_file": "test.pdf",
                    "text": "Sample source text...",
                }
            ],
            "expanded_queries": ["original query", "expanded query 1"],
            "validation": {"completeness_score": 8},
        }
        mock_get_chatbot.return_value = mock_chatbot

        from app import create_app

        app = create_app(testing=True)
        app.config["TESTING"] = True

        with app.test_client() as test_client:
            yield test_client


class TestHealthEndpoint:

    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "ok"
        assert "message" in data


class TestChatEndpoint:

    def test_chat_valid_message(self, client):
        response = client.post(
            "/chat",
            json={"message": "What is media literacy?"},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "reply" in data
        assert "sources" in data
        assert "meta" in data
        assert isinstance(data["sources"], list)

    def test_chat_empty_message(self, client):
        response = client.post(
            "/chat",
            json={"message": ""},
            content_type="application/json",
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_chat_missing_message_field(self, client):
        response = client.post(
            "/chat",
            json={"question": "wrong field name"},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_chat_invalid_json(self, client):
        response = client.post(
            "/chat",
            data="not json",
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_chat_with_options(self, client):
        response = client.post(
            "/chat",
            json={
                "message": "Tell me about journalism",
                "options": {"use_history": False},
            },
            content_type="application/json",
        )
        assert response.status_code == 200


class TestChatSimpleEndpoint:

    def test_chat_simple_returns_only_reply(self, client):
        response = client.post(
            "/chat/simple",
            json={"message": "What is photojournalism?"},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "reply" in data
        assert "sources" not in data
        assert "meta" not in data

    def test_chat_simple_empty_message(self, client):
        response = client.post(
            "/chat/simple",
            json={"message": "   "},
            content_type="application/json",
        )
        assert response.status_code == 400


class TestErrorHandling:

    def test_404_returns_json(self, client):
        response = client.get("/nonexistent")
        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
