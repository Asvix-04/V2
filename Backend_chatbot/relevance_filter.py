"""
AI relevance layer for PDF ingestion.

Reads an uploaded PDF's extracted text paragraph-by-paragraph and keeps ONLY the
parts that belong to the chatbot's domain (Media Literacy / the IGNOU Mass
Communication & Journalism syllabus). Off-domain material — astronomy, astrology,
cars, cooking, sports, unrelated sciences, etc. — is dropped BEFORE it ever
reaches combined_book.txt / BM25 / Pinecone, so it can never be answered.

Primary path: an LLM classifies each paragraph KEEP/DROP in batches.
Fallback: if the LLM is unavailable (e.g. quota), a keyword heuristic decides,
so the obvious off-domain cases are still filtered without any API call.

To change strictness, edit DOMAIN_DESCRIPTION below (e.g. narrow it to strictly
"media literacy" or widen it). The keyword sets are only the offline fallback.
"""

import re
from typing import List, Tuple, Dict, Optional, Any

# ── What the bot is allowed to keep (single source of truth for the LLM) ─────
DOMAIN_DESCRIPTION = (
    "MEDIA LITERACY and the IGNOU Mass Communication & Journalism syllabus — "
    "specifically: media literacy and media education; news and journalism "
    "(print, online, radio, television); media ethics; misinformation, "
    "disinformation, fake news, propaganda, deepfakes and fact-checking; "
    "photography, videography and photojournalism; advertising and public "
    "relations; social media and digital communication; mass communication "
    "theory; and communication / media research methods."
)

OFF_DOMAIN_EXAMPLES = (
    "astronomy, astrology, cosmology, physics, chemistry, biology, mathematics; "
    "automobiles / cars; cooking and recipes; sports; geography or general-"
    "knowledge trivia; finance and stock markets; medicine or human health "
    "(unless it is specifically about health JOURNALISM or media coverage); "
    "and any other subject not about media, communication or journalism."
)

# ── Offline fallback keyword sets (only used when the LLM call fails) ─────────
_DOMAIN_KW_RE = re.compile(
    r"\b(media|journalism|journalist|reporter|reporting|press|news|newspaper|"
    r"magazine|broadcast(?:ing)?|radio|television|\btv\b|photo(?:graph(?:y|er|ic))?|"
    r"photojournalism|videograph|camera|film|cinema|advertis(?:e|ing|ement)|"
    r"public\s+relations|\bpr\b|propaganda|misinformation|disinformation|"
    r"fake\s+news|deepfake|infodemic|gatekeeping|agenda\s+setting|censorship|"
    r"communication|mass\s+communication|audience|literacy|fact[-\s]?check|"
    r"clickbait|echo\s+chamber|social\s+media|digital\s+media|content|headline|"
    r"editor|publish|source|bias|narrative|misleading|manipulat)\b",
    re.IGNORECASE,
)
_OFF_DOMAIN_KW_RE = re.compile(
    r"\b(astronom|astrolog|cosmolog|quasar|photon|telescope|galax|nebula|"
    r"parallax|redshift|cosmic|interstellar|baryon|hubble|zodiac|horoscope|"
    r"automobile|\bcars?\b|engine|horsepower|sedan|recipe|baking|cuisine|"
    r"calorie|cricket|football|soccer|tennis|basketball|quantum|molecule|"
    r"photosynthesis|calculus|algebra|trigonometr|geology|tectonic)\b",
    re.IGNORECASE,
)

_DECISION_RE = re.compile(r"(\d+)\s*[:.\)\-]\s*(KEEP|DROP)", re.IGNORECASE)


def _split_paragraphs(text: str) -> List[str]:
    """Split into paragraph units. Prefer blank-line separation; if the text is
    one-line-per-paragraph (our cleaned txts), that is handled too."""
    blocks = re.split(r"\n\s*\n", text)
    paras: List[str] = []
    for b in blocks:
        for line in b.split("\n"):
            s = line.strip()
            if s:
                paras.append(s)
    return paras


def _keyword_keep(paragraph: str) -> bool:
    """Offline fallback decision for a single paragraph."""
    has_domain = bool(_DOMAIN_KW_RE.search(paragraph))
    has_off = bool(_OFF_DOMAIN_KW_RE.search(paragraph))
    if has_off and not has_domain:
        return False
    # Short structural fragments with no signal either way: keep (harmless).
    return True


