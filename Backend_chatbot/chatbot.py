"""
chatbot.py — Digilab Media Literacy Course Chatbot.

Merged version combining:
- Downloads chatbot.py  (v6: follow-up continuity guard, smart redirect, follow-up generator)
- Downloads chatbot (1).py (v6: _is_likely_followup, _record_turn, _get_recent_conversation_context)
- worker/chatbot.py     (v7: dynamic length detection, auth-error handling, v7 system prompt)

All features from every version are preserved and active.
"""

from typing import List, Dict, Any
from dataclasses import dataclass
from urllib.parse import quote
import os, json, re, time
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever
from llm_client import UnifiedLLMClient, AVAILABLE_MODELS, ModelConfig
from follow_up_generator import FollowUpGenerator

load_dotenv()


@dataclass
class ResponseIntent:
    followup_mode: str = "none"      # none | expand | simplify | reformat
    avoid_repetition: bool = False
    tone_signal: str = "auto"        # auto | simple | formal | exam
    format_signal: str = "auto"      # auto | bullets | numbered | table | prose | comparison


_TONE_TEMPERATURE = {
    "simple": 0.55,
    "formal": 0.25,
    "exam": 0.2,
    "auto": 0.35,
}


OUT_OF_SCOPE_MESSAGE = """This question is outside the scope of the Media Literacy course materials.

I'm Digilab — I can help you with topics covered in your IGNOU Mass Communication and Journalism syllabus, including:

• Journalism (print, online, radio, television)
• Digital Photography & Videography
• Media Literacy & Media Ethics
• Advertising & Public Relations
• Social Media & Digital Communication
• Visual Communication & Photojournalism
• Communication Theory & Research Methods

Try asking about one of these topics!"""

RATE_LIMIT_MESSAGE = "I'm currently experiencing high traffic. Please wait a moment and try again."

# Shared greeting-prefix regex — used by both `_strip_greeting` and the classifier
# sanity check that reroutes a mis-classified "greeting" into "greeting_syllabus".
GREETING_PREFIX_RE = re.compile(
    r'^\s*(hello+|hi+|hey+|good\s+(morning|afternoon|evening|night)|namaste|'
    r'namaskar|hola|howdy|greetings?|yo|sup)\b[\s,!.\-—:]*',
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────
# Module-level helpers  (from Downloads chatbot.py)
# ─────────────────────────────────────────────────────────────

_QUESTION_STOPWORDS = {
    'what', 'is', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'by', 'how', 'does', 'do', 'are', 'me', 'my', 'it', 'its', 'tell', 'can', 'you',
    'about', 'this', 'that', 'why', 'when', 'where', 'which', 'who', 'whom', 'was', 'were',
    'been', 'being', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'must', 'need', 'dare', 'not', 'from', 'into', 'than', 'then', 'also', 'just',
    'only', 'very', 'most', 'more', 'less', 'much', 'many', 'some', 'any', 'each', 'every',
    'both', 'few', 'all', 'same', 'other', 'such', 'like', 'well', 'important', 'between',
    'different', 'explain', 'describe', 'discuss', 'compare', 'define', 'give', 'make',
    'take', 'come', 'know', 'think', 'list', 'name', 'state', 'mention', 'elaborate',
    'relate', 'related', 'good', 'best', 'better', 'still', 'even', 'after', 'before',
    'over', 'under', 'through', 'during', 'while', 'because', 'since', 'until'
}


def _normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s-]', ' ', (text or '').lower())).strip()


def _extract_question_terms(question: str) -> List[str]:
    terms = [term for term in re.findall(r'\b[a-zA-Z][a-zA-Z-]{2,}\b', (question or '').lower())
             if term not in _QUESTION_STOPWORDS]
    seen = set()
    unique_terms = []
    for term in terms:
        if term not in seen:
            seen.add(term)
            unique_terms.append(term)
    return unique_terms


def _has_direct_topic_match(question: str, retrieved_context: Any) -> bool:
    terms = _extract_question_terms(question)
    if not terms or not retrieved_context or not getattr(retrieved_context, 'vector_results', None):
        return False

    question_phrase = ' '.join(terms[:4])
    for result in retrieved_context.vector_results:
        metadata = result.metadata if hasattr(result, 'metadata') else {}
        haystacks = [metadata.get('full_section', ''), metadata.get('text', '')]
        if hasattr(result, 'text') and result.text:
            haystacks.append(result.text)

        for haystack in haystacks:
            normalized_haystack = _normalize_text(haystack)
            if not normalized_haystack:
                continue
            if question_phrase and question_phrase in normalized_haystack:
                return True
            if all(term in normalized_haystack for term in terms):
                return True

    return False


def _is_contextual_follow_up(question: str, conversation_history: List[Dict[str, Any]]) -> bool:
    """Detect whether the current question is a follow-up to the previous turn."""
    if not conversation_history:
        return False

    last_turn = conversation_history[-1]
    last_question = last_turn.get('question', '')
    last_answer = last_turn.get('answer', '')

    current_terms = set(_extract_question_terms(question))
    if not current_terms:
        return False

    previous_question_terms = set(_extract_question_terms(last_question))
    previous_answer_terms = {
        term for term in re.findall(r'\b[a-zA-Z][a-zA-Z-]{3,}\b', (last_answer or '').lower())
        if term not in _QUESTION_STOPWORDS
    }

    overlap_with_previous_question = len(current_terms.intersection(previous_question_terms)) >= 2
    overlap_with_previous_answer = len(current_terms.intersection(previous_answer_terms)) >= 2

    question_lower = (question or '').lower()
    referential_follow_up = any(token in question_lower for token in (
        'this ', 'that ', 'these ', 'those ', 'it ', 'they ', 'such '
    )) and len(current_terms.intersection(previous_answer_terms)) >= 1

    return overlap_with_previous_question or overlap_with_previous_answer or referential_follow_up


def _build_smart_redirect(retrieved_context: Any) -> str:
    """
    FIX 4 — Smart out-of-scope redirect.

    When a question is refused but the retriever DID find related course sections
    (score 0.020-0.060, topic not main subject), generate a redirect that mentions
    the closest actual course topic instead of the generic message.
    """
    if not retrieved_context or not retrieved_context.vector_results:
        return OUT_OF_SCOPE_MESSAGE

    seen = set()
    related_topics = []
    for r in retrieved_context.vector_results[:5]:
        meta = r.metadata if hasattr(r, 'metadata') else {}
        section = meta.get('full_section', '')
        parts = [p.strip() for p in section.split('>') if p.strip()
                 and p.strip().lower() not in ('introduction', 'unknown', 'root')]
        if parts:
            topic = parts[-1][:60]
            if topic not in seen and len(topic) > 5:
                seen.add(topic)
                related_topics.append(topic)

    if not related_topics:
        return OUT_OF_SCOPE_MESSAGE

    topic_hint = related_topics[0]
    return (
        f"This specific question is outside the scope of the course materials.\n\n"
        f"However, related topics that ARE covered in your IGNOU syllabus include: "
        f"**{topic_hint}**"
        + (f" and **{related_topics[1]}**" if len(related_topics) > 1 else "")
        + f".\n\nTry rephrasing your question around one of those topics, or ask about:\n\n"
        f"• Journalism (print, online, radio, television)\n"
        f"• Digital Photography & Videography\n"
        f"• Media Literacy & Media Ethics\n"
        f"• Advertising & Public Relations\n"
        f"• Social Media & Digital Communication\n"
        f"• Visual Communication & Photojournalism\n"
        f"• Communication Theory & Research Methods"
    )


# ─────────────────────────────────────────────────────────────
# PDFChatbot class
# ─────────────────────────────────────────────────────────────

