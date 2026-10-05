"""
Phase 4 Relevance Filter Tests — Two-Tier Fast Path & Gemini Minimization

Verifies:
1. Clear in-domain paragraph -> classified KEEP, Gemini NOT called.
2. Clear off-domain paragraph -> classified DROP, Gemini NOT called.
3. Ambiguous paragraph -> Gemini IS called, result respected.
4. Mixed domain/off-domain paragraph -> Gemini IS called.
5. Paragraph ordering is strictly preserved.
6. Empty / completely off-domain validation behavior remains intact.
"""

import unittest
from unittest.mock import MagicMock
from relevance_filter import filter_text, _fast_classify_paragraph, _keyword_keep


class MockLLMClient:
    """Mock LLM client to record call count and return canned responses."""

    def __init__(self, response_text: str = "1: KEEP"):
        self.call_count = 0
        self.calls = []
        self.response_text = response_text

    def generate(self, prompt: str, **kwargs) -> str:
        self.call_count += 1
        self.calls.append({"prompt": prompt, "kwargs": kwargs})
        return self.response_text


class TestRelevancePhase4(unittest.TestCase):

    def test_1_clear_indomain_bypasses_gemini(self):
        """Test 1: Clear in-domain paragraph is classified KEEP without calling Gemini."""
        mock_llm = MockLLMClient()
        text = (
            "Digital media literacy empowers citizens to critically evaluate news "
            "reporting, detect online misinformation, and verify source credibility."
        )
        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini must NOT be called for clear in-domain paragraph")
        self.assertEqual(stats["total"], 1)
        self.assertEqual(stats["kept"], 1)
        self.assertEqual(stats["dropped"], 0)
        self.assertIn("Digital media literacy", kept_text)

    def test_2_clear_offdomain_bypasses_gemini(self):
        """Test 2: Clear off-domain paragraph is classified DROP without calling Gemini."""
        mock_llm = MockLLMClient()
        text = (
            "Astronomers used the Hubble space telescope to observe distant quasars, "
            "cosmic nebulae, and stellar parallax across ancient galaxies."
        )
        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini must NOT be called for clear off-domain paragraph")
        self.assertEqual(stats["total"], 1)
        self.assertEqual(stats["kept"], 0)
        self.assertEqual(stats["dropped"], 1)
        self.assertEqual(kept_text, "")

    def test_3_ambiguous_paragraph_calls_gemini_and_respects_result(self):
        """Test 3: Ambiguous paragraph falls through to Gemini and respects its decision."""
        # 3a: Gemini returns KEEP
        mock_llm_keep = MockLLMClient(response_text="1: KEEP")
        ambiguous_text = (
            "The committee completed an extensive evaluation of the procedural guidelines "
            "and finalized the implementation framework."
        )
        kept_text, stats = filter_text(ambiguous_text, llm_client=mock_llm_keep)

        self.assertGreaterEqual(mock_llm_keep.call_count, 1, "Gemini MUST be called for ambiguous paragraph")
        self.assertEqual(stats["kept"], 1)
        self.assertIn("committee completed", kept_text)

        # 3b: Gemini returns DROP
        mock_llm_drop = MockLLMClient(response_text="1: DROP")
        kept_text_drop, stats_drop = filter_text(ambiguous_text, llm_client=mock_llm_drop)

        self.assertGreaterEqual(mock_llm_drop.call_count, 1, "Gemini MUST be called for ambiguous paragraph")
        self.assertEqual(stats_drop["kept"], 0)
        self.assertEqual(stats_drop["dropped"], 1)
        self.assertEqual(kept_text_drop, "")

    def test_4_mixed_domain_offdomain_calls_gemini(self):
        """Test 4: Paragraph with mixed domain and off-domain markers falls through to Gemini."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        mixed_text = (
            "While traveling in an automobile with high engine horsepower, the investigative "
            "reporter tuned into the radio broadcast about astronomical telescope research."
        )
        kept_text, stats = filter_text(mixed_text, llm_client=mock_llm)

        self.assertGreaterEqual(mock_llm.call_count, 1, "Gemini MUST be called when mixed domain/off-domain markers exist")
        self.assertEqual(stats["kept"], 1)
        self.assertIn("investigative reporter", kept_text)

    def test_5_paragraph_ordering_preserved(self):
        """Test 5: Filtered output strictly preserves the original paragraph sequence."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        # Mixed stream of paragraphs:
        # P1: in-domain
        # P2: off-domain (should be dropped)
        # P3: in-domain
        # P4: ambiguous (Gemini KEEP)
        # P5: in-domain
        p1 = "Media literacy and journalism standards ensure accurate news reporting."
        p2 = "Astronomers measured cosmological redshift and planetary nebula light."
        p3 = "Fact-checking organizations systematically identify disinformation."
        p4 = "The review board reached consensus on standard operating practices."
        p5 = "Public relations professionals manage external communication ethics."

        full_text = f"{p1}\n\n{p2}\n\n{p3}\n\n{p4}\n\n{p5}"
        kept_text, stats = filter_text(full_text, llm_client=mock_llm)

        expected_paras = [p1, p3, p4, p5]
        actual_paras = [p for p in kept_text.split("\n") if p.strip()]

        self.assertEqual(actual_paras, expected_paras, "Paragraph ordering must match the original document")
        self.assertEqual(stats["total"], 5)
        self.assertEqual(stats["kept"], 4)
        self.assertEqual(stats["dropped"], 1)

    def test_6_empty_and_all_offdomain_handling(self):
        """Test 6: Empty text and entirely off-domain text preserve existing behavior."""
        mock_llm = MockLLMClient()

        # Empty text
        kept_empty, stats_empty = filter_text("", llm_client=mock_llm)
        self.assertEqual(kept_empty, "")
        self.assertEqual(stats_empty["total"], 0)
        self.assertEqual(stats_empty["kept"], 0)
        self.assertEqual(stats_empty["dropped"], 0)
        self.assertEqual(stats_empty["method"], "none")

        # Entirely off-domain text (multi-paragraph with compiled off-domain keywords)
        off_text = (
            "Calculus and algebra form the foundation of advanced mathematics.\n\n"
            "Astronomers observe planetary nebula and cosmic dust in distant galaxies.\n\n"
            "Automobile engines require regular oil changes for optimal horsepower."
        )
        kept_off, stats_off = filter_text(off_text, llm_client=mock_llm)
        self.assertEqual(mock_llm.call_count, 0, "No Gemini call needed when all paragraphs are clearly off-domain")
        self.assertEqual(kept_off, "")
        self.assertEqual(stats_off["total"], 3)
        self.assertEqual(stats_off["kept"], 0)
        self.assertEqual(stats_off["dropped"], 3)


if __name__ == "__main__":
    unittest.main()
