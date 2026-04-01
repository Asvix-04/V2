from typing import List, Dict, Any
import os, json, re, time
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever
from llm_client import UnifiedLLMClient, AVAILABLE_MODELS, ModelConfig

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


class PDFChatbot:
    """
    IGNOU Media Literacy Course Chatbot — Digilab v7.

    v7 changes — Dynamic Answer Length (Idea 5):

    PROBLEM SOLVED:
        The old system prompt forced a hard minimum of 250 words for every
        answer regardless of question complexity. "What is FM radio?" got
        six paragraphs when two sentences would suffice. Students using
        DigiLab for quick revision were getting over-explained answers.

    HOW IT WORKS (two-part Idea 5):

    Part 1 — System prompt rewritten:
        Removed the hardcoded 250-word floor entirely. Replaced with a
        philosophy: match answer length to the [LENGTH] tag in each prompt.
        The LLM now understands short/medium/long as distinct modes.

    Part 2 — _detect_length_instruction():
        Scans the FULL question using re.search() (not re.match()) so it
        catches compound questions like "What is X and explain Y?" correctly.
        Long patterns checked FIRST — if any part of the question demands
        explanation/discussion/comparison, the whole answer is LONG.
        Returns a [LENGTH: ...] tag injected directly into the synthesis prompt.

    Combined effect:
        System prompt sets the philosophy (no padding, obey the LENGTH tag).
        Length tag gives the LLM a specific per-question instruction.
        Together they align LLM behaviour with question intent reliably.

    All v6 gating, validation, and grounding logic unchanged.
    No re-indexing required. Deploy and restart.
    """

    def __init__(self, model_config: ModelConfig = None):
        if model_config is None:
            model_config = AVAILABLE_MODELS["1"]
        self.model_config = model_config
        self.llm_client = UnifiedLLMClient(model_config)
        self.retriever = HybridRetriever()
        self.conversation_history = []
        self._system_prompt = self._get_system_prompt()

    def switch_model(self, model_config: ModelConfig):
        """Switch LLM model without losing conversation history."""
        self.llm_client = UnifiedLLMClient(model_config)
        self.model_config = model_config

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
    # Dynamic length detection (Idea 5 — Part 2)
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
                    "[LENGTH: LONG — Write a complete, structured, exam-ready answer. "
                    "Include an introduction, detailed body with all relevant points, and a conclusion. "
                    "Use bullet points only when listing distinct items.]"
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

        GATING LOGIC (unchanged from v5/v6):
          < 0.020              → HARD REJECT
          >= 0.020             → Always validate
          val_score <= 4       → REFUSE
          is_main=False, <7    → REFUSE
        """
        print("🔍 Analyzing question and retrieving context...")
        try:
            retrieved_context = self.retriever.retrieve(question)

            if not retrieved_context.vector_results:
                return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                        'vector_results': [], 'graph_context': {}, 'expanded_queries': []}

            top_score = max(r.score for r in retrieved_context.vector_results)

            if top_score < 0.020:
                print(f"⚠️ Top score {top_score:.4f} — truly off-topic, refusing")
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

            validation_result = self._validate_content_sufficiency(question, retrieved_context)

            if validation_result.get('_validation_error', False):
                print("⚠️ Validation error — using score-based fallback")
                if top_score < 0.040:
                    return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                            'vector_results': retrieved_context.vector_results,
                            'graph_context': retrieved_context.graph_context,
                            'expanded_queries': retrieved_context.expanded_queries}
                validation_result = {
                    "completeness_score": 5, "can_fully_answer": False,
                    "is_main_subject": False, "topic_directly_discussed": False,
                    "reasoning": "Validation unavailable — cautious fallback",
                    "_validation_error": True
                }
            else:
                val_score = validation_result.get('completeness_score', 5)
                is_main = validation_result.get('is_main_subject', True)
                print(f"📊 Validation — score: {val_score}/10 | main_subject: {is_main}")

                if val_score <= 4:
                    print(f"🚫 Validator: score={val_score} <= 4 — refusing")
                    return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                            'vector_results': retrieved_context.vector_results,
                            'graph_context': retrieved_context.graph_context,
                            'expanded_queries': retrieved_context.expanded_queries}

                if not is_main and val_score < 7:
                    print(f"🚫 Validator: is_main_subject=False, score={val_score} < 7 — only incidental mention")
                    return {'answer': OUT_OF_SCOPE_MESSAGE, 'sources': [],
                            'vector_results': retrieved_context.vector_results,
                            'graph_context': retrieved_context.graph_context,
                            'expanded_queries': retrieved_context.expanded_queries}

            prompt = self._build_synthesis_prompt(question, retrieved_context, validation_result)
            print("🤖 Generating answer...")
            answer = self._call_llm(
                prompt=prompt,
                system_instruction=self._system_prompt,
                temperature=0.3,
                max_output_tokens=self.model_config.default_max_tokens,
            )

            if answer is None:
                return {'answer': RATE_LIMIT_MESSAGE,
                        'sources': [r.metadata for r in retrieved_context.vector_results],
                        'vector_results': retrieved_context.vector_results,
                        'graph_context': retrieved_context.graph_context,
                        'expanded_queries': retrieved_context.expanded_queries,
                        'validation': validation_result}

            if use_history:
                self.conversation_history.append({
                    'question': question, 'answer': answer,
                    'sources': [r.metadata for r in retrieved_context.vector_results],
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result
                })

            return {'answer': answer,
                    'sources': [r.metadata for r in retrieved_context.vector_results],
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result}

        except Exception as e:
            print(f"Error: {e}")
            import traceback; traceback.print_exc()
            return {'answer': f"I encountered an error: {str(e)}", 'sources': [],
                    'vector_results': [], 'graph_context': {}, 'expanded_queries': []}

    # ─────────────────────────────────────────────────────────
    # explain_selection — for api_server.py /chat/explain-selection
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
    # Validation
    # ─────────────────────────────────────────────────────────

    def _validate_content_sufficiency(self, question: str, retrieved_context: Any) -> Dict[str, Any]:
        """Confidence signal — always runs, never skipped by score alone."""
        validation_prompt = f"""You are evaluating whether a student's question is genuinely covered by the course material provided.

