import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

_chatbot = None


def get_chatbot():
    global _chatbot
    if _chatbot is None:
        from chatbot import PDFChatbot
        logger.info("Initializing PDFChatbot...")
        _chatbot = PDFChatbot()
        logger.info("PDFChatbot initialized successfully.")
    return _chatbot


def create_app(testing: bool = False):
    app = Flask(__name__)
    app.config["TESTING"] = testing
    CORS(app, resources={r"/*": {"origins": "*"}})

    @app.errorhandler(Exception)
    def handle_exception(e):
        logger.exception("Unhandled exception")
        return jsonify({"error": str(e), "type": type(e).__name__}), 500

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": str(e.description)}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(503)
    def service_unavailable(e):
        return jsonify({"error": str(e.description)}), 503

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "message": "Media Literacy Chatbot API is running"})

    @app.route("/chat", methods=["POST"])
    def chat():
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400

        message = data.get("message", "").strip()
        if not message:
            return jsonify({"error": "Field 'message' is required and cannot be empty"}), 400

        options = data.get("options", {})
        use_history = options.get("use_history", True)

        try:
            chatbot = get_chatbot()
        except Exception as e:
            logger.error(f"Chatbot initialization failed: {e}")
            return jsonify({"error": "Chatbot not available", "detail": str(e)}), 503

        try:
            result = chatbot.ask_question(question=message, use_history=use_history)

            sources = result.get("sources", [])
            validation = result.get("validation", {})
            meta = {
                "total_sources": len(sources),
                "unique_sections": len(set(s.get("full_section", "") for s in sources)),
                "completeness_score": validation.get("completeness_score"),
                "content_sufficient": (validation.get("completeness_score") or 0) >= 7,
                "query_expanded": len(result.get("expanded_queries", [])) > 1,
                "top_sources": [
                    {
                        "section": s.get("full_section", "Unknown")[:80],
                        "page": s.get("page", "N/A"),
                        "file": s.get("source_file", "N/A"),
                    }
                    for s in sources[:3]
                ],
            }

            return jsonify({
                "reply": result.get("answer", ""),
                "sources": sources,
                "meta": meta,
            })

        except Exception as e:
            logger.exception("Error processing chat request")
            return jsonify({"error": f"Error processing question: {e}"}), 500

    @app.route("/chat/simple", methods=["POST"])
    def chat_simple():
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400

        message = data.get("message", "").strip()
        if not message:
            return jsonify({"error": "Field 'message' is required"}), 400

        try:
            chatbot = get_chatbot()
        except Exception as e:
            logger.error(f"Chatbot initialization failed: {e}")
            return jsonify({"error": "Chatbot not available", "detail": str(e)}), 503

        try:
            result = chatbot.ask_question(question=message, use_history=True)
            return jsonify({"reply": result.get("answer", "")})
        except Exception as e:
            logger.exception("Error in simple chat")
            return jsonify({"error": str(e)}), 500

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    logger.info(f"Starting Flask dev server on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