def _classify_batch(paragraphs: List[str], start_idx: int,
                    llm_client: Any) -> Dict[int, bool]:
    """Ask the LLM for KEEP/DROP on a batch. Returns {global_index: keep_bool}.
    Any item the LLM doesn't decide falls back to the keyword heuristic."""
    numbered = "\n".join(
        f"{i+1}. {p[:600]}" for i, p in enumerate(paragraphs)
    )
    prompt = (
        f"You are a STRICT content filter for a closed-domain study chatbot.\n\n"
        f"KEEP a paragraph ONLY if its subject matter is about:\n{DOMAIN_DESCRIPTION}\n\n"
        f"DROP a paragraph if it is about anything else, for example:\n{OFF_DOMAIN_EXAMPLES}\n\n"
        f"Rules:\n"
        f"- Judge each paragraph by its ACTUAL topic, not by stray words.\n"
        f"- A short heading should follow the topic it introduces.\n"
        f"- An analogy that is really about an off-domain subject (e.g. using "
        f"astronomy to illustrate a point) must be DROPPED.\n"
        f"- When genuinely unsure, DROP.\n\n"
        f"For EACH numbered paragraph output exactly one line: \"<number>: KEEP\" "
        f"or \"<number>: DROP\". Output nothing else.\n\n"
        f"Paragraphs:\n{numbered}\n\nDecisions:"
    )
    decisions: Dict[int, bool] = {}
    text = None
    try:
        text = llm_client.generate(
            prompt=prompt,
            system_instruction="You are a precise binary content classifier. "
                               "Reply only with the requested 'N: KEEP/DROP' lines.",
            temperature=0.0,
            max_output_tokens=600,
            timeout=60,
        )
    except Exception as e:
        print(f"⚠️  [RelevanceFilter] LLM error: {e} — using keyword fallback for this batch")

    if text:
        for m in _DECISION_RE.finditer(text):
            local = int(m.group(1))
            if 1 <= local <= len(paragraphs):
                decisions[start_idx + local - 1] = (m.group(2).upper() == "KEEP")

    # Fill any undecided items with the keyword heuristic.
    for i, p in enumerate(paragraphs):
        gi = start_idx + i
        if gi not in decisions:
            decisions[gi] = _keyword_keep(p)
    return decisions


def filter_text(
    text: str,
    llm_client: Optional[Any] = None,
    batch_size: int = 20,
    max_batch_chars: int = 6000,
) -> Tuple[str, Dict[str, Any]]:
    """Filter `text` to in-domain paragraphs only.

    NOTE: AI filtering has been disabled per user request to allow ANY PDF
    to be uploaded fully. The LLM prompt will handle domain restriction instead.
    """
    paras = _split_paragraphs(text)
    if not paras:
        return "", {"total": 0, "kept": 0, "dropped": 0, "method": "none",
                    "dropped_samples": []}

    # Bypass filtering completely: keep all paragraphs
    kept_text = "\n".join(paras).strip()
    stats = {
        "total": len(paras),
        "kept": len(paras),
        "dropped": 0,
        "method": "bypassed_per_user",
        "dropped_samples": [],
    }
    return kept_text, stats


def extract_question_by_number(text: str, n: int) -> Optional[str]:
    """Return the text of question number `n` from a numbered question list, or None.

    Handles "Q28. What is propaganda?", "Question 28: ...", "Q.no 28 ..." and plain
    "28. ..." / "28) ..." layouts, whether the questions are inline or one-per-line.
    Pure regex (no LLM) so it adds no latency.
    """
    if not text or n <= 0:
        return None
    num = str(n)
    # 1) "Q28 ...", "question 28: ..." — capture up to the next question marker / line.
    m = re.search(
        r"\bq(?:uestion)?\.?\s*(?:no\.?|number|#)?\s*0*" + num +
        r"\b[\.\):\-]?\s+(.+?)(?=\s*(?:\bq(?:uestion)?\.?\s*\d+\b|\n|\[|\Z))",
        text, re.IGNORECASE | re.DOTALL,
    )
    # 2) Plain numbered line: "28. ..." / "28) ..."
    if not m:
        m = re.search(r"(?m)^\s*0*" + num + r"\s*[.)]\s+(.+)$", text)
    if not m:
        return None
    q = re.sub(r"\s+", " ", m.group(1)).strip(" .:-")
    if len(q) > 220:  # runaway capture (no terminator found) — bound to first question
        cut = q.find("?")
        q = q[: cut + 1] if 0 <= cut <= 220 else q[:220].rsplit(" ", 1)[0]
    return q or None
