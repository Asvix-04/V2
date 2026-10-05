"""
Phase 4A Relevance Filter Tests — Structural Heading Fast-Path & Gemini Minimization

Verifies:
1. Structural heading after domain paragraph -> KEEP without calling Gemini.
2. Structural heading before domain paragraph -> KEEP without calling Gemini.
3. Generic short phrase without domain context -> NOT accepted by fast path; calls Gemini / fallback.
4. Off-domain short heading -> NOT accepted by fast path; dropped by off-domain filter.
5. Mixed/ambiguous normal prose paragraph -> still reaches Gemini.
6. Realistic Media Literacy headings ("Core Skills", "Key Takeaways", etc.) bypass Gemini when in context.
7. Output paragraph ordering is strictly preserved.
8. Gemini call count is verified to decrease (performance regression protection).
"""

import unittest
from relevance_filter import (
    filter_text,
    _fast_classify_paragraph,
    _is_structural_heading_candidate,
    _keyword_keep,
)


class MockLLMClient:
    """Mock LLM client to record call count, prompts, and return canned decisions."""

    def __init__(self, response_text: str = "1: KEEP"):
        self.call_count = 0
        self.calls = []
        self.response_text = response_text

    def generate(self, prompt: str, **kwargs) -> str:
        self.call_count += 1
        self.calls.append({"prompt": prompt, "kwargs": kwargs})
        return self.response_text


