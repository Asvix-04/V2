"""
Unified LLM Client — Routes to Gemini or Anthropic Claude.

Supports model switching at runtime without restarting the bot.
"""

from dataclasses import dataclass
import os
import time
import concurrent.futures


@dataclass
class ModelConfig:
    id: str
    display_name: str
    api: str            # "gemini" | "claude"
    description: str
    default_max_tokens: int = 2500  # Per-model token limit


AVAILABLE_MODELS = {
    "1": ModelConfig(
        id="gemini-3-flash-preview",
        display_name="Gemini Flash",
        api="gemini",
        description="⚡ Gemini Flash — Default (Fast, cost-efficient)",
        default_max_tokens=2500,
    ),
    "2": ModelConfig(
        id="gemini-3.1-pro-preview",
        display_name="Gemini Pro",
        api="gemini",
        description="🔬 Gemini Pro — Research (High context, deep reasoning)",
        default_max_tokens=4096,
    ),
    "3": ModelConfig(
        id="claude-haiku-4-5-20251001",
        display_name="Claude Haiku",
        api="claude",
        description="🎯 Claude Haiku — Fast & accurate (Anthropic)",
        default_max_tokens=3000,
    ),
}


class UnifiedLLMClient:
    """
    Wraps both Google Gemini and Anthropic Claude APIs behind a single
    .generate() method. Includes retry logic with exponential backoff.
    """

    def __init__(self, model_config: ModelConfig):
        self.config = model_config

        if model_config.api == "gemini":
            from google import genai
            from google.genai import types
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not found in .env")
            self.client = genai.Client(api_key=api_key)
            self._genai_types = types

        elif model_config.api == "claude":
            import anthropic
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found in .env")
            self.client = anthropic.Anthropic(api_key=api_key)

        else:
            raise ValueError(f"Unknown API: {model_config.api}")

        print(f"🤖 LLM client ready: {model_config.description}")

    # ── Public API ──────────────────────────────────────

    def generate(
        self,
        prompt: str,
        system_instruction: str = None,
        temperature: float = 0.3,
        max_output_tokens: int = 4096,
        top_p: float = 0.95,
        max_retries: int = 3,
        timeout: int = 60,
    ) -> str | None:
        """Generate a response. Returns None on exhausted retries."""
        if self.config.api == "gemini":
            return self._call_gemini(
                prompt, system_instruction, temperature,
                max_output_tokens, top_p, max_retries, timeout,
            )
        else:
            return self._call_claude(
                prompt, system_instruction, temperature,
                max_output_tokens, top_p, max_retries, timeout,
            )

    # ── Gemini ──────────────────────────────────────────

    def _call_gemini(
        self, prompt, system_instruction, temperature,
        max_output_tokens, top_p, max_retries, timeout,
    ) -> str | None:
        types = self._genai_types

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            top_p=top_p,
        )
        if system_instruction:
            config.system_instruction = system_instruction

        for attempt in range(max_retries + 1):
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(
                        self.client.models.generate_content,
                        model=self.config.id,
                        contents=prompt,
                        config=config,
                    )
                    try:
                        response = future.result(timeout=timeout)
                    except concurrent.futures.TimeoutError:
                        print(f"⏱️  Timed out after {timeout}s (attempt {attempt + 1}/{max_retries + 1})")
                        if attempt < max_retries:
                            continue
                        return None
                return response.text

            except concurrent.futures.TimeoutError:
                pass
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    if attempt < max_retries:
                        wait = 5 * (2 ** attempt)
                        print(f"⏳ Rate limited — waiting {wait}s ({attempt + 1}/{max_retries})...")
                        time.sleep(wait)
                        continue
                    print(f"❌ Rate limit persisted after {max_retries} retries")
                    return None
                raise
        return None

    # ── Claude ──────────────────────────────────────────

    def _call_claude(
        self, prompt, system_instruction, temperature,
        max_output_tokens, top_p, max_retries, timeout,
    ) -> str | None:

        kwargs = {
            "model": self.config.id,
            "max_tokens": max_output_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_instruction:
            kwargs["system"] = system_instruction

        for attempt in range(max_retries + 1):
            try:
                response = self.client.messages.create(**kwargs)
                return response.content[0].text

            except Exception as e:
                error_str = str(e).lower()
                if "overloaded" in error_str or "rate_limit" in error_str or "529" in error_str:
                    if attempt < max_retries:
                        wait = 5 * (2 ** attempt)
                        print(f"⏳ Rate limited — waiting {wait}s ({attempt + 1}/{max_retries})...")
                        time.sleep(wait)
                        continue
                    print(f"❌ Rate limit persisted after {max_retries} retries")
                    return None
                raise
        return None
