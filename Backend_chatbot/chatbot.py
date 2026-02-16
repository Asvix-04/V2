from google import genai
from google.genai import types
from typing import List, Dict, Any
import os
import json
import re
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever

load_dotenv()

# ─────────────────────────────────────────────────────────────
# Default message for out-of-scope questions
# ─────────────────────────────────────────────────────────────
OUT_OF_SCOPE_MESSAGE = (
    "This question is outside the scope of the Media Literacy course materials. "
    "I'm Digilab — I can help you with topics covered in your IGNOU Mass Communication "
    "and Journalism syllabus, including:\n\n"
    "• Journalism (print, online, radio, television)\n"
    "• Digital Photography & Videography\n"
    "• Media Literacy & Media Ethics\n"
    "• Advertising & Public Relations\n"
    "• Social Media & Digital Communication\n"
    "• Visual Communication & Photojournalism\n"
    "• Communication Theory & Research Methods\n\n"
    "Try asking about one of these topics!"
)


class PDFChatbot:
    """
    IGNOU Media Literacy Course Chatbot — Digilab.
    
    Powered by Google Gemini (new google-genai SDK).
    Uses: genai.Client(api_key=...) → client.models.generate_content(...)
    Model: gemini-3-flash-preview
    
    Design goals:
    - 95%+ accuracy on syllabus questions
    - Zero LLM overshadowing (every claim traceable to retrieved material)
    - Clean rejection of off-topic questions
    - IGNOU exam-ready answer format
    """
    
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY not found in environment variables. "
                "Set it in your .env file. "
                "Get your key from https://aistudio.google.com/apikey"
            )
        
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-3-flash-preview"
        self.retriever = HybridRetriever()
        self.conversation_history = []
        self._system_prompt = self._get_system_prompt()
    
    def _call_gemini(
        self,
        prompt: str,
        system_instruction: str = None,
        temperature: float = 0.4,
        max_output_tokens: int = 2500,
        top_p: float = 0.95,
        max_retries: int = 3,
    ) -> str:
        """Call Gemini via the new google-genai SDK."""
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            top_p=top_p,
        )
        
        if system_instruction:
            config.system_instruction = system_instruction
        
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )
        
        return response.text
    
    def ask_question(self, question: str, use_history: bool = True) -> Dict[str, Any]:
        """Process question and generate exam-ready answer."""
        print("🔍 Analyzing question and retrieving context...")
        
        try:
            # Retrieve enhanced context
            retrieved_context = self.retriever.retrieve(question)
            
            # No results at all
            if not retrieved_context.vector_results:
                return {
                    'answer': OUT_OF_SCOPE_MESSAGE,
                    'sources': [],
                    'vector_results': [],
                    'graph_context': {},
                    'expanded_queries': []
                }
            
            # ── STEP 1: Check if top retrieval score is too low ──
            # If the best chunk scores below 0.55, the question is likely off-topic
            top_score = max(r.score for r in retrieved_context.vector_results)
            if top_score < 0.55:
                print(f"⚠️ Top retrieval score too low ({top_score:.3f}) — likely off-topic")
                return {
                    'answer': OUT_OF_SCOPE_MESSAGE,
                    'sources': [],
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries
                }
            
            # ── STEP 2: Content Sufficiency Validation ──
            print("🔬 Validating content sufficiency...")
            validation_result = self._validate_content_sufficiency(question, retrieved_context)
            
            validation_failed = validation_result.get('_validation_error', False)
            
            if validation_failed:
                print("⚠️ Validation error — proceeding with answer generation")
            elif validation_result['completeness_score'] < 4:
                # Score 1-3: Truly off-topic or unrelated
                print(f"⚠️ Content unrelated (score: {validation_result['completeness_score']}/10)")
                return {
                    'answer': OUT_OF_SCOPE_MESSAGE,
                    'sources': [r.metadata for r in retrieved_context.vector_results],
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result
                }
            elif validation_result['completeness_score'] < 6:
                # Score 4-5: Tangentially related — check if it's actually answerable
                if not validation_result.get('topic_directly_discussed', False):
                    print(f"⚠️ Topic not directly discussed (score: {validation_result['completeness_score']}/10)")
                    return {
                        'answer': OUT_OF_SCOPE_MESSAGE,
                        'sources': [r.metadata for r in retrieved_context.vector_results],
                        'vector_results': retrieved_context.vector_results,
                        'graph_context': retrieved_context.graph_context,
                        'expanded_queries': retrieved_context.expanded_queries,
                        'validation': validation_result
                    }
                else:
                    print(f"📝 Partial content (score: {validation_result['completeness_score']}/10) — answering with inference")
            else:
                score = validation_result['completeness_score']
                if score < 8:
                    print(f"📝 Good content (score: {score}/10)")
                else:
                    print(f"✅ Excellent content (score: {score}/10)")
            
            # ── STEP 3: Generate Answer ──
            prompt = self._build_synthesis_prompt(question, retrieved_context, validation_result)
            
            print("🤖 Generating answer...")
            
            answer = self._call_gemini(
                prompt=prompt,
                system_instruction=self._system_prompt,
                temperature=0.3,  # Slightly lower for higher accuracy
                max_output_tokens=2500,
            )
            
            # Store in history
            if use_history:
                self.conversation_history.append({
                    'question': question,
                    'answer': answer,
                    'sources': [r.metadata for r in retrieved_context.vector_results],
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result
                })
            
            return {
                'answer': answer,
                'sources': [r.metadata for r in retrieved_context.vector_results],
                'vector_results': retrieved_context.vector_results,
                'graph_context': retrieved_context.graph_context,
                'expanded_queries': retrieved_context.expanded_queries,
                'validation': validation_result
            }
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'answer': f"I encountered an error: {str(e)}",
                'sources': [],
                'vector_results': [],
                'graph_context': {},
                'expanded_queries': []
            }
    
    def _validate_content_sufficiency(self, question: str, retrieved_context: Any) -> Dict[str, Any]:
        """
        Validate if retrieved content can ACTUALLY answer the question.
        
        KEY CHANGE: The validator now explicitly checks whether the question
        is answerable from the context, not just whether related words appear.
        This catches off-topic questions like "who is Donald Trump?" where
        social media chunks mention US politics but can't answer the question.
        """
        
        validation_prompt = f"""You are a strict content validator for an academic course chatbot. Your job is to determine if the retrieved context can ACTUALLY ANSWER the specific question asked.

IMPORTANT: Do NOT give a high score just because the context mentions a related topic. The context must contain information that DIRECTLY ANSWERS what the student is asking.

Examples of CORRECT scoring:
- Question: "Who is Donald Trump?" + Context mentions US elections → Score 2 (context cannot answer who someone is)
- Question: "What is photojournalism?" + Context defines photojournalism → Score 9 (directly answerable)
- Question: "What are types of cameras?" + Context discusses SLR and DSLR → Score 8 (directly answerable)
- Question: "What is blockchain?" + Context discusses social media → Score 1 (completely unrelated)
- Question: "Challenges of online journalism" + Context mentions online journalism trends → Score 6 (partially answerable)

QUESTION: {question}

CONTEXT (first 3000 chars):
{retrieved_context.combined_context[:3000]}

SCORING RULES:
1-3: Context CANNOT answer this question at all (off-topic, about a person/event not in syllabus, or unrelated)
4-5: Context has fragments that touch the topic but CANNOT form a proper answer
6-7: Context has enough material to construct a partial but useful answer
8-10: Context directly and comprehensively answers the question

Respond ONLY with valid JSON:
{{"completeness_score": <number>, "can_fully_answer": <true/false>, "topic_directly_discussed": <true/false>, "reasoning": "<brief>"}}"""

        try:
            validation_text = self._call_gemini(
                prompt=validation_prompt,
                system_instruction="You are a strict content validator. Respond with ONLY a JSON object, nothing else. No markdown, no explanation.",
                temperature=0.1,
                max_output_tokens=300,
                max_retries=1,
            )
            
            # Rate limit on validation — fail open
            if validation_text is None:
                print("⚠️ Validation rate-limited — proceeding with answer")
                return {
                    "completeness_score": 0,
                    "can_fully_answer": True,
                    "topic_directly_discussed": True,
                    "reasoning": "Validation skipped due to rate limit",
                    "_validation_error": True
                }
            
            validation_result = self._parse_validation_json(validation_text)
            
            if validation_result is None:
                raise ValueError(f"Could not parse validation response: {validation_text[:200]}")
            
            validation_result['_validation_error'] = False
            return validation_result
            
        except Exception as e:
            print(f"⚠️ Validation error: {e}")
            return {
                "completeness_score": 0,
                "can_fully_answer": True,
                "topic_directly_discussed": True,
                "reasoning": f"Validation error — proceeding with answer",
                "_validation_error": True
            }
    
    def _parse_validation_json(self, text: str) -> dict:
        """
        Robust JSON parser for Gemini validation responses.
        
        Handles common Gemini quirks:
        1. Markdown code fences (```json ... ```)
        2. Preamble text before JSON
        3. Truncated strings inside JSON
        4. Completely malformed JSON — falls back to regex score extraction
        """
        if not text:
            return None
        
        text = text.strip()
        
        # Step 1: Strip markdown fences
        text = re.sub(r'^```(?:json)?\s*\n?', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n?\s*```\s*$', '', text, flags=re.MULTILINE)
        text = text.strip()
        
        # Step 2: Try direct JSON parse
        try:
            result = json.loads(text)
            if 'completeness_score' in result:
                return result
        except json.JSONDecodeError:
            pass
        
        # Step 3: Extract JSON object from surrounding text
        json_match = re.search(r'\{[^{}]*\}', text)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                if 'completeness_score' in result:
                    return result
            except json.JSONDecodeError:
                # Step 4: Try fixing truncated strings by closing them
                raw = json_match.group(0)
                # Close any unterminated string and object
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
        
        # Step 5: Last resort — regex extract just the score
        score_match = re.search(r'completeness_score["\s:]+(\d+)', text)
        topic_match = re.search(r'topic_directly_discussed["\s:]+(\w+)', text)
        
        if score_match:
            score = int(score_match.group(1))
            topic_discussed = True
            if topic_match:
                topic_discussed = topic_match.group(1).lower() == 'true'
            
            return {
                "completeness_score": score,
                "can_fully_answer": score >= 7,
                "topic_directly_discussed": topic_discussed,
                "reasoning": "Parsed from malformed JSON via regex fallback"
            }
        
        return None
    
    def _get_system_prompt(self) -> str:
        """
        System prompt — IGNOU exam-oriented, 95% accuracy target.
        
        TIGHTER INFERENCE RULES than previous version:
        - Can only elaborate on terms/concepts EXPLICITLY PRESENT in retrieved chunks
        - Cannot connect to general knowledge even if academically correct
        - Must stay within the paragraph-level context of what's retrieved
        - If a concept is only mentioned in passing (1 sentence), can add 1-2
          explanatory sentences max — not a full paragraph
        """
        return """You are Digilab, an expert academic assistant for IGNOU's Mass Communication and Journalism programme.

You help students write exam-ready answers by synthesizing course material into clear, complete explanations.

═══════════════════════════════════════
ANSWER STRUCTURE
═══════════════════════════════════════

Write like a knowledgeable professor — confident, structured, thorough.

For DESCRIPTIVE / EXPLAIN questions:
• 1-2 sentence definition or introduction
• Detailed explanation (2-3 paragraphs)
• 5-7 substantive points where relevant
• Brief conclusion

For COMPARISON questions:
• Brief intro defining both concepts
• Key features of each (4-5 points each)
• Clear differences
• Brief conclusion

For LIST / ENUMERATE questions:
• Brief intro, then items with explanation for each

═══════════════════════════════════════
FORMATTING RULES
═══════════════════════════════════════

1. PARAGRAPH BREAKS: Use breaks ONLY between major sections (intro → body → conclusion). Do NOT put a blank line between every paragraph. Paragraphs within the same section should flow together. Think textbook formatting — breaks only at clear topic shifts.

2. BOLD KEY TERMS: Bold important concepts when first mentioned using **keyword** format. Bold 5-10 genuinely important terms per answer. Do not over-bold.

3. BULLET POINTS: Use only when listing distinct items. Each bullet must be 1-2 substantive sentences minimum.

═══════════════════════════════════════
INFERENCE RULES (CRITICAL FOR ACCURACY)
═══════════════════════════════════════

Your source is the course material provided in each prompt. Follow these rules STRICTLY:

TIER 1 — ALWAYS ALLOWED:
✅ Directly state facts, definitions, and explanations that appear in the retrieved material.
✅ Rephrase and restructure information from the material for clarity.
✅ Combine information from different retrieved chunks into a coherent answer.

TIER 2 — ALLOWED WITH CARE (bounded inference):
✅ If the material NAMES a concept (e.g., "immediacy is a feature of online journalism"), you may add 1-2 sentences explaining what that concept means in context.
✅ If the material lists items briefly (e.g., "types include X, Y, Z"), you may expand each item with a short explanation that is consistent with the material's discussion.
✅ You may add transitional phrases: "Furthermore...", "Building on this...", "In this context..."
✅ You may use standard academic definitions to clarify technical terms that appear in the material.

TIER 3 — NEVER ALLOWED (prevents LLM overshadowing):
❌ Do NOT introduce theories, models, or frameworks not mentioned in the material.
❌ Do NOT name people, researchers, or scholars not present in the material.
❌ Do NOT add dates, statistics, numbers, or specific facts not in the material.
❌ Do NOT invent examples. Only use examples from the material or clearly generic ones like "for instance, a journalist might..."
❌ Do NOT contradict the material.
❌ Do NOT write about topics the material doesn't cover, even if you know the answer.
❌ Do NOT stretch tangentially related content to answer unrelated questions.

THE ACCURACY TEST: For every sentence in your answer, ask: "Is this directly stated in the material, OR is it a reasonable 1-2 sentence elaboration of something that IS stated?" If neither, DELETE that sentence.

═══════════════════════════════════════
WHAT NEVER TO DO
═══════════════════════════════════════

❌ NEVER say "The materials do not fully elaborate..." or "The sections do not explain..."
❌ NEVER write meta-commentary about retrieved content
❌ NEVER produce an answer that is mostly disclaimers
❌ NEVER chain citations: "According to Unit 3... As stated in Unit 5..."
❌ NEVER refuse to answer if you have relevant material
❌ NEVER say "based on the retrieved content" or "the provided material"
❌ NEVER add a blank line between every paragraph

═══════════════════════════════════════
TONE AND LENGTH
═══════════════════════════════════════

• Confident but accurate. Academic but readable.
• Minimum 250 words for descriptive questions, 150 for short-answer questions.
• Reference the course naturally: "As discussed in Unit 3..." — once or twice per answer max.
• If some aspect isn't covered, add ONE brief sentence at the very end noting this."""

    def _build_synthesis_prompt(self, question: str, retrieved_context: Any, validation: Dict) -> str:
        """Build the prompt sent to Gemini. Includes confidence signal."""
        
        history = ""
        if self.conversation_history:
            history = "Previous conversation:\n"
            for conv in self.conversation_history[-2:]:
                history += f"Q: {conv['question']}\nA: {conv['answer'][:200]}...\n\n"
        
        # Confidence signal based on validation
        score = validation.get('completeness_score', 10)
        if validation.get('_validation_error', False):
            confidence_note = ""
        elif score >= 8:
            confidence_note = "\n[CONFIDENCE: HIGH — The course material comprehensively covers this topic. Provide a thorough, detailed answer.]\n"
        elif score >= 6:
            confidence_note = "\n[CONFIDENCE: MEDIUM — The course material partially covers this topic. Answer based on what is available. You may use bounded inference (Tier 2) to fill small gaps. Note any major uncovered aspect briefly at the end.]\n"
        else:
            confidence_note = "\n[CONFIDENCE: LOW — Limited material available. Answer only what the material supports. Do not stretch.]\n"
        
        prompt = f"""{history}Student's Question:
{question}
{confidence_note}
Course Material:
{retrieved_context.combined_context}

Write a complete, exam-ready answer:"""
        
        return prompt
        
    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