class PDFChatbot:
    """
    IGNOU Media Literacy Course Chatbot — Digilab v7 (merged).

    Features combined from all versions:
    - v6: Smart out-of-scope redirect using retrieved section names (FIX 4)
    - v6: Follow-up continuity guard (_is_likely_followup, _record_turn,
          _build_followup_retrieval_query, _get_recent_conversation_context)
    - v6: Module-level topic-match helpers (_has_direct_topic_match,
          _is_contextual_follow_up, _normalize_text, _extract_question_terms)
    - v6: Follow-up question generation (FollowUpGenerator integration,
          generate_follow_up_questions, ask_question_with_follow_ups)
    - v7: Dynamic answer length detection (_detect_length_instruction)
          — injects [LENGTH] tag into every synthesis prompt
    - v7: Auth-error detection in ask_question and _validate_content_sufficiency
    - v7: Stricter validation output format instruction
    - v7: Updated system prompt with [LENGTH] obedience section
    """

    def __init__(self, model_config: ModelConfig = None):
        if model_config is None:
            model_config = AVAILABLE_MODELS["1"]
        self.model_config = model_config
        self.llm_client = UnifiedLLMClient(model_config)
        self.retriever = HybridRetriever()
        self.conversation_history = []
        self.follow_up_generator = FollowUpGenerator(self.llm_client)
        self._system_prompt = self._get_system_prompt()

    def switch_model(self, model_config: ModelConfig):
        """Switch LLM model without losing conversation history."""
        self.llm_client = UnifiedLLMClient(model_config)
        self.model_config = model_config
        self.follow_up_generator = FollowUpGenerator(self.llm_client)

    # ─────────────────────────────────────────────────────────
    # Follow-up continuity helpers  (from chatbot (1).py / v6)
    # ─────────────────────────────────────────────────────────

    def _is_non_context_answer(self, answer: str) -> bool:
        cleaned = (answer or '').strip()
        if not cleaned:
            return True
        if cleaned in (OUT_OF_SCOPE_MESSAGE, RATE_LIMIT_MESSAGE):
            return True
        if cleaned.startswith("I encountered an error:"):
            return True
        # Catch smart redirect messages and any out-of-scope variants
        cleaned_lower = cleaned.lower()
        if "outside the scope" in cleaned_lower or "outside the course materials" in cleaned_lower:
            return True
        return False

    def _record_turn(self, question: str, answer: str, use_history: bool = True,
                     sources: List[Dict[str, Any]] = None,
                     expanded_queries: List[str] = None,
                     validation: Dict[str, Any] = None,
                     is_vague: bool = False):
        if not use_history:
            return
        self.conversation_history.append({
            'question': question,
            'answer': answer,
            'sources': sources or [],
            'expanded_queries': expanded_queries or [],
            'validation': validation or {},
            'is_vague': is_vague
        })

    def _build_followup_retrieval_query(self, question: str, max_turns: int = 2) -> str:
        recent_questions = []
        for conv in self.conversation_history[-max_turns:]:
            q = (conv.get('question') or '').strip()
            if q:
                recent_questions.append(q)
        if not recent_questions:
            return question
        anchor = " ; ".join(recent_questions)
        return f"{question} [follow-up context: {anchor}]"

    def _get_recent_conversation_context(self, max_turns: int = 2) -> str:
        if not self.conversation_history:
            return ""
        snippets = []
        for conv in self.conversation_history[-max_turns:]:
            q = (conv.get('question') or '').strip()
            a = (conv.get('answer') or '').strip().replace("\n", " ")
            if not q:
                continue
            if self._is_non_context_answer(a):
                snippets.append(f"Q: {q}")
                continue
            if len(a) > 180:
                a = a[:180] + "..."
            snippets.append(f"Q: {q}\nA: {a}")
        return "\n\n".join(snippets)

    def _is_likely_followup(self, question: str) -> bool:
        q = (question or '').strip().lower()
        if not q:
            return False
        followup_phrases = (
            "how does it", "how is it", "what about", "how about", "tell me more",
            "explain more", "can you elaborate", "difference", "compare", "relation",
            "related", "in this", "in that", "in this context", "in this case",
            "example of this", "another example", "also", "and ", "then ", "so "
        )
        if any(phrase in q for phrase in followup_phrases):
            return True
        words = re.findall(r"[a-z']+", q)
        pronouns = {"it", "this", "that", "these", "those", "they", "them", "its", "their", "here", "there"}
        return len(words) <= 14 and any(w in pronouns for w in words)

    def _get_greeting_response(self, question: str) -> str:
        prompt = (
            f"The user said: '{question}'\n\n"
            f"You are Digilab, a friendly Media Literacy academic assistant chatbot.\n\n"
            f"IMPORTANT: You must respond to the FULL message, not just the greeting part.\n"
            f"Examples:\n"
            f"- 'hi how are you' → 'Hey! I'm doing great, thanks for asking! Feel free to ask me anything about Media Literacy.'\n"
            f"- 'good morning' → 'Good morning! Hope you're having a great day. What would you like to learn about Media Literacy?'\n"
            f"- 'who are you' → 'I'm Digilab, your Media Literacy academic assistant! Ask me anything about the subject.'\n"
            f"- 'what can you do' → 'I can help you with Media Literacy topics like journalism, digital photography, media ethics and more!'\n"
            f"- 'are you a bot' → 'Yes, I'm Digilab, an AI-powered Media Literacy assistant. How can I help you today?'\n"
            f"- 'bye' → 'Goodbye! Hope to see you soon. Feel free to come back anytime!'\n"
            f"- 'thanks' → 'You're welcome! Let me know if you need anything else.'\n\n"
            f"Rules:\n"
            f"- Respond to the COMPLETE message, not just 'hi' or 'hello'\n"
            f"- Keep it to 1-2 sentences\n"
            f"- Do NOT answer academic questions here\n"
            f"- Always sound warm and friendly\n"
            f"- NEVER reveal your underlying technology, model, or provider\n"
        )
        try:
            result = self._call_llm(
                prompt=prompt,
                system_instruction="You are Digilab, a friendly Media Literacy academic assistant. Always respond to the full message, not just the greeting word.",
                temperature=0.7,
                max_output_tokens=150,  
            )
            return result.strip() if result else "Hey! I'm Digilab, your Media Literacy assistant. What would you like to explore?"
        except Exception as e:
            print(f"Greeting response generation failed: {e}")
            return "Hello! I'm Digilab, your Media Literacy assistant. Feel free to ask me anything!"

    # ─────────────────────────────────────────────────────────
    # Safety + input classification  (from intern's chatbot (1).py)
    # ─────────────────────────────────────────────────────────

    def _contains_profanity(self, question: str) -> bool:
        q = (question or "").lower()
        swear_words = ["fuck", "bitch", "damn", "crap", "shit", "asshole", "bastard"]
        # Word-boundary match so "hello" doesn't match "hell", "shell" doesn't match "hell", etc.
        return any(re.search(rf"\b{re.escape(w)}\b", q) for w in swear_words)

    def _contains_harmful_content(self, question: str) -> bool:
        # Prompt avoids trigger keywords (bomb/weapon/etc) so the classifier LLM's own
        # safety filter does not blank our response and produce false positives.
        prompt = (
            f"You are an academic-platform safety classifier for IGNOU Media Literacy students.\n\n"
            f"A message is UNSAFE only if the student is asking how to perform a real-world\n"
            f"action that causes serious physical, financial, or digital harm to themselves\n"
            f"or others.\n\n"
            f"A message is SAFE if it is any academic, conceptual, definitional, comparative,\n"
            f"or analytical question — even if the topic itself is sensitive (e.g. propaganda,\n"
            f"misinformation, deepfakes, censorship). Discussing concepts is always safe.\n\n"
            f"User message: {question}\n\n"
            f"Reply with EXACTLY ONE WORD: SAFE or UNSAFE."
        )
        try:
            result = self._call_llm(
                prompt=prompt,
                system_instruction="Reply with exactly one word: SAFE or UNSAFE.",
                temperature=0.0,
                max_output_tokens=10,
            )
            result_clean = (result or "").strip().lower()
            print(f"DEBUG safety classifier raw: '{result}' -> '{result_clean}'")
            # If the LLM returns nothing, DEFAULT TO SAFE — empty often just means
            # the upstream safety filter blanked out, not that the input was unsafe.
            if not result_clean:
                return False
            return result_clean.startswith("unsafe")
        except Exception as e:
            print(f"Harmful content check failed: {e}")
            return False

    def _classify_input(self, question: str) -> str:
        """Classify message into greeting | greeting_syllabus | syllabus | out_of_syllabus."""
        prompt = (
            f"Classify the user message into EXACTLY ONE category.\n\n"
            f"Categories:\n"
            f"- greeting: ONLY a conversational message with no academic question.\n"
            f"  Examples: 'hi', 'hello', 'good morning', 'who are you', 'thanks', 'bye', 'how are you'.\n"
            f"- greeting_syllabus: a greeting AND an academic question in the same message.\n"
            f"  Examples: 'hi what is journalism', 'hello explain media ethics',\n"
            f"  'good morning, what is photography', 'hey can you tell me about deepfakes'.\n"
            f"  IMPORTANT: If the message starts with hi/hello/hey/good morning/etc AND also contains\n"
            f"  a topic question, it is ALWAYS 'greeting_syllabus', NEVER plain 'syllabus'.\n"
            f"- syllabus: an academic question with NO greeting attached.\n"
            f"  Examples: 'what is journalism', 'explain photojournalism', 'compare radio and TV'.\n"
            f"- out_of_syllabus: not related to Media Literacy / Journalism / Mass Communication.\n"
            f"  Examples: 'what is the capital of France', 'how to cook pasta'.\n\n"
            f"User message: {question}\n\n"
            f"Reply with EXACTLY ONE WORD: greeting, greeting_syllabus, syllabus, or out_of_syllabus."
        )
        try:
            result = self._call_llm(
                prompt=prompt,
                system_instruction="Reply with exactly one word from: greeting, greeting_syllabus, syllabus, out_of_syllabus. Nothing else.",
                temperature=0.0,
                max_output_tokens=20,
            )
            raw = (result or "").strip().lower().strip("'\"`.,!")
            print(f"DEBUG classifier raw: '{result}' -> cleaned: '{raw}'")
            if raw in ("greeting", "greeting_syllabus", "syllabus", "out_of_syllabus"):
                return raw
            # Last-resort substring match if the LLM padded the answer
            for cat in ("greeting_syllabus", "out_of_syllabus", "greeting", "syllabus"):
                if cat in raw:
                    return cat
            return "syllabus"
        except Exception as e:
            print(f"Classification failed: {e}")
            return "syllabus"

    def _get_brief_greeting_opener(self, question: str) -> str:
        """
        Generate ONLY a 1-line friendly opener for greeting_syllabus mode.
        Must NOT address the academic content in the message — the academic part
        is handled by the normal RAG pipeline and concatenated after this opener.
        """
        prompt = (
            f"The user message below begins with a greeting and then asks an academic question.\n"
            f"Your job: produce ONLY a brief, warm one-line opener that acknowledges the greeting.\n"
            f"DO NOT answer or even hint at the academic question — another system handles that.\n\n"
            f"Examples:\n"
            f"- input: 'hi what is journalism'           → output: 'Hi there!'\n"
            f"- input: 'hello explain media ethics'      → output: 'Hello!'\n"
            f"- input: 'good morning, what is photography' → output: 'Good morning!'\n"
            f"- input: 'hey can you tell me about deepfakes' → output: 'Hey!'\n\n"
            f"User message: {question}\n\n"
            f"Reply with ONLY the short opener — no academic content, max 6 words."
        )
        try:
            result = self._call_llm(
                prompt=prompt,
                system_instruction="Return only a short friendly opener (max 6 words). Do not answer the academic part.",
                temperature=0.3,
                max_output_tokens=20,
            )
            opener = (result or "").strip().strip('"\'')
            # Safety net: if the LLM ignored instructions and wrote a long answer,
            # truncate to the first sentence so we don't double-answer.
            if opener and len(opener) > 60:
                opener = opener.split(".")[0].split("!")[0].strip() + "!"
            return opener or "Hi there!"
        except Exception as e:
            print(f"Brief greeting opener failed: {e}")
            return "Hi there!"

    def _strip_greeting(self, question: str) -> str:
        """Remove the greeting prefix from a combined 'hi + question' message.

        Regex fast path handles common greetings deterministically (no LLM call,
        no over-stripping risk). LLM fallback only fires for unusual phrasings.
        """
        if not question:
            return question

        regex_stripped = GREETING_PREFIX_RE.sub('', question).strip()

        # Accept regex result if it kept most of the original content (no over-strip).
        if regex_stripped and len(regex_stripped.split()) >= 2:
            print(f"DEBUG strip_greeting (regex): '{question}' -> '{regex_stripped}'")
            return regex_stripped

        # LLM fallback for unusual phrasings the regex missed.
        prompt = (
            f"Remove only the greeting part from this message and return the remaining academic question.\n"
            f"Examples:\n"
            f"- 'good morning, what is media literacy' → 'what is media literacy'\n"
            f"- 'hi explain deepfake' → 'explain deepfake'\n"
            f"- 'hello what is journalism' → 'what is journalism'\n\n"
            f"Message: {question}\n"
            f"Return ONLY the remaining question, nothing else. Do not shorten it."
        )
        try:
            result = self._call_llm(
                prompt=prompt,
                system_instruction="Return only the academic question part, removing any greeting. Do not shorten the question itself.",
                temperature=0.0,
                max_output_tokens=200,
            )
            cleaned = (result or "").strip().strip('"\'`').rstrip('.')
            print(f"DEBUG strip_greeting (LLM): '{question}' -> '{cleaned}'")
            # Safety net: reject degenerate outputs (1 word, or shorter than 30% of original).
            if cleaned and len(cleaned.split()) >= 2 and len(cleaned) >= len(question) * 0.3:
                return cleaned
            # Fall back to regex result if it at least removed the greeting word
            if regex_stripped:
                return regex_stripped
            return question
        except Exception as e:
            print(f"Strip greeting failed: {e}")
            return regex_stripped or question

    def _is_vague_question(self, question: str) -> bool:
        """True if question carries no topic and needs context to resolve."""
        if not self.conversation_history:
            return False
        # Walk back past vague turns AND non-context (refused/error) turns to find
        # whether a real substantive anchor exists in history. Without this walk-back,
        # a refused turn immediately before a vague follow-up would make us return
        # False and treat "tell me more" as a brand-new question.
        anchor_exists = False
        for turn in reversed(self.conversation_history):
            if turn.get('is_vague', False):
                continue
            if self._is_non_context_answer(turn.get('answer', '')):
                continue
            anchor_exists = True
            break
        if not anchor_exists:
            return False
        terms = _extract_question_terms(question)
        # Tier 1: regex fast-path (no LLM, instant) — only when few content terms
        if len(terms) <= 1:
            vague_patterns = (
                r'\bexplain\s+(me\s+)?(more|further|again|in\s+detail)\b',
                r'\btell\s+me\s+more\b',
                r'\bgive\s+(me\s+)?(an?\s+)?example',
                r'\bmore\s+(detail|on\s+this|information)\b',
                r'\bcan\s+you\s+(define|clarify|elaborate)\b',
                r'\bexpand\s+on\b',
                r'\belaborate\b',
                r'\bwhat\s+do\s+you\s+mean\b',
                r'\bwhat\s+does\s+that\s+mean\b',
                r'\bin\s+simpler\s+terms\b',
                r'\bgo\s+deeper\b',
                r'\bdefine\s+it\b',
                r'\bexplain\s+it\b',
            )
            q = (question or '').lower().strip()
            if any(re.search(p, q) for p in vague_patterns):
                return True
        # Tier 2: LLM classifier — handles typos, short forms, novel phrasing
        return self._llm_classify_vague(question)

    def _llm_classify_vague(self, question: str) -> bool:
        """Binary LLM classifier: is this a vague follow-up with no new topic?"""
        try:
            context = self._get_recent_conversation_context(max_turns=1)
            if not context:
                return False
            prompt = (
                f"Recent conversation:\n{context}\n\n"
                f"Student's follow-up: \"{question}\"\n\n"
                "Reply with ONLY \"yes\" or \"no\".\n"
                "Is this follow-up a vague request — no new topic, just wanting more detail / "
                "an example / clarification / elaboration on the topic above? "
                "Answer yes even if the question has typos, short forms, or informal phrasing."
            )
            result = self._call_llm(
                prompt=prompt,
                system_instruction="Reply only yes or no.",
                temperature=0,
                max_output_tokens=5,
                max_retries=0,
                timeout=5,
            )
            return (result or '').strip().lower().startswith('yes')
        except Exception:
            return False

    def _resolve_vague_query(self, question: str) -> str:
        """Resolve a vague follow-up to a concrete search query using the last substantive turn."""
        # Walk back to find the last turn with real content:
        # skip vague turns (is_vague=True) AND refused/error turns (_is_non_context_answer).
        anchor_turn = None
        for turn in reversed(self.conversation_history):
            if not turn.get('is_vague', False) and not self._is_non_context_answer(turn.get('answer', '')):
                anchor_turn = turn
                break

        if not anchor_turn:
            return self._build_followup_retrieval_query(question)

        anchor_q = (anchor_turn.get('question') or '').strip()
        anchor_a = (anchor_turn.get('answer') or '').strip()[:300]
        fallback = anchor_q if anchor_q else self._build_followup_retrieval_query(question)

        prompt = (
            f"Previous question: {anchor_q}\n"
            f"Previous answer (excerpt): {anchor_a}\n"
            f"Student follow-up: {question}\n\n"
            "Create a concrete 6-14 word search query for course retrieval.\n"
            "Include:\n"
            "- the previous topic,\n"
            "- the aspect the student wants now (detail, examples, simpler "
            "explanation, causes, features, comparison, etc.).\n"
            "Output ONLY the search query, nothing else."
        )
        try:
            resolved = self._call_llm(
                prompt=prompt,
                system_instruction="Output only a search query. No explanations.",
                temperature=0.1,
                max_output_tokens=40,
                timeout=10,
            )
            resolved = (resolved or '').strip().strip('"').strip("'")
            if resolved and len(resolved) > 5 and len(resolved.split()) >= 2:
                return resolved
        except Exception:
            pass
        return fallback

    # ─────────────────────────────────────────────────────────
    # LLM wrapper
    # ─────────────────────────────────────────────────────────

    def _call_llm(self, prompt, system_instruction=None, temperature=0.4,
                  max_output_tokens=2500, top_p=0.95, max_retries=3, timeout=60):
        return self.llm_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            top_p=top_p,
            max_retries=max_retries,
            timeout=timeout,
        )

    # ─────────────────────────────────────────────────────────
    # Dynamic length detection  (from worker/chatbot.py v7)
    # ─────────────────────────────────────────────────────────

    def _detect_length_instruction(self, question: str) -> str:
        """
        Scans the FULL question for intent keywords and returns a [LENGTH] tag.

        Design decisions:
        1. re.search() not re.match() — catches keywords anywhere, handles
           compound questions: "What is X and explain Y?" → LONG (correct).
        2. LONG checked first — highest-demand keyword wins. Prevents
           "Define radio and discuss its characteristics." → SHORT (wrong).
        3. "briefly" prefix → always MEDIUM regardless of following keyword.
           "write a short/brief note" → MEDIUM (short answer expected).
        4. advantages/disadvantages/characteristics/types etc. in "what are"
           → LONG because these require enumerated structured answers.
        5. IGNOU exam keywords covered: elaborate, examine, critically,
           trace, illustrate, justify, assess — all in IGNOU question papers.
        6. JUDGE is the safe fallback — LLM decides based on context.
        """
        q = question.lower().strip()

        # Special prefixes — override long-pattern detection
        if re.search(r'\bbriefly\b', q):
            return (
                "[LENGTH: MEDIUM — Answer in 1 to 2 focused paragraphs. "
                "Cover the key points clearly. No padding.]"
            )
        if re.search(r'\bwrite a (short|brief) note\b', q):
            return (
                "[LENGTH: MEDIUM — Answer in 1 to 2 focused paragraphs. "
                "Cover the key points clearly. No padding.]"
            )

        # LONG — check first, any match means full structured answer needed
        long_patterns = [
            r'\bexplain\b', r'\bdescribe\b', r'\bdiscuss\b',
            r'\belaborate\b', r'\bexamine\b', r'\banalyse\b',
            r'\banalyze\b', r'\bcritically\b', r'\bevaluate\b',
            r'\bassess\b', r'\bcompare\b', r'\bdifferentiate\b',
            r'\bdistinguish\b', r'\btrace\b', r'\billustrate\b',
            r'\bjustify\b', r'\bwrite a note\b', r'\bwrite an essay\b',
            r'\bin detail\b', r'\bwith examples\b',
            r'\bwhat are the (different|various|key|main|major|important)\b',
            r'\bwhat are the (advantages|disadvantages|merits|demerits|pros|cons)\b',
            r'\bwhat are the (types|characteristics|features|elements|principles|stages|steps)\b',
            r'\bhow has\b', r'\bhow have\b',
            r'\bwhat factors\b', r'\bwhat role\b',
            r'\bwhat impact\b', r'\bwhat challenges\b',
        ]

        # MEDIUM — 1 to 2 focused paragraphs
        medium_patterns = [
            r'\bwhat is the (role|importance|significance|purpose|function|need)\b',
            r'\bwhat is the (difference|distinction)\b',
            r'\bhow does\b', r'\bwhy is\b', r'\bwhy are\b', r'\bwhy do\b',
            r'\bwhat do you (mean|understand) by\b',
            r'\bhow is\b', r'\bgive an overview\b',
        ]

        # SHORT — 2 to 4 sentences
        short_patterns = [
            r'\bwhat is\b', r'\bwhat are\b', r'\bdefine\b', r'\bname\b',
            r'\bstate\b', r'\blist\b', r'\bwho is\b', r'\bwho was\b',
            r'\bwhen was\b', r'\bwhen did\b', r'\bwhere is\b', r'\bwhich\b',
            r'\bhow many\b', r'\bhow much\b', r'\bwhat does\b', r'\bwhat was\b',
        ]

        for pattern in long_patterns:
            if re.search(pattern, q):
                return (
                    "[LENGTH: LONG — You MUST write a complete, structured, exam-ready answer. "
                    "This means: (1) an introduction paragraph, (2) a detailed body with AT MINIMUM 4-6 bullet points "
                    "each explained in 1-2 sentences, and (3) a conclusion. "
                    "Do NOT produce a short answer. Do NOT just list terms without explaining them.]"
                )

        for pattern in medium_patterns:
            if re.search(pattern, q):
                return (
                    "[LENGTH: MEDIUM — Answer in 1 to 2 focused paragraphs. "
                    "Cover the key points clearly without padding. "
                    "No need for a full introduction/conclusion structure.]"
                )

        for pattern in short_patterns:
            if re.search(pattern, q):
                return (
                    "[LENGTH: SHORT — Answer in 2 to 4 sentences maximum. "
                    "Give a direct, precise answer. Do not add extra paragraphs, "
                    "bullet points, or background context unless explicitly asked.]"
                )

        return (
            "[LENGTH: JUDGE — Answer as long as the question genuinely requires. "
            "Do not pad. Do not repeat points. Stop when the question is fully answered.]"
        )

    # ─────────────────────────────────────────────────────────
    # Response intent inference  (v8 — style adaptation)
    # ─────────────────────────────────────────────────────────

    def _infer_response_intent(self, user_question: str, recent_context: str = "") -> ResponseIntent:
        """LLM-first inference of structural intent. Falls back to regex on failure."""
        prompt = (
            f"Recent conversation:\n{recent_context or '(none)'}\n\n"
            f"Student message:\n{user_question}\n\n"
            "Return ONLY valid JSON with these four fields:\n"
            '{\n'
            '  "followup_mode": "none|expand|simplify|reformat",\n'
            '  "avoid_repetition": true/false,\n'
            '  "tone_signal": "auto|simple|formal|exam",\n'
            '  "format_signal": "auto|bullets|numbered|table|prose"\n'
            '}\n\n'
            "- followup_mode: \"none\" for new questions, \"expand\" if student wants more depth, "
            "\"simplify\" if student did not understand, \"reformat\" if student wants different structure.\n"
            "- avoid_repetition: true only when the student is reacting to a previous answer.\n"
            "- tone_signal: \"simple\" for casual/ELI5/simple-language requests, \"exam\" for exam prep, "
            "\"formal\" for academic requests, \"auto\" otherwise.\n"
            "- format_signal: \"auto\" if student did not specify a format. "
            "\"bullets\" if student explicitly asked for bullet points. "
            "\"numbered\" if student asked for numbered list, steps, or ordering. "
            "\"table\" if student asked for a table, grid, or comparison layout. "
            "\"prose\" if student asked for plain text, paragraph, or no lists.\n\n"
            "Do not answer the student. Output only the JSON."
        )
        intent = None
        try:
            result_text = self._call_llm(
                prompt=prompt,
                system_instruction="Respond with ONLY a JSON object. No markdown, no explanation.",
                temperature=0.0,
                max_output_tokens=100,
                max_retries=1,
                timeout=8,
            )
            if result_text:
                intent = self._parse_intent_json(result_text)
        except Exception:
            pass
        if intent is None:
            intent = self._fallback_response_intent(user_question)

        # Deterministic override: "difference between / compare / vs" questions
        # use the HYBRID comparison layout (short intro + table + optional notes).
        # Only applied when the student hasn't already requested a specific format
        # (so an explicit "in prose" or "just a table" still wins).
        if intent.format_signal == "auto" and self._is_comparison_question(user_question):
            intent.format_signal = "comparison"

        return intent

    def _is_comparison_question(self, question: str) -> bool:
        """True when the question asks to contrast two or more things (table-friendly)."""
        q = (question or "").lower()
        patterns = [
            r"\bdifference[s]?\s+between\b",
            r"\bdifference[s]?\s+among\b",
            r"\bdistinction[s]?\s+between\b",
            r"\bcompare\b",
            r"\bcomparison\b",
            r"\bdistinguish\b",
            r"\bdifferentiate\b",
            r"\bversus\b",
            r"\bvs\.?\b",
            r"\bpros and cons\b",
        ]
        return any(re.search(p, q) for p in patterns)

    def _fallback_response_intent(self, user_question: str) -> ResponseIntent:
        """Regex safety net — covers only the most common cases."""
        q = (user_question or "").lower()
        intent = ResponseIntent()

        if re.search(r"\b(more detail|in detail|elaborate|go deeper|expand|explain.{0,10}more)\b", q):
            intent.followup_mode = "expand"
            intent.avoid_repetition = True

        if re.search(r"\b(did(?:n.?t| not) understand|confused|simpler|simple terms|eli5|like i.?m 5)\b", q):
            intent.followup_mode = "simplify"
            intent.tone_signal = "simple"

        if re.search(r"\b(concise|short|brief|summarize|summary|make it shorter)\b", q):
            intent.followup_mode = "reformat"

        if re.search(r"\b(exam|ignou|answer format|structured answer)\b", q):
            intent.tone_signal = "exam"

        if re.search(r"\b(bullet|bullets|bullet points|point form)\b", q):
            intent.format_signal = "bullets"
        if re.search(r"\b(numbered|number the|step by step|steps|numbering)\b", q):
            intent.format_signal = "numbered"
        if re.search(r"\b(table|tabular|in a table|columns|comparison table)\b", q):
            intent.format_signal = "table"
        if re.search(r"\b(prose|paragraph|plain text|no bullets|no list)\b", q):
            intent.format_signal = "prose"

        if intent.followup_mode != "none":
            intent.avoid_repetition = True

        return intent

    def _parse_intent_json(self, text: str) -> ResponseIntent:
        """Parse LLM JSON into ResponseIntent, falling back to regex on failure."""
        text = (text or "").strip()
        text = re.sub(r'^```(?:json)?\s*\n?', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n?\s*```\s*$', '', text, flags=re.MULTILINE)
        text = text.strip()

        json_match = re.search(r'\{[^{}]*\}', text)
        if json_match:
            try:
                data = json.loads(json_match.group(0))
                valid_modes = {"none", "expand", "simplify", "reformat"}
                valid_tones = {"auto", "simple", "formal", "exam"}
                valid_formats = {"auto", "bullets", "numbered", "table", "prose", "comparison"}
                return ResponseIntent(
                    followup_mode=data.get("followup_mode", "none") if data.get("followup_mode") in valid_modes else "none",
                    avoid_repetition=bool(data.get("avoid_repetition", False)),
                    tone_signal=data.get("tone_signal", "auto") if data.get("tone_signal") in valid_tones else "auto",
                    format_signal=data.get("format_signal", "auto") if data.get("format_signal") in valid_formats else "auto",
                )
            except (json.JSONDecodeError, TypeError):
                pass
        return self._fallback_response_intent(text)

    def _build_length_instruction(self, user_question: str, intent: ResponseIntent) -> str:
        """Intent-aware length: overrides for expand/simplify/reformat, else uses existing regex logic."""
        if intent.followup_mode == "expand":
            return (
                "[LENGTH: LONG — Give a detailed answer. Expand beyond the previous summary. "
                "Include supporting points from the course material.]"
            )
        if intent.followup_mode == "simplify":
            return "[LENGTH: MEDIUM — Explain clearly. Prefer short sentences and simple words.]"
        if intent.followup_mode == "reformat":
            return (
                "[LENGTH: SHORT — Condense to the essential points. "
                "Give a direct, concise answer.]"
            )
        return self._detect_length_instruction(user_question)

    def _build_format_instruction(self, user_question: str, intent: ResponseIntent) -> str:
        """Returns a [FORMAT: ...] tag. AUTO lets the LLM choose based on system prompt principles."""
        fmt = intent.format_signal
        if fmt == "bullets":
            return "[FORMAT: BULLETS — Use bullet points for the main content.]"
        if fmt == "numbered":
            return "[FORMAT: NUMBERED — Use a numbered list. Each point on its own line.]"
        if fmt == "table":
            return (
                "[FORMAT: TABLE — Output a COMPACT Markdown table. Follow this EXACT shape:\n\n"
                "| Header A | Header B | Header C |\n"
                "|---|---|---|\n"
                "| short cell | short cell | short cell |\n"
                "| short cell | short cell | short cell |\n"
                "| short cell | short cell | short cell |\n\n"
                "STRICT RULES:\n"
                "1. Separator row has EXACTLY 3 dashes per column. Never more. Never pad.\n"
                "2. Do NOT add spaces inside cells to align columns visually. Single space on each side of the pipe is the maximum.\n"
                "3. Keep every cell to ONE short phrase or ONE sentence — never a paragraph.\n"
                "4. Emit the FULL table (header + separator + at least 3 data rows) in one block. Do not stop after the separator row.\n"
                "5. After the table, you may add a 1-2 sentence intro or conclusion if needed.]"
            )
        if fmt == "comparison":
            return (
                "[FORMAT: COMPARISON — Structure the answer in THIS EXACT ORDER:\n"
                "1. DIRECT ANSWER: Open with 1-2 sentences stating the single most important "
                "difference (the core distinction). Bold the key terms with **term**.\n"
                "2. EXAMPLES (only if the [LENGTH] tag is MEDIUM or LONG): add 2-4 bullet points, "
                "one short example or defining trait per item being compared. Skip this step entirely for SHORT.\n"
                "3. COMPARISON TABLE (always): a COMPACT Markdown table comparing the items across "
                "3-5 of the MOST relevant attributes. Use this EXACT shape:\n\n"
                "| Feature | <Item A> | <Item B> |\n"
                "|---|---|---|\n"
                "| <attribute> | <short cell> | <short cell> |\n"
                "| <attribute> | <short cell> | <short cell> |\n"
                "| <attribute> | <short cell> | <short cell> |\n\n"
                "4. RELATED NOTE (only if the [LENGTH] tag is LONG): end with ONE sentence on a closely "
                "related concept or caveat.\n\n"
                "STRICT TABLE RULES:\n"
                "- Separator row: EXACTLY 3 dashes per column. Never pad with extra dashes or spaces.\n"
                "- Each cell: ONE short phrase, never a paragraph.\n"
                "- Emit the FULL table (header + separator + at least 3 rows) in one block.]"
            )
        if fmt == "prose":
            return "[FORMAT: PROSE — Use plain paragraphs only. No lists, no tables.]"
        return (
            "[FORMAT: AUTO — Choose the format that best serves this specific content. "
            "See formatting principles in your system prompt.]"
        )

    # ─────────────────────────────────────────────────────────
    # Main question handler
    # ─────────────────────────────────────────────────────────

    def ask_question(self, question: str, use_history: bool = True, model: str = None) -> Dict[str, Any]:
        """
        Process question and generate a dynamically-sized exam-ready answer.

        Gating logic (v6/v7):
          < min_score_gate           → HARD REJECT
          >= min_score_gate          → validate
          val_score <= 4             → REFUSE (smart redirect)
          is_main=False, score < 7  → REFUSE (smart redirect)
          follow-up override         → allow continuity when follow-up detected
        """
        if model and model in AVAILABLE_MODELS:
            new_config = AVAILABLE_MODELS[model]
            if new_config != self.model_config:
                print(f"🔄 Switching model to: {new_config.display_name}")
                self.switch_model(new_config)

        # Safety gates — fast keyword check, then one LLM-based harmful check
        if self._contains_profanity(question):
            return {
                'answer': "⚠️ Please keep the conversation respectful.",
                'sources': [], 'vector_results': [],
                'graph_context': {}, 'expanded_queries': [], 'validation': {}
            }
        if self._contains_harmful_content(question):
            return {
                'answer': "⚠️ This type of question is not supported. Such topics may be illegal or harmful. Please ask questions related to Media Literacy.",
                'sources': [], 'vector_results': [],
                'graph_context': {}, 'expanded_queries': [], 'validation': {}
            }

        classification = self._classify_input(question)

        # Sanity-check: if the LLM said "greeting" but stripping the greeting prefix
        # still leaves substantial ACADEMIC content (not conversational like
        # "how are you"), the classifier was wrong — override to "greeting_syllabus".
        # Without this, `_get_greeting_response` receives a mixed greeting+question
        # and produces a truncated reply like "Hello there! I".
        if classification == "greeting":
            test_strip = GREETING_PREFIX_RE.sub('', question).strip()
            looks_academic = bool(re.search(
                r'\b(what|why|how\s+(does|do|is|can|has|have|many|much)|'
                r'explain|describe|define|discuss|compare|differentiate|distinguish|'
                r'list|name|state|elaborate|examine|illustrate|analyse|analyze|'
                r'tell\s+me\s+about|give\s+(me\s+)?(an?\s+)?(example|overview))\b',
                test_strip.lower(),
            ))
            if test_strip and len(test_strip.split()) >= 2 and looks_academic and test_strip.lower() != question.strip().lower():
                print(f"⚠️ Classifier said 'greeting' but academic residual='{test_strip}' — overriding to greeting_syllabus")
                classification = "greeting_syllabus"

        print(f"📥 Input classification: {classification}")

        # Pure greeting — short-circuit, mark vague so it doesn't anchor follow-ups
        if classification == "greeting":
            greeting_text = self._get_greeting_response(question)
            self._record_turn(question, greeting_text, use_history=use_history, is_vague=True)
            return {
                'answer': greeting_text,
                'sources': [], 'vector_results': [],
                'graph_context': {}, 'expanded_queries': []
            }

        # Greeting + academic question — capture a brief opener ONLY (not a full greeting
        # that tries to address the academic part), strip the greeting prefix, then let
        # the normal RAG pipeline answer the academic question.
        greeting_part = ""
        if classification == "greeting_syllabus":
            greeting_part = self._get_brief_greeting_opener(question)
            question = self._strip_greeting(question)
            print(f"🪄 Opener: '{greeting_part}' | Academic question: '{question}'")

        print("🔍 Analyzing question and retrieving context...")
        try:
            recent_context = self._get_recent_conversation_context() if use_history else ""
            likely_followup = bool(recent_context) and self._is_likely_followup(question)

            is_vague_turn = False
            if use_history and self._is_vague_question(question):
                is_vague_turn = True
                retrieval_query = self._resolve_vague_query(question)
                print(f"Vague query resolved: '{question}' -> '{retrieval_query}'")
            elif likely_followup:
                retrieval_query = self._build_followup_retrieval_query(question)
                print("Follow-up context added to retrieval query")
            else:
                retrieval_query = question

            retrieved_context = self.retriever.retrieve(retrieval_query)
            if likely_followup and not retrieved_context.vector_results and retrieval_query != question:
                print("Follow-up retrieval fallback to raw question")
                retrieved_context = self.retriever.retrieve(question)

            source_meta = [r.metadata for r in retrieved_context.vector_results]

            if not retrieved_context.vector_results:
                self._record_turn(question, OUT_OF_SCOPE_MESSAGE, use_history=use_history,
                                  sources=[], expanded_queries=retrieved_context.expanded_queries,
                                  validation={})
                return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                        'vector_results': [], 'graph_context': {}, 'expanded_queries': []}

            top_score = max(r.score for r in retrieved_context.vector_results)
            min_score_gate = 0.015 if likely_followup else 0.020

            if top_score < min_score_gate:
                print(f"⚠️ Top score {top_score:.4f} below gate {min_score_gate:.3f} — refusing")
                self._record_turn(question, OUT_OF_SCOPE_MESSAGE, use_history=use_history,
                                  sources=source_meta,
                                  expanded_queries=retrieved_context.expanded_queries,
                                  validation={})
                return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                        'vector_results': retrieved_context.vector_results,
                        'graph_context': retrieved_context.graph_context,
                        'expanded_queries': retrieved_context.expanded_queries}

            if top_score >= 0.06:
                print(f"📊 High retrieval score ({top_score:.4f}) — validating topic relevance...")
            elif top_score >= 0.030:
                print(f"🔬 Medium score ({top_score:.4f}) — validating content sufficiency...")
            else:
                print(f"🔬 Borderline score ({top_score:.4f}) — validating content sufficiency...")

            validation_result = self._validate_content_sufficiency(
                retrieval_query, retrieved_context, conversation_context=recent_context
            )

            if validation_result.get('_validation_error', False):
                print("⚠️ Validation error — using score-based fallback")
                # v7: auth errors get a specific message immediately
                if validation_result.get('_auth_error', False):
                    return {'answer': RATE_LIMIT_MESSAGE,
                            'sources': [],
                            'vector_results': retrieved_context.vector_results,
                            'graph_context': retrieved_context.graph_context,
                            'expanded_queries': retrieved_context.expanded_queries}
                min_validation_gate = 0.025 if likely_followup else 0.040
                if top_score < min_validation_gate:
                    self._record_turn(question, OUT_OF_SCOPE_MESSAGE, use_history=use_history,
                                      sources=source_meta,
                                      expanded_queries=retrieved_context.expanded_queries,
                                      validation=validation_result)
                    return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                            'vector_results': retrieved_context.vector_results,
                            'graph_context': retrieved_context.graph_context,
                            'expanded_queries': retrieved_context.expanded_queries}
                validation_result = {"completeness_score": 5, "can_fully_answer": False,
                                     "is_main_subject": False, "topic_directly_discussed": False,
                                     "reasoning": "Validation unavailable — cautious fallback",
                                     "_validation_error": True}
            else:
                val_score = validation_result.get('completeness_score', 5)
                is_main = validation_result.get('is_main_subject', True)
                print(f"📊 Validation — score: {val_score}/10 | main_subject: {is_main}")
                allow_followup_override = likely_followup and top_score >= 0.025 and val_score >= 2

                if allow_followup_override:
                    print("↪️ Follow-up detected with relevant retrieval score — allowing continuity")

                # When topic IS in the syllabus (main_subject=True), allow marginal
                # content through — the LLM can synthesise from partial mentions.
                # Only refuse in-scope topics when retrieved content is completely
                # unrelated (score <= 1).
                effective_threshold = 1 if is_main else 4

                if val_score <= effective_threshold:
                    if not allow_followup_override:
                        print(f"🚫 Validator: score={val_score} <= {effective_threshold} — refusing")
                        redirect = _build_smart_redirect(retrieved_context) if top_score >= 0.025 else OUT_OF_SCOPE_MESSAGE
                        self._record_turn(question, redirect, use_history=use_history,
                                          sources=source_meta,
                                          expanded_queries=retrieved_context.expanded_queries,
                                          validation=validation_result)
                        return {'answer': redirect, 'sources': [],
                                'vector_results': retrieved_context.vector_results,
                                'graph_context': retrieved_context.graph_context,
                                'expanded_queries': retrieved_context.expanded_queries}

                if not is_main and val_score < 7:
                    if not allow_followup_override:
                        print(f"🚫 Validator: is_main_subject=False, score={val_score} < 7 — only incidental mention")
                        redirect = _build_smart_redirect(retrieved_context) if top_score >= 0.025 else OUT_OF_SCOPE_MESSAGE
                        self._record_turn(question, redirect, use_history=use_history,
                                          sources=source_meta,
                                          expanded_queries=retrieved_context.expanded_queries,
                                          validation=validation_result)
                        return {'answer': redirect, 'sources': [],
                                'vector_results': retrieved_context.vector_results,
                                'graph_context': retrieved_context.graph_context,
                                'expanded_queries': retrieved_context.expanded_queries}

            response_intent = self._infer_response_intent(
                user_question=question,
                recent_context=recent_context,
            )

            prompt = self._build_synthesis_prompt(
                user_question=question,
                retrieval_query=retrieval_query,
                retrieved_context=retrieved_context,
                validation=validation_result,
                response_intent=response_intent,
            )
            generation_temp = _TONE_TEMPERATURE.get(response_intent.tone_signal, 0.35)
            print(f"🤖 Generating answer (intent: {response_intent.followup_mode}/{response_intent.tone_signal})...")
            answer = self._call_llm(prompt=prompt, system_instruction=self._system_prompt,
                                    temperature=generation_temp, max_output_tokens=self.model_config.default_max_tokens)

            if answer is None:
                self._record_turn(question, RATE_LIMIT_MESSAGE, use_history=use_history,
                                  sources=source_meta,
                                  expanded_queries=retrieved_context.expanded_queries,
                                  validation=validation_result)
                return {'answer': RATE_LIMIT_MESSAGE,
                        'sources': source_meta,
                        'vector_results': retrieved_context.vector_results,
                        'graph_context': retrieved_context.graph_context,
                        'expanded_queries': retrieved_context.expanded_queries,
                        'validation': validation_result}

            answer = self._normalize_markdown_table(answer)

            self._record_turn(question, answer, use_history=use_history,
                              sources=source_meta,
                              expanded_queries=retrieved_context.expanded_queries,
                              validation=validation_result,
                              is_vague=is_vague_turn)

            if greeting_part:
                answer = f"{greeting_part}\n\n{answer}"

            return {'answer': answer,
                    'sources': source_meta,
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result}

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            # v7: give a specific message for API key / auth errors
            err = str(e).lower()
            if any(x in err for x in ['api_key', 'api key', '401', 'unauthorized',
                                       'authentication', 'invalid key', 'api_key_invalid']):
                error_answer = "Invalid API key. Please check your .env file and restart the server."
            else:
                error_answer = f"I encountered an error: {str(e)}"
            self._record_turn(question, error_answer, use_history=use_history,
                              sources=[], expanded_queries=[], validation={})
            return {'answer': error_answer, 'sources': [],
                    'vector_results': [], 'graph_context': {}, 'expanded_queries': []}

    # ─────────────────────────────────────────────────────────
    # explain_selection
    # ─────────────────────────────────────────────────────────

    def explain_selection(self, selected_text: str, full_bot_message: str) -> Dict[str, str]:
        prompt = (
            f"A student highlighted this part of an answer:\n\"{selected_text}\"\n\n"
            f"Full answer context:\n{full_bot_message}\n\n"
            f"Explain the highlighted part in 2-4 clear sentences, grounded in the course content above."
        )
        explanation = self._call_llm(
            prompt=prompt,
            system_instruction=(
                "You are Digilab, an IGNOU academic assistant. "
                "Explain clearly and concisely. Stay grounded in the provided course content."
            ),
            temperature=0.3,
            max_output_tokens=500,
        )
        return {"explanation": explanation or RATE_LIMIT_MESSAGE}

    # ─────────────────────────────────────────────────────────
    # Follow-up generation  (from Downloads chatbot.py)
    # ─────────────────────────────────────────────────────────

    def generate_follow_up_questions(
        self,
        assistant_response: str,
        user_question: str,
        include_follow_up: bool = True
    ) -> Dict[str, Any]:
        """
        Generate intelligent follow-up questions for a chatbot response.

        Returns:
            {
                "type_2_context_aware": ["question1", "question2"],
                "follow_up_items": [...],
                "follow_up_markdown_links": [...],
                "status": "success" | "fallback" | "skipped" | "error"
            }
        """
        if not include_follow_up:
            return {
                "type_2_context_aware": [],
                "follow_up_items": [],
                "follow_up_markdown_links": [],
                "status": "skipped"
            }
        try:
            result = self.follow_up_generator.generate(
                assistant_response=assistant_response,
                user_question=user_question,
                conversation_history=self.conversation_history[-4:] if self.conversation_history else None
            )
            return result
        except Exception as e:
            print(f"⚠️ Error generating follow-up questions: {e}")
            return {
                "type_2_context_aware": [],
                "follow_up_items": [],
                "follow_up_markdown_links": [],
                "status": "error",
                "error": str(e)
            }

    def ask_question_with_follow_ups(
        self,
        question: str,
        use_history: bool = True,
        include_follow_ups: bool = True,
        model: str = None
    ) -> Dict[str, Any]:
        """
        Ask a question and optionally generate follow-up questions.

        Returns ask_question() result plus 'follow_up_questions' key.
        """
        response = self.ask_question(question, use_history=use_history, model=model)
        answer_text = (response.get('answer') or '').strip()
        answer_text_lower = answer_text.lower()

        is_out_of_scope_answer = (
            answer_text == OUT_OF_SCOPE_MESSAGE or
            "outside the scope of the course materials" in answer_text_lower
        )

        if include_follow_ups and answer_text and \
           not is_out_of_scope_answer and \
           answer_text != RATE_LIMIT_MESSAGE:
            follow_ups = self.generate_follow_up_questions(
                assistant_response=answer_text,
                user_question=question,
                include_follow_up=True
            )
            type_2_questions = follow_ups.get("type_2_context_aware", [])
            all_questions = type_2_questions
            follow_ups["follow_up_items"] = [
                {"question": q, "href": f"#ask={quote(q)}", "query": q, "type": "type_2"}
                for q in all_questions
            ]
            follow_ups["follow_up_markdown_links"] = [
                f"[{q}](#ask={quote(q)})" for q in all_questions
            ]
            response['follow_up_questions'] = follow_ups
        else:
            response['follow_up_questions'] = {
                "type_2_context_aware": [],
                "follow_up_items": [],
                "follow_up_markdown_links": [],
                "status": "skipped"
            }

        return response

    # ─────────────────────────────────────────────────────────
    # Validation
    # ─────────────────────────────────────────────────────────

    def _validate_content_sufficiency(self, question: str, retrieved_context: Any,
                                      conversation_context: str = "") -> Dict[str, Any]:
        """Confidence signal — always runs, never skipped by score alone."""
        # v6: follow-up context injection
        followup_block = ""
        if conversation_context:
            followup_block = (
                f"\nRECENT CONVERSATION CONTEXT:\n{conversation_context[:1200]}\n\n"
                "If the student's question appears to be a follow-up or comparison, "
                "evaluate it relative to the ongoing topic above (not as a disconnected standalone topic). "
                "Do not mark it out-of-scope when it clearly continues the same course topic.\n"
            )

        # v6: structured per-section context
        validation_context = self._build_validation_context(retrieved_context)

        validation_prompt = f"""You are evaluating whether a student's question is genuinely covered by the course material provided.

STUDENT QUESTION: {question}

{followup_block}
COURSE MATERIAL EXCERPT (first 3000 chars):
    {validation_context}

    RULE: If the student's question is an exact or near-exact match for a section title or repeatedly discussed unit topic in the retrieved material, treat it as the main subject.

Answer TWO things carefully:

QUESTION 1 — COMPLETENESS SCORE (1-10):
1-3: Topic absent, or appears only as a passing word/example within a different concept
4-5: Topic is mentioned tangentially or used only as an illustrative example
6-7: Topic is a genuine subject with partial coverage
8-10: Topic is a main subject comprehensively covered

QUESTION 2 — IS MAIN SUBJECT (true/false):
Return FALSE if the topic only appears as: a real-world example, a passing mention, or background context.
Return TRUE only if the material directly TEACHES or EXPLAINS the topic itself.

CRITICAL EXAMPLES:
  Q: "what is cricket?" — Material has cricket as example of sports commentary.
     → completeness_score: 2, is_main_subject: false
  Q: "what is radio journalism?" — Material has full units on radio journalism.
     → completeness_score: 9, is_main_subject: true
  Q: "history of photography" — MNM-003 has a dedicated Unit 1 on this.
     → completeness_score: 9, is_main_subject: true
  Q: "photo editing ethics" — MNM-003 Unit 8 covers ethical aspects of photo editing.
     → completeness_score: 7, is_main_subject: true

CRITICAL OUTPUT FORMAT — VIOLATIONS CAUSE SYSTEM FAILURE:
- Start your response with {{ and end with }}
- Do NOT write "Score:", "Answer:", or any label before the JSON
- Do NOT write any text after the closing }}
- Do NOT use markdown, code fences, or asterisks
- Return ONLY this exact structure:
{{"completeness_score": <integer 1-10>, "can_fully_answer": <true or false>, "is_main_subject": <true or false>, "topic_directly_discussed": <true or false>, "reasoning": "<one sentence>"}}"""

        try:
            validation_text = self._call_llm(
                prompt=validation_prompt,
                system_instruction="Respond with ONLY a JSON object. No markdown, no explanation, no code fences.",
                temperature=0.1,
                max_output_tokens=300,
                max_retries=2,
            )
            if validation_text is None:
                return {"completeness_score": 2, "can_fully_answer": False, "is_main_subject": False,
                        "topic_directly_discussed": False, "reasoning": "Rate limit",
                        "_validation_error": True, "_auth_error": False}

            result = self._parse_validation_json(validation_text)
            if result is None:
                print(f"⚠️ Validation parse failed: {validation_text[:200]}")
                return {"completeness_score": 2, "can_fully_answer": False, "is_main_subject": False,
                        "topic_directly_discussed": False, "reasoning": "Parse failed",
                        "_validation_error": True, "_auth_error": False}

            if 'is_main_subject' not in result:
                result['is_main_subject'] = result.get('topic_directly_discussed', True)
            result['_validation_error'] = False
            result['_auth_error'] = False
            return result

        except Exception as e:
            print(f"⚠️ Validation error: {e}")
            # v7: detect auth errors specifically
            err = str(e).lower()
            is_auth = any(x in err for x in ['api_key', 'api key', '401', 'unauthorized',
                                              'authentication', 'invalid key', 'api_key_invalid'])
            return {"completeness_score": 2, "can_fully_answer": False, "is_main_subject": False,
                    "topic_directly_discussed": False, "reasoning": "Exception",
                    "_validation_error": True, "_auth_error": is_auth}

    def _build_validation_context(self, retrieved_context: Any,
                                  max_sections: int = 5,
                                  max_chars_per_section: int = 450) -> str:
        if not retrieved_context or not getattr(retrieved_context, 'vector_results', None):
            return ''
        sections = []
        seen_sections = set()
        for result in retrieved_context.vector_results:
            metadata = result.metadata if hasattr(result, 'metadata') else {}
            section_name = metadata.get('full_section', 'Unknown')
            if section_name in seen_sections:
                continue
            seen_sections.add(section_name)
            snippet = metadata.get('text', '')
            if hasattr(result, 'text') and result.text:
                snippet = result.text
            sections.append(
                f"[FROM: {section_name}]\n"
                f"{(snippet or '').strip()[:max_chars_per_section]}"
            )
            if len(sections) >= max_sections:
                break
        return "\n\n".join(sections)

    def _parse_validation_json(self, text: str) -> dict:
        """5-step robust JSON parser for LLM validation responses."""
        if not text:
            return None
        text = text.strip()
        text = re.sub(r'^```(?:json)?\s*\n?', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n?\s*```\s*$', '', text, flags=re.MULTILINE)
        text = text.strip()
        try:
            result = json.loads(text)
            if 'completeness_score' in result:
                return result
        except json.JSONDecodeError:
            pass
        json_match = re.search(r'\{[^{}]*\}', text)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                if 'completeness_score' in result:
                    return result
            except json.JSONDecodeError:
                raw = json_match.group(0)
                fixed = raw
                if fixed.count('"') % 2 != 0:
                    fixed += '"'
                if not fixed.endswith('}'):
                    fixed += '}'
                try:
                    result = json.loads(fixed)
                    if 'completeness_score' in result:
                        return result
                except json.JSONDecodeError:
                    pass
        score_match = re.search(r'completeness_score["\s:]+(\d+)', text)
        if score_match:
            score = int(score_match.group(1))
            topic_match = re.search(r'topic_directly_discussed["\s:]+(\w+)', text)
            main_match = re.search(r'is_main_subject["\s:]+(\w+)', text)
            topic = topic_match.group(1).lower() == 'true' if topic_match else True
            is_main = main_match.group(1).lower() == 'true' if main_match else topic
            return {"completeness_score": score, "can_fully_answer": score >= 7,
                    "is_main_subject": is_main, "topic_directly_discussed": topic,
                    "reasoning": "Parsed via regex fallback"}
        return None

    # ─────────────────────────────────────────────────────────
    # System prompt  (v7 — with [LENGTH] obedience section)
    # ─────────────────────────────────────────────────────────

    def _get_system_prompt(self) -> str:
        return """You are Digilab, an expert academic assistant for IGNOU's Mass Communication and Journalism programme. You help students write exam-ready answers.

═══════════════════════════════════════
ANSWER LENGTH — OBEY THE [LENGTH] TAG
═══════════════════════════════════════

Every prompt includes a [LENGTH: ...] tag. Follow it strictly.

[LENGTH: SHORT]
→ 2 to 4 sentences only.
→ Give a direct, precise answer. No introduction, no conclusion, no bullet points.
→ Example: "What is FM radio?" → One definition sentence + one key fact. Done.

[LENGTH: MEDIUM]
→ 1 to 2 focused paragraphs.
→ Cover the key points clearly. No padding.
→ No need for full intro/conclusion structure.

[LENGTH: LONG]
→ Full structured answer: introduction, detailed body, conclusion.
→ Use bullet points only when listing distinct items.
→ Include all relevant points from the course material.

[LENGTH: JUDGE]
→ No strong signal detected. Answer as long as genuinely required.
→ Stop when the question is fully answered. Do not pad.

CRITICAL: NEVER pad an answer to meet a word count.
A complete 3-sentence answer is better than a padded 10-sentence answer that repeats itself.

═══════════════════════════════════════
ANSWER STRUCTURE (for LONG answers only)
═══════════════════════════════════════

For DESCRIPTIVE / EXPLAIN questions:
• 1-2 sentence introduction
• Detailed explanation (2-3 paragraphs)
• 5-7 substantive points where relevant
• Brief conclusion

For COMPARISON questions:
• Brief intro defining both concepts
• Key features of each (4-5 points each)
• Clear differences → Brief conclusion

For LIST / ENUMERATE questions:
• Brief intro, then items with explanation for each

═══════════════════════════════════════
FORMATTING RULES
═══════════════════════════════════════

Every prompt includes a [FORMAT: ...] tag. Follow it strictly if it is not AUTO.

[FORMAT: AUTO]
→ No explicit format was requested. Choose the format that best serves the content.
→ Use the principles below to decide. Pick one format per answer — do not mix.

[FORMAT: BULLETS]
→ Use bullet points (- or •) for all main content.

[FORMAT: NUMBERED]
→ Use a numbered list (1. 2. 3.) for all main content.

[FORMAT: TABLE]
→ Present the content as a compact Markdown table. Use | column | headers |.
→ Separator row: exactly three dashes per column (|---|---|---|). NEVER write more than 3 dashes per cell. NEVER pad with extra dashes for visual width matching.
→ NEVER pad cell contents with extra spaces for visual column alignment. One space on each side of the pipe is enough.
→ Emit the header row, the separator row, and ALL data rows as one contiguous block. Do not stop after the separator. Keep each cell short.

[FORMAT: PROSE]
→ Use plain paragraphs only. No bullets, no numbers, no tables.

─────────────────────────────────
FORMAT SELECTION PRINCIPLES (for AUTO only)
─────────────────────────────────

Use NUMBERED LIST when:
- The content describes a sequence, process, or procedure where order matters.
- The content ranks or prioritises items.
- There are 3 or more distinct steps or stages.

Use BULLET POINTS when:
- The content has 3 or more parallel, equal-weight items with no sequence.
- The content lists features, characteristics, types, or roles.
- Items do not need to be read in order.

Use TABLE when:
- The student asks for a "difference", "distinction", "comparison", or to "compare" two or more things — a table is almost always the clearest format for these.
- The content compares two or more entities across the same set of attributes.
- The content has a clear row-column structure (entity vs. property).
- A table is appropriate even for 2 entities × 3 attributes — do not require many rows.
- IMPORTANT: A [LENGTH: MEDIUM] or [LENGTH: SHORT] tag does NOT prevent a table. Length controls volume of content, not structure. A compact 3-row table satisfies MEDIUM length.

Use PROSE (paragraphs) when:
- The content is a definition, explanation, or narrative.
- The content flows logically from one idea to the next.
- The answer is SHORT (2–4 sentences) — lists and tables add no value here.
- The student is asking for a conversational or simplified explanation.

─────────────────────────────────
ALWAYS:
- Bold the first mention of important technical terms using **term** format.
- Keep paragraph breaks between major sections only, not between every sentence.
- Never mix formats in the same answer (e.g. a table inside a bullet list).
- Never create headers (##) unless the answer has 3 or more distinct major sections.

═══════════════════════════════════════
GROUNDING RULES — READ CAREFULLY
═══════════════════════════════════════

The course material provided in the prompt is YOUR ONLY SOURCE OF FACTS — but it is a source of facts, not a script to copy.

1. FACT SOURCING: Every person's name, date, year, statistic, researcher, theory name, and specific detail in your answer MUST come from the retrieved course material. If a fact is not in the material, do not write it.

2. STYLE FREEDOM: You may paraphrase, simplify, reorganise, and re-explain the material in any style, tone, format, or difficulty level the student requests. Preserve technical terms from the material when they matter, but explain them in simpler language if the student asked for that.

3. ANALOGIES: You may use everyday analogies to make a course concept easier to understand. Analogies must not introduce new course facts — they are for illustration only.

4. PARTIAL ANSWERS ARE FINE: If the material only partially covers the question, answer what you CAN from the material. End with one sentence like "The course material covers [aspect X]; other aspects are not addressed in the available sections."

5. EXAMPLE VS SUBJECT — CRITICAL RULE:
   If the confidence level says LOW or MEDIUM:
   ❌ DO NOT define or explain the topic using your world knowledge
   ❌ DO NOT cherry-pick course mentions to construct an answer about a different topic
   ✅ DO answer only if the material explicitly TEACHES that topic as its subject

═══════════════════════════════════════
HARD PROHIBITIONS
═══════════════════════════════════════

❌ NEVER add people, researchers, or scholars not named in the material
❌ NEVER add dates, years, or statistics not present in the material
❌ NEVER add book titles, publication names, or citations not in the material
❌ NEVER introduce theories or frameworks not referenced in the material
❌ NEVER invent examples — use only examples explicitly from the material
❌ NEVER say "The materials do not elaborate..." or "The provided material..."
❌ NEVER write meta-commentary about what the sources do or don't contain
❌ NEVER pad an answer with external knowledge to fill length
❌ NEVER use world knowledge to define a topic that only appears as a passing example

SELF-CHECK: Before finishing, scan your answer. For every name, date, and specific fact — is it in the material above? If not, delete it."""

    # ─────────────────────────────────────────────────────────
    # Synthesis prompt builder  (v7 — injects [LENGTH] tag)
    # ─────────────────────────────────────────────────────────

    def _build_synthesis_prompt(self, user_question: str, retrieval_query: str,
                                retrieved_context: Any, validation: Dict,
                                response_intent: ResponseIntent) -> str:
        """
        v8: Separates user_question (style/intent) from retrieval_query (topic for RAG).
        Length detection runs on user_question. The LLM reads user_question directly
        and follows whatever style the student requested.
        """
        # History — ONLY include when the student is actually following up. For a fresh
        # academic question, leaking the previous topic into the prompt biases the LLM
        # toward continuing that topic (e.g. photography → journalism cross-contamination).
        is_followup = response_intent.followup_mode != "none"
        include_history = is_followup or response_intent.avoid_repetition
        answer_trunc = 450 if is_followup else 200
        history = ""
        if include_history and self.conversation_history:
            history = (
                "Previous conversation (for follow-up continuity ONLY — do NOT let the previous "
                "topic override the student's current question below):\n"
            )
            for conv in self.conversation_history[-2:]:
                a = (conv['answer'] or '')[:answer_trunc]
                history += f"Q: {conv['question']}\nA: {a}...\n\n"

        val_score = validation.get('completeness_score', 7)
        is_main = validation.get('is_main_subject', True)
        has_error = validation.get('_validation_error', False)

        if has_error:
            confidence_note = "\n[CONFIDENCE: MEDIUM — Answer strictly from the material below. Do NOT use world knowledge.]\n"
        elif val_score >= 8 and is_main:
            confidence_note = "\n[CONFIDENCE: HIGH — Material comprehensively covers this topic. Give a thorough, detailed answer.]\n"
        elif val_score >= 7 and is_main:
            confidence_note = "\n[CONFIDENCE: HIGH — Material directly covers this. Give a thorough answer.]\n"
        elif val_score >= 5 and is_main:
            confidence_note = "\n[CONFIDENCE: MEDIUM — Material partially covers this. Answer only what the material supports. Do NOT fill gaps with outside knowledge.]\n"
        else:
            confidence_note = (
                "\n[CONFIDENCE: LOW — WARNING: The retrieved material may only MENTION this topic as a passing example. "
                "DO NOT define or explain this topic using your world knowledge. "
                "Answer ONLY if the material explicitly teaches this topic.]\n"
            )

        length_instruction = self._build_length_instruction(user_question, response_intent)
        format_instruction = self._build_format_instruction(user_question, response_intent)

        followup_instruction = ""
        if response_intent.avoid_repetition or is_followup:
            followup_instruction = (
                "\n[FOLLOW-UP INSTRUCTION]\n"
                "The student is reacting to the previous answer. "
                "Do not repeat the same content. "
                "Re-explain the topic in the way the student is requesting. "
                "Use additional detail, simpler language, different structure, or examples — "
                "whatever the student's message asks for.\n"
            )

        # Show retrieval topic only when it differs from user_question (vague turns)
        topic_line = ""
        if retrieval_query != user_question:
            topic_line = f"\nRetrieval topic (for context only — answer the student's message above, not this):\n{retrieval_query}\n"

        return (
            f"{history}"
            f"What the student actually asked (follow this exactly — tone, style, format, audience):\n"
            f"{user_question}\n"
            f"{topic_line}\n"
            f"{length_instruction}\n"
            f"{format_instruction}\n"
            f"{confidence_note}"
            f"{followup_instruction}\n"
            f"Course Material (source of all factual claims):\n"
            f"{retrieved_context.combined_context}\n\n"
            f"Rules for writing the answer:\n"
            f"- Answer the student's actual message, in the style and format they requested.\n"
            f"- Use the course material as the source of facts. Do not add external facts.\n"
            f"- You may paraphrase, simplify, reorganise, and re-explain the material freely.\n"
            f"- Preserve technical terms from the material, but explain them in plain language if the student asked for that.\n"
            f"- You may use everyday analogies to illustrate course concepts. Do not use analogies to introduce new course facts.\n"
            f"- For follow-ups asking for more detail: expand beyond the previous answer with new supporting points.\n"
            f"- Follow the [LENGTH] instruction exactly.\n\n"
            f"Write the answer:"
        )

    # ─────────────────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────────────────

    def _normalize_markdown_table(self, text: str) -> str:
        """
        Collapse over-padded markdown tables produced by the LLM.

        - Separator rows: each cell becomes canonical `---` (preserving alignment colons).
        - Data/header rows: runs of 2+ spaces inside cells collapse to a single space.
        - Truncated rows (line opens with `|` but never closes — common when the LLM
          burns its token budget on padding): auto-close with `|` then normalize.
        Pure structural normalization — no content rewriting.
        """
        if not text or '|' not in text:
            return text

        sep_cell = re.compile(r'^\s*(:?)\s*-{2,}\s*(:?)\s*$')
        # Detect a line that's an in-progress separator (only colons/dashes/whitespace
        # inside, regardless of whether the row was closed). Catches the failure mode
        # where the LLM writes `|:------...` and runs out of tokens.
        sep_content_only = re.compile(r'^\s*[:\-\s|]*\s*$')

        out_lines = []
        header_col_count = None  # remember column count from the most recent header

        for line in text.split('\n'):
            stripped = line.strip()
            if not stripped.startswith('|'):
                out_lines.append(line)
                header_col_count = None  # leaving a table block — reset state
                continue

            # Auto-close truncated rows (no closing pipe — LLM ran out of tokens
            # mid-padding). Append `|` so the cell-split logic below still works.
            if not stripped.endswith('|'):
                stripped = stripped + '|'

            inner = stripped[1:-1]
            cells = inner.split('|')

            # CASE 1 — a separator row, complete OR truncated.
            # Complete: every cell matches `:?---:?`.
            # Truncated: the entire content is colons/dashes/whitespace/pipes (the LLM
            #            was halfway through writing the separator when it ran out).
            is_complete_sep = bool(cells) and all(sep_cell.match(c) for c in cells)
            is_truncated_sep = (
                not is_complete_sep
                and sep_content_only.match(inner)
                and any('-' in c for c in cells)
            )

            if is_complete_sep:
                norm_cells = []
                for c in cells:
                    m = sep_cell.match(c)
                    left, right = m.group(1), m.group(2)
                    norm_cells.append(f"{left}---{right}")
                # If the column count is off vs the header, snap to header's count.
                if header_col_count and len(norm_cells) != header_col_count:
                    norm_cells = ['---'] * header_col_count
                out_lines.append('|' + '|'.join(norm_cells) + '|')

            elif is_truncated_sep:
                # Reconstruct using the header's column count.
                count = header_col_count or max(len(cells), 2)
                out_lines.append('|' + '|'.join(['---'] * count) + '|')

            else:
                # Header or data row — collapse internal whitespace runs.
                norm = [re.sub(r'\s+', ' ', c).strip() for c in cells]
                # If a cell is purely empty/whitespace, keep it as an empty cell
                # (don't drop it — that would shift columns).
                out_lines.append('| ' + ' | '.join(norm) + ' |')
                # First non-separator pipe-row in a table is treated as the header
                # for column-count reference. Update only if not already set, so we
                # latch onto the FIRST row of each table.
                if header_col_count is None:
                    header_col_count = len(norm)

        return '\n'.join(out_lines)

    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []

    def set_history(self, history: Optional[List[Dict[str, Any]]] = None):
        normalized_history = []

        for turn in history or []:
            question = (turn.get('question') or '').strip()
            answer = (turn.get('answer') or '').strip()

            if not question or not answer:
                continue

            normalized_history.append({
                'question': question,
                'answer': answer,
                'sources': turn.get('sources') or [],
                'expanded_queries': turn.get('expanded_queries') or [],
                'validation': turn.get('validation') or {},
            })

        self.conversation_history = normalized_history

    def get_history(self):
        return self.conversation_history

HybridRetriever = HybridRetriever
UnifiedLLMClient = UnifiedLLMClient
