"""
chatbot.py — Digilab Media Literacy Course Chatbot.

Merged version combining:
- Downloads chatbot.py  (v6: follow-up continuity guard, smart redirect, follow-up generator)
- Downloads chatbot (1).py (v6: _is_likely_followup, _record_turn, _get_recent_conversation_context)
- worker/chatbot.py     (v7: dynamic length detection, auth-error handling, v7 system prompt)

All features from every version are preserved and active.
"""

from typing import List, Dict, Any
from urllib.parse import quote
import os, json, re, time
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever
from llm_client import UnifiedLLMClient, AVAILABLE_MODELS, ModelConfig
from follow_up_generator import FollowUpGenerator

load_dotenv()

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

    def _map_model_name(self, model_name: str) -> str:
        """Map frontend model names to internal LLM IDs."""
        if not model_name:
            return "1"  # Default to Flash
        
        name = model_name.lower()
        if "pro" in name:
            return "2"
        if "haiku" in name or "claude" in name:
            return "3"
        return "1"  # Default to Flash

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
        return False

    def _record_turn(self, question: str, answer: str, use_history: bool = True,
                     sources: List[Dict[str, Any]] = None,
                     expanded_queries: List[str] = None,
                     validation: Dict[str, Any] = None):
        if not use_history:
            return
        self.conversation_history.append({
            'question': question,
            'answer': answer,
            'sources': sources or [],
            'expanded_queries': expanded_queries or [],
            'validation': validation or {}
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
    # Main question handler
    # ─────────────────────────────────────────────────────────

    def ask_question(self, question: str, use_history: bool = True) -> Dict[str, Any]:
        """
        Process question and generate a dynamically-sized exam-ready answer.

        Gating logic (v6/v7):
          < min_score_gate           → HARD REJECT
          >= min_score_gate          → validate
          val_score <= 4             → REFUSE (smart redirect)
          is_main=False, score < 7  → REFUSE (smart redirect)
          follow-up override         → allow continuity when follow-up detected
        """
        print("🔍 Analyzing question and retrieving context...")
        try:
            recent_context = self._get_recent_conversation_context() if use_history else ""
            likely_followup = bool(recent_context) and self._is_likely_followup(question)

            retrieval_query = question
            if likely_followup:
                retrieval_query = self._build_followup_retrieval_query(question)
                print("↪️ Follow-up context added to retrieval query")

            retrieved_context = self.retriever.retrieve(retrieval_query)
            if likely_followup and not retrieved_context.vector_results and retrieval_query != question:
                print("↩️ Follow-up retrieval fallback to raw question")
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
                question, retrieved_context, conversation_context=recent_context
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

                if val_score <= 4:
                    if not allow_followup_override:
                        print(f"🚫 Validator: score={val_score} <= 4 — refusing")
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

            prompt = self._build_synthesis_prompt(question, retrieved_context, validation_result)
            print("🤖 Generating answer...")
            answer = self._call_llm(prompt=prompt, system_instruction=self._system_prompt,
                                    temperature=0.3, max_output_tokens=self.model_config.default_max_tokens)

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

            self._record_turn(question, answer, use_history=use_history,
                              sources=source_meta,
                              expanded_queries=retrieved_context.expanded_queries,
                              validation=validation_result)

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
                "type_1_general": [],
                "type_2_context_aware": ["question1", "question2"],
                "follow_up_items": [...],
                "follow_up_markdown_links": [...],
                "status": "success" | "fallback" | "skipped" | "error"
            }
        """
        if not include_follow_up:
            return {
                "type_1_general": [],
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
                "type_1_general": [],
                "type_2_context_aware": [],
                "follow_up_items": [],
                "follow_up_markdown_links": [],
                "status": "error",
                "error": str(e)
            }

    def ask_question_with_follow_ups(
        self,
        question: str,
        model: str = None,
        use_history: bool = True,
        include_follow_ups: bool = True
    ) -> Dict[str, Any]:
        """
        Ask a question and optionally generate follow-up questions.

        Returns ask_question() result plus 'follow_up_questions' key.
        """
        # Switch model if requested
        if model:
            target_id = self._map_model_name(model)
            if target_id != self.model_config.id and target_id in AVAILABLE_MODELS:
                print(f"🔄 Switching model to: {AVAILABLE_MODELS[target_id].display_name}")
                self.switch_model(AVAILABLE_MODELS[target_id])

        response = self.ask_question(question, use_history=use_history)
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
            type_1_questions = follow_ups.get("type_1_general", [])
            type_2_questions = follow_ups.get("type_2_context_aware", [])
            all_questions = type_2_questions + type_1_questions
            follow_ups["follow_up_items"] = [
                {"question": q, "href": f"#ask={quote(q)}", "query": q, "type": "type_2" if q in type_2_questions else "type_1"}
                for q in all_questions
            ]
            follow_ups["follow_up_markdown_links"] = [
                f"[{q}](#ask={quote(q)})" for q in all_questions
            ]
            response['follow_up_questions'] = follow_ups
        else:
            response['follow_up_questions'] = {
                "type_1_general": [],
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

1. PARAGRAPH BREAKS: Only between major sections. NOT between every sentence.
2. BOLD KEY TERMS: Bold important concepts on first mention using **keyword** format.
3. BULLET POINTS: Only when listing distinct items. Each bullet 1-2 sentences minimum.
4. SHORT answers: plain prose only — no headers, no bullets unless listing is the task.

═══════════════════════════════════════
GROUNDING RULES — READ CAREFULLY
═══════════════════════════════════════

The course material provided in the prompt is YOUR ONLY SOURCE OF FACTS.

1. PRESERVE SOURCE LANGUAGE: When the material states a definition, key phrase, or technical term, use the SAME wording. Do not paraphrase factual claims into different words.

2. STRICT FACT SOURCING: Every person's name, date, year, statistic, researcher, theory name, and specific detail in your answer MUST appear word-for-word (or near word-for-word) in the retrieved course material. If a fact is not in the material, do not write it.

3. PARTIAL ANSWERS ARE FINE: If the material only partially covers the question, answer what you CAN from the material. End with one sentence like "The course material covers [aspect X]; other aspects are not addressed in the available sections."

4. EXAMPLE VS SUBJECT — CRITICAL RULE:
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

    def _build_synthesis_prompt(self, question: str, retrieved_context: Any,
                                validation: Dict) -> str:
        """
        v7: Calls _detect_length_instruction() and injects the [LENGTH] tag
        into the prompt above the course material, giving the LLM a specific
        per-question length instruction alongside the confidence signal.
        """
        history = ""
        if self.conversation_history:
            history = "Previous conversation:\n"
            for conv in self.conversation_history[-2:]:
                history += f"Q: {conv['question']}\nA: {conv['answer'][:200]}...\n\n"

        val_score = validation.get('completeness_score', 7)
        is_main = validation.get('is_main_subject', True)
        has_error = validation.get('_validation_error', False)

        if has_error:
            confidence_note = "\n[CONFIDENCE: MEDIUM — Answer strictly from the material below. Do NOT use world knowledge.]\n"
        elif val_score >= 8 and is_main:
            confidence_note = "\n[CONFIDENCE: HIGH — Material comprehensively covers this topic. Give a thorough, detailed answer using source language.]\n"
        elif val_score >= 7 and is_main:
            confidence_note = "\n[CONFIDENCE: HIGH — Material directly covers this. Give a thorough answer using source language.]\n"
        elif val_score >= 5 and is_main:
            confidence_note = "\n[CONFIDENCE: MEDIUM — Material partially covers this. Answer only what the material supports. Do NOT fill gaps with outside knowledge.]\n"
        else:
            confidence_note = (
                "\n[CONFIDENCE: LOW — WARNING: The retrieved material may only MENTION this topic as a passing example. "
                "DO NOT define or explain this topic using your world knowledge. "
                "Answer ONLY if the material explicitly teaches this topic.]\n"
            )

        # v7: dynamic length instruction per question
        length_instruction = self._detect_length_instruction(question)

        return (
            f"{history}"
            f"Student's Question:\n{question}\n\n"
            f"{length_instruction}\n"
            f"{confidence_note}\n"
            f"Course Material (YOUR ONLY SOURCE — use the exact terms and facts written here):\n"
            f"{retrieved_context.combined_context}\n\n"
            f"INSTRUCTION: Identify the most relevant sentences from the material above. "
            f"Build your answer from those sentences only. "
            f"Strictly follow the [LENGTH] instruction — do not exceed it or pad to fill it.\n\n"
            f"Write your answer:"
        )

    # ─────────────────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────────────────

    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []
