"""
streaming_llm.py — Digilab Streaming LLM Client (Gemini)

Fixes applied:
- Migrated to google-genai library to resolve legacy dependency conflicts
- Model config initialized once in __init__
- Proper error handling: rate limit, auth errors, timeouts
- Empty/whitespace context handled correctly
- Clean generator with no silent failures
"""

import os
from typing import Generator
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()


class StreamingLLM:
    """Wrapper for streaming responses from Gemini using the new google-genai client."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in .env")

        # Initialize the new genai client
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.5-flash-lite"

        # Generate config including system instruction
        self._config = types.GenerateContentConfig(
            max_output_tokens=1200,
            temperature=0.3,
            system_instruction=(
                "You are Digilab, a helpful Media Literacy course assistant for IGNOU students. "
                "Answer clearly and concisely using only the provided context. "
                "Keep responses under 300 words unless more detail is explicitly needed. "
                "Never reveal your underlying model or provider."
            ),
        )

    def stream_response(
        self,
        query: str,
        context: str = "",
    ) -> Generator[str, None, None]:
        """
        Stream response token by token.

        Args:
            query:   The student's question.
            context: Retrieved course material (optional).

        Yields:
            str — one token / phrase at a time, or an error message string.
        """
        yield from self._stream_google(query, context)

    def _stream_google(self, query: str, context: str) -> Generator[str, None, None]:
        """Internal Gemini streaming generator using new genai client."""

        # Context check
        context_clean = (context or "").strip()
        if context_clean:
            full_prompt = f"Context:\n{context_clean}\n\nUser Query: {query}"
        else:
            full_prompt = query

        try:
            response = self.client.models.generate_content_stream(
                model=self.model_name,
                contents=full_prompt,
                config=self._config,
            )

            for chunk in response:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            error_msg = str(e).lower()
            if "quota" in error_msg or "rate" in error_msg or "429" in error_msg:
                yield "⚠️ Rate limit reached. Please wait a moment and try again."
            elif "api key" in error_msg or "401" in error_msg or "unauthorized" in error_msg:
                yield "⚠️ Invalid API key. Please check your .env file."
            elif "deadline" in error_msg or "timeout" in error_msg:
                yield "⚠️ Request timed out. Please try again."
            else:
                yield f"⚠️ An error occurred: {str(e)}"