STUDENT QUESTION: {question}

COURSE MATERIAL EXCERPT (first 3000 chars):
{retrieved_context.combined_context[:3000]}

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

Respond ONLY as a single JSON object with no markdown:
{{"completeness_score": <1-10>, "can_fully_answer": <true/false>, "is_main_subject": <true/false>, "topic_directly_discussed": <true/false>, "reasoning": "<one sentence>"}}"""

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
                        "topic_directly_discussed": False, "reasoning": "Rate limit", "_validation_error": True}

            result = self._parse_validation_json(validation_text)
            if result is None:
                print(f"⚠️ Validation parse failed: {validation_text[:200]}")
                return {"completeness_score": 2, "can_fully_answer": False, "is_main_subject": False,
                        "topic_directly_discussed": False, "reasoning": "Parse failed", "_validation_error": True}

            if 'is_main_subject' not in result:
                result['is_main_subject'] = result.get('topic_directly_discussed', True)
            result['_validation_error'] = False
            return result

        except Exception as e:
            print(f"⚠️ Validation error: {e}")
            return {"completeness_score": 2, "can_fully_answer": False, "is_main_subject": False,
                    "topic_directly_discussed": False, "reasoning": "Exception", "_validation_error": True}

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
    # System prompt (v7 — dynamic length philosophy)
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

1. PRESERVE SOURCE LANGUAGE: When the material states a definition, key phrase, or technical term, use the SAME wording.

2. STRICT FACT SOURCING: Every person's name, date, year, statistic, researcher, and specific detail in your answer MUST appear in the retrieved course material. If a fact is not in the material, do not write it.

3. PARTIAL ANSWERS ARE FINE: If the material only partially covers the question, answer what you CAN. End with one sentence like "The course material covers [aspect X]; other aspects are not addressed in the available sections."

4. EXAMPLE VS SUBJECT: If the confidence level says LOW or MEDIUM:
   ❌ DO NOT define or explain the topic using your world knowledge
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
    # Synthesis prompt builder (v7 — injects [LENGTH] tag)
    # ─────────────────────────────────────────────────────────

    def _build_synthesis_prompt(self, question: str, retrieved_context: Any, validation: Dict) -> str:
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
            confidence_note = "\n[CONFIDENCE: HIGH — Material comprehensively covers this. Give a thorough answer using source language.]\n"
        elif val_score >= 7 and is_main:
            confidence_note = "\n[CONFIDENCE: HIGH — Material directly covers this. Give a thorough answer using source language.]\n"
        elif val_score >= 5 and is_main:
            confidence_note = "\n[CONFIDENCE: MEDIUM — Material partially covers this. Answer only what the material supports. Do NOT fill gaps.]\n"
        else:
            confidence_note = (
                "\n[CONFIDENCE: LOW — The material may only MENTION this topic as a passing example. "
                "DO NOT define or explain using world knowledge. Answer ONLY if the material explicitly teaches this.]\n"
            )

        # NEW in v7 — detect and inject length instruction
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