class TestRelevancePhase4A(unittest.TestCase):

    def setUp(self):
        self.indomain_p1 = (
            "Media literacy is the ability to access, analyze, evaluate, and create media "
            "in a variety of forms. It empowers learners to critically inspect news reports."
        )
        self.indomain_p2 = (
            "Students should verify sources, conduct lateral reading, and check facts "
            "before accepting online reporting as accurate journalism."
        )
        self.indomain_p3 = (
            "Fact-checking organizations systematically identify disinformation, fake news, "
            "and emotional manipulation across social media platforms."
        )

    def test_1_structural_heading_after_domain_paragraph(self):
        """Test 1: Structural heading after domain paragraph is KEEP without calling Gemini."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        text = f"{self.indomain_p1}\n\nCore Skills\n\n{self.indomain_p2}"

        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini must NOT be called for heading in in-domain context")
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["kept"], 3)
        self.assertEqual(stats["dropped"], 0)
        self.assertEqual(stats.get("structural_bypassed"), 1)
        self.assertIn("Core Skills", kept_text)

    def test_2_structural_heading_before_domain_paragraph(self):
        """Test 2: Structural heading before domain paragraph is KEEP without calling Gemini."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        text = f"Why It Matters Today\n\n{self.indomain_p1}"

        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini must NOT be called when heading introduces in-domain content")
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["kept"], 2)
        self.assertEqual(stats["dropped"], 0)
        self.assertEqual(stats.get("structural_bypassed"), 1)
        self.assertIn("Why It Matters Today", kept_text)

    def test_3_generic_short_phrase_without_domain_context(self):
        """Test 3: Generic short phrase without domain context must NOT be accepted by fast path."""
        # When Gemini says DROP, it must be dropped and Gemini must have been called
        mock_llm_drop = MockLLMClient(response_text="1: DROP")
        text = "Core Skills"

        kept_text, stats = filter_text(text, llm_client=mock_llm_drop)

        self.assertEqual(mock_llm_drop.call_count, 1, "Gemini MUST be called for isolated phrase without domain context")
        self.assertEqual(stats["kept"], 0)
        self.assertEqual(stats["dropped"], 1)
        self.assertEqual(stats.get("structural_bypassed", 0), 0)
        self.assertEqual(kept_text, "")

    def test_4_off_domain_short_heading(self):
        """Test 4: Off-domain short heading must NOT be accepted by the structural-heading fast path."""
        mock_llm = MockLLMClient()
        text = "Quantum Computing"

        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini not needed because off-domain keyword triggers Tier 1 DROP")
        self.assertEqual(stats["kept"], 0)
        self.assertEqual(stats["dropped"], 1)
        self.assertEqual(stats.get("structural_bypassed", 0), 0)
        self.assertEqual(kept_text, "")

    def test_5_mixed_ambiguous_prose_paragraph_reaches_gemini(self):
        """Test 5: Normal semantic prose paragraph that is ambiguous still reaches Gemini."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        # Surrounded by in-domain text, but it is normal prose (>8 words and ends with a period)
        prose_ambiguous = (
            "The committee completed an extensive evaluation of the procedural guidelines "
            "and finalized the implementation framework."
        )
        text = f"{self.indomain_p1}\n\n{prose_ambiguous}\n\n{self.indomain_p2}"

        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 1, "Gemini MUST be called for ambiguous semantic prose")
        self.assertEqual(stats["kept"], 3)
        self.assertIn("The committee completed", kept_text)

    def test_6_realistic_media_literacy_headings_bypass_gemini(self):
        """Test 6: Realistic Media Literacy headings bypass Gemini when surrounded by in-domain content."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        headings = [
            "Why It Matters Today",
            "Core Skills",
            "Habits That Support Good Judgment",
            "Spotting Misinformation",
            "Creating Responsibly",
            "Key Takeaways",
        ]

        paras = []
        for h in headings:
            paras.append(h)
            paras.append(self.indomain_p1)

        text = "\n\n".join(paras)
        kept_text, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "All realistic structural headings must bypass Gemini")
        self.assertEqual(stats["kept"], len(paras))
        self.assertEqual(stats["dropped"], 0)
        self.assertEqual(stats.get("structural_bypassed"), len(headings))
        for h in headings:
            self.assertIn(h, kept_text)

    def test_7_order_preservation(self):
        """Test 7: Input order is strictly preserved across in-domain, headings, ambiguous, and off-domain."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        # P1: in-domain
        # P2: structural heading
        # P3: in-domain
        # P4: ambiguous prose (Gemini KEEP)
        # P5: off-domain (Tier 1 DROP)
        # P6: structural heading (after off-domain, followed by in-domain)
        # P7: in-domain
        p1 = self.indomain_p1
        p2 = "Core Skills"
        p3 = self.indomain_p2
        p4 = "The administrative sub-committee concluded the procedural assessment."
        p5 = "Astronomers measured cosmological redshift and planetary nebula light with the telescope."
        p6 = "Key Takeaways"
        p7 = self.indomain_p3

        text = f"{p1}\n\n{p2}\n\n{p3}\n\n{p4}\n\n{p5}\n\n{p6}\n\n{p7}"
        kept_text, stats = filter_text(text, llm_client=mock_llm)

        actual_kept = [p.strip() for p in kept_text.split("\n") if p.strip()]
        expected_kept = [p1, p2, p3, p4, p6, p7]

        self.assertEqual(actual_kept, expected_kept, "Paragraph order must strictly match original document")
        self.assertEqual(stats["total"], 7)
        self.assertEqual(stats["kept"], 6)
        self.assertEqual(stats["dropped"], 1)

    def test_8_gemini_call_count_reduction(self):
        """Test 8: Adding safe structural headings reduces Gemini call count to zero when in context."""
        mock_llm = MockLLMClient(response_text="1: KEEP")
        text = (
            f"{self.indomain_p1}\n\n"
            f"Core Skills\n\n"
            f"{self.indomain_p2}\n\n"
            f"Key Takeaways\n\n"
            f"{self.indomain_p3}"
        )
        _, stats = filter_text(text, llm_client=mock_llm)

        self.assertEqual(mock_llm.call_count, 0, "Gemini calls must be 0 for document with in-domain text and structural headings")
        self.assertEqual(stats["structural_bypassed"], 2)

    def test_heading_candidate_detector_unit(self):
        """Unit tests for _is_structural_heading_candidate."""
        # Valid structural headings
        self.assertTrue(_is_structural_heading_candidate("Core Skills"))
        self.assertTrue(_is_structural_heading_candidate("Why It Matters Today"))
        self.assertTrue(_is_structural_heading_candidate("Habits That Support Good Judgment"))
        self.assertTrue(_is_structural_heading_candidate("A Note on Scale and Signals"))
        self.assertTrue(_is_structural_heading_candidate("Spotting Misinformation"))
        self.assertTrue(_is_structural_heading_candidate("Creating Responsibly"))
        self.assertTrue(_is_structural_heading_candidate("Key Takeaways"))
        self.assertTrue(_is_structural_heading_candidate("1. Core Skills"))
        self.assertTrue(_is_structural_heading_candidate("Chapter 2: Verification Methods"))
        self.assertTrue(_is_structural_heading_candidate("### Overview"))
        self.assertTrue(_is_structural_heading_candidate("Why Does It Matter?"))
        self.assertTrue(_is_structural_heading_candidate("Essential Guidelines:"))

        # Invalid structural headings (prose, long, punctuation-heavy, multi-sentence)
        self.assertFalse(_is_structural_heading_candidate(""))
        self.assertFalse(_is_structural_heading_candidate("   "))
        self.assertFalse(_is_structural_heading_candidate("Line 1\nLine 2"))
        self.assertFalse(_is_structural_heading_candidate(
            "This is a very long paragraph that goes on and on with way more than eight words in total."
        ))
        self.assertFalse(_is_structural_heading_candidate("First sentence. Second sentence."))
        self.assertFalse(_is_structural_heading_candidate("Item one, item two, item three, and item four."))
        self.assertFalse(_is_structural_heading_candidate("Students must practice lateral reading."))

    def test_off_domain_document_headings_do_not_bypass(self):
        """Verify that headings in an off-domain document do not bypass Gemini."""
        mock_llm = MockLLMClient(response_text="1: DROP")
        off_p1 = "Astronomers observe distant quasars, cosmic nebulae, and stellar parallax across ancient galaxies."
        off_p2 = "Telescope instruments correct for atmospheric distortions and interstellar dust attenuation."
        text = f"{off_p1}\n\nCore Skills\n\n{off_p2}"

        kept_text, stats = filter_text(text, llm_client=mock_llm)

        # 'Core Skills' is between two off-domain paragraphs, so it has NO in-domain neighbor
        self.assertEqual(mock_llm.call_count, 1, "Gemini MUST be called for heading in off-domain context")
        self.assertEqual(stats["kept"], 0)
        self.assertEqual(stats["dropped"], 3)
        self.assertEqual(stats.get("structural_bypassed", 0), 0)


if __name__ == "__main__":
    unittest.main()
