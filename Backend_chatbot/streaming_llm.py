"""
streaming_llm.py — Digilab Streaming LLM Client (Gemini)

Fixes applied:
- Client created once in __init__ (not per call)
- GenerateContentConfig created once in __init__
- Proper error handling: rate limit, blocked prompt, auth errors
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
    """Wrapper for streaming responses from Gemini."""

    MODEL_NAME = "gemini-2.5-flash-lite"
    SYSTEM_INSTRUCTION = (
        "You are Digilab, a helpful Media Literacy course assistant for IGNOU students. "
        "Answer clearly and concisely using only the provided context. "
        "Keep responses under 300 words unless more detail is explicitly needed. "
        "Never reveal your underlying model or provider."
    )

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in .env")

        # ✅ New SDK: use genai.Client
        self.client = genai.Client(api_key=api_key)

        # ✅ GenerateContentConfig created ONCE
        self._generation_config = types.GenerateContentConfig(
            system_instruction=self.SYSTEM_INSTRUCTION,
            max_output_tokens=1200,
            temperature=0.3,
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
        """Internal Gemini streaming generator."""

        # ✅ Proper context check — handles None, empty, whitespace-only
        context_clean = (context or "").strip()
        if context_clean:
            full_prompt = f"Context:\n{context_clean}\n\nUser Query: {query}"
        else:
            full_prompt = query

        try:
            response_stream = self.client.models.generate_content_stream(
                model=self.MODEL_NAME,
                contents=full_prompt,
                config=self._generation_config,
            )

            for chunk in response_stream:
                # chunk.text can be None if the chunk carries finish_reason only
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
            elif "blocked" in error_msg or "safety" in error_msg:
                yield "⚠️ This query was blocked by the safety filter."
            else:
                yield f"⚠️ An error occurred: {str(e)}"