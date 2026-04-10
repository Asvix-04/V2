"""
chatbot.py — Digilab Media Literacy Course Chatbot.

Merged version combining:
- v7: follow-up continuity guard, smart redirect, follow-up generator
- v7: dynamic length detection, auth-error handling, v7 system prompt
- S2S/T2T specific grounding and history management
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
# Module-level helpers
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
    Smart out-of-scope redirect.
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
    # Follow-up continuity helpers
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
    # Dynamic length detection
    # ─────────────────────────────────────────────────────────

    def _detect_length_instruction(self, question: str) -> str:
        """
        Scans the FULL question for intent keywords and returns a [LENGTH] tag.
        """
        q = question.lower().strip()

        # Special prefixes
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

        # LONG
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

        # MEDIUM
        medium_patterns = [
            r'\bwhat is the (role|importance|significance|purpose|function|need)\b',
            r'\bwhat is the (difference|distinction)\b',
            r'\bhow does\b', r'\bwhy is\b', r'\bwhy are\b', r'\bwhy do\b',
            r'\bwhat do you (mean|understand) by\b',
            r'\bhow is\b', r'\bgive an overview\b',
        ]

        # SHORT
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

            validation_result = self._validate_content_sufficiency(
                question, retrieved_context, conversation_context=recent_context
            )

            if validation_result.get('_validation_error', False):
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
                allow_followup_override = likely_followup and top_score >= 0.025 and val_score >= 2

                if val_score <= 4:
                    if not allow_followup_override:
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

    def generate_follow_up_questions(
        self,
        assistant_response: str,
        user_question: str,
        include_follow_up: bool = True
    ) -> Dict[str, Any]:
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

    def _validate_content_sufficiency(self, question: str, retrieved_context: Any,
                                      conversation_context: str = "") -> Dict[str, Any]:
        followup_block = ""
        if conversation_context:
            followup_block = (
                f"\nRECENT CONVERSATION CONTEXT:\n{conversation_context[:1200]}\n\n"
                "If the student's question appears to be a follow-up, "
                "evaluate it relative to the ongoing topic above.\n"
            )

        validation_context = self._build_validation_context(retrieved_context)

        validation_prompt = f"""You are evaluating whether a student's question is covered by the course material.

STUDENT QUESTION: {question}

{followup_block}
COURSE MATERIAL EXCERPT:
    {validation_context}

Return structure:
{{"completeness_score": <1-10>, "can_fully_answer": <bool>, "is_main_subject": <bool>, "topic_directly_discussed": <bool>, "reasoning": "<string>"}}"""

        try:
            validation_text = self._call_llm(
                prompt=validation_prompt,
                system_instruction="Respond with ONLY JSON.",
                temperature=0.1,
                max_output_tokens=300,
            )
            if validation_text is None: return {"_validation_error": True}
            result = self._parse_validation_json(validation_text)
            return result or {"_validation_error": True}
        except Exception:
            return {"_validation_error": True}

    def _build_validation_context(self, retrieved_context: Any, max_sections: int = 5) -> str:
        if not retrieved_context or not getattr(retrieved_context, 'vector_results', None):
            return ''
        sections = []
        seen = set()
        for result in retrieved_context.vector_results:
            meta = result.metadata if hasattr(result, 'metadata') else {}
            sec = meta.get('full_section', 'Unknown')
            if sec not in seen:
                seen.add(sec)
                snippet = result.text if hasattr(result, 'text') else meta.get('text', '')
                sections.append(f"[FROM: {sec}]\n{snippet[:400]}")
            if len(sections) >= max_sections: break
        return "\n\n".join(sections)

    def _parse_validation_json(self, text: str) -> dict:
        try:
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
        except: pass
        return None

    def _build_synthesis_prompt(self, question: str, retrieved_context: Any, validation_result: dict) -> str:
        length_instr = self._detect_length_instruction(question)
        context = retrieved_context.combined_context
        val_score = validation_result.get('completeness_score', 5)

        return f"""STUDENT QUESTION: {question}

{length_instr}

[CONFIDENCE: {val_score}/10]

{context}

Answer the student's question using ONLY the course material provided above."""

    def _get_system_prompt(self) -> str:
        return """You are Digilab, an expert academic assistant for IGNOU's Mass Communication programme. 
OBEY THE [LENGTH] TAG in every prompt. Use ONLY the provided material. Do not add outside facts."""

    def clear_history(self):
        self.conversation_history = []
    
    def get_history(self):
        return self.conversation_history

 HybridRetriever = HybridRetriever
 UnifiedLLMClient = UnifiedLLMClient
