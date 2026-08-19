"""
deep_research_engine.py — 5-Layer Deep Research Engine for /deepchat

Layers:
  1. Orchestrator   — Splits multi-part questions into sub-questions
  2. Worker Agents  — Runs each sub-question through chatbot.ask_question() in parallel
  3. Verifier       — Checks each worker's result for content sufficiency
  4. Web Fallback   — Tavily search for sub-questions that failed verification
  5. Synthesizer    — Merges all verified sub-answers into one coherent report

Workers reuse the exact same processing pipeline as /chat (retrieve → validate → synthesize).
No separate models are needed — workers call chatbot.ask_question() directly.
"""

import asyncio
import os
import re
import json
import time
import traceback
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv


load_dotenv()


# ─────────────────────────────────────────────────────────────
# Data Classes
# ─────────────────────────────────────────────────────────────

@dataclass
class SubQuestionResult:
    """Result for a single sub-question after worker + verifier + optional web fallback."""
    sub_question: str
    answer: str = ""
    sources: List[Dict[str, Any]] = field(default_factory=list)
    web_sources: List[Dict[str, Any]] = field(default_factory=list)
    resolved_by: str = "corpus"          # "corpus" | "web" | "insufficient"
    verifier_score: int = 0
    is_main_subject: bool = False
    validation: Dict[str, Any] = field(default_factory=dict)
    raw_result: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DeepResearchResult:
    """Final result returned by the engine."""
    answer: str
    sub_questions: List[str]
    layer_trace: List[Dict[str, Any]]
    sources: List[Dict[str, Any]]
    web_sources: List[Dict[str, Any]]


# ─────────────────────────────────────────────────────────────
# Layer 1: Orchestrator
# ─────────────────────────────────────────────────────────────

class Orchestrator:
    """
    Reads the question, decides if it's multi-part, splits it into sub-questions.
    
    Detection: looks for "compare", "vs", "versus", "difference", "distinguish",
    multiple "?", or "and" joining distinct topics.
    
    Splitting: One LLM call (Gemini Flash) — only triggered when multi-topic
    phrasing is detected.
    """

    # Patterns that suggest a multi-part question
    _MULTI_PART_PATTERNS = re.compile(
        r'\b(compare|vs\.?|versus|difference\s+between|distinguish\s+between|'
        r'differentiate\s+between|similarities?\s+and\s+differences?|'
        r'contrast|pros?\s+and\s+cons?)\b',
        re.IGNORECASE,
    )

    @staticmethod
    def _has_multiple_questions(question: str) -> bool:
        """
        Check if the question contains multiple question marks, direct comparisons,
        or multiple aspects (e.g. 'features and implementation').
        """
        q_count = question.count('?')
        if q_count >= 2:
            return True
            
        # 1. Direct comparison keywords
        if Orchestrator._MULTI_PART_PATTERNS.search(question):
            return True
            
        # 2. Check for list structures (e.g., "X, Y, and Z")
        if ',' in question and re.search(r',\s*(and|or|as\s+well\s+as)\b', question, re.IGNORECASE):
            return True
            
        # 3. Check for multiple distinct aspects (e.g. "features and characteristics and how to implement")
        question_lower = question.lower()
        aspects = ['feature', 'characteristic', 'implement', 'history', 'type', 'principle', 'benefit', 'definition', 'step', 'role', 'impact', 'advantage', 'disadvantage']
        aspects_present = [a for a in aspects if a in question_lower]
        
        # If there are multiple distinct aspects and they are joined by "and"/"or"
        if len(aspects_present) >= 2 and ('and' in question_lower or 'or' in question_lower):
            return True
            
        # 4. Query with "and" followed by specific prompt tags or determiners (e.g. "Explain X and how to...", "...and its history")
        if 'and' in question_lower:
            parts = question_lower.split('and', 1)
            second_part = parts[1] if len(parts) > 1 else ""
            second_part_keywords = ['how', 'why', 'what', 'who', 'its', 'their', 'explain', 'describe', 'define', 'give', 'list']
            if any(re.search(rf'\b{kw}\b', second_part) for kw in second_part_keywords):
                return True

        return False

    @staticmethod
    def plan(question: str, chatbot) -> List[str]:
        """
        Analyze the question and return a list of sub-questions.
        Single-topic questions return [question] (no split).
        Multi-part questions are split via an LLM call.
        """
        question = question.strip()
        if not question:
            return [question]

        # Quick check: is this likely multi-part?
        if not Orchestrator._has_multiple_questions(question):
            print(f"🎯 Orchestrator: Single-topic question — no split needed")
            return [question]

        print(f"🔀 Orchestrator: Multi-part question detected — splitting via LLM...")

        split_prompt = f"""You are a question decomposer. Break this question into independent sub-questions that can each be researched separately.

QUESTION: {question}

Rules:
1. Return 2-3 sub-questions maximum.
2. Each sub-question should be self-contained and independently searchable.
3. If the question is actually a single topic (even with "compare" phrasing), keep it as one question.
4. Do NOT add questions the user didn't ask.
5. Return ONLY a JSON array of strings, nothing else.

Example input: "Compare print journalism and radio journalism"
Example output: ["What is print journalism and its key characteristics?", "What is radio journalism and its key characteristics?"]

Example input: "What is photojournalism?"
Example output: ["What is photojournalism?"]

Return the JSON array:"""

        try:
            
            result = chatbot._call_llm(
                prompt=split_prompt,
                system_instruction="Respond with ONLY a JSON array of strings. No markdown, no explanation.",
                temperature=0.1,
                max_output_tokens=300,
                max_retries=1,
                timeout=10,
            )

            print(f"DEBUG orchestrator raw: '{result}'")  # 👈

            if result:
                # Parse JSON array from response
                result = result.strip()
                # Remove markdown code fences if present
                result = re.sub(r'^```(?:json)?\s*', '', result)
                result = re.sub(r'\s*```$', '', result)

                if result and not result.endswith(']'):
                    last_quote = result.rfind('"')
                    if last_quote > 0:
                        result = result[:last_quote + 1] + ']'
                
                parsed = json.loads(result)
                if isinstance(parsed, list) and len(parsed) >= 1:
                    sub_questions = [q.strip() for q in parsed if q.strip()]
                    if sub_questions:
                        print(f"🔀 Orchestrator: Split into {len(sub_questions)} sub-questions: {sub_questions}")
                        return sub_questions[:3]  # Cap at 3

        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ Orchestrator: LLM split failed ({e}) — proceeding with original question")

        # Fallback: don't split
        return [question]


# ─────────────────────────────────────────────────────────────
# Layer 2: Worker Agents
# ─────────────────────────────────────────────────────────────

class WorkerAgent:
    """
    Executes a single sub-question through the existing chatbot.ask_question() pipeline.
    
    This is the SAME processing as /chat:
      retrieve → validate sufficiency → synthesize answer
    
    Workers run in parallel via asyncio + ThreadPoolExecutor.
    """

    @staticmethod
    def execute(sub_question: str, chatbot, model: str = None, 
                use_history: bool = False) -> Dict[str, Any]:
        """
        Run a single sub-question through chatbot.ask_question().
        
        use_history is False by default for workers — each sub-question is
        independent and shouldn't be influenced by conversation history.
        """
        print(f"🔧 Worker: Processing sub-question: '{sub_question[:60]}...'")
        try:
            result = chatbot.ask_question(
                question=sub_question,
                model=model,
                use_history=use_history,  
                # low_latency removed — not supported in this codebase
            )
            return result
        except Exception as e:
            print(f"❌ Worker error for '{sub_question[:40]}': {e}")
            traceback.print_exc()
            return {
                'answer': f"Error processing sub-question: {str(e)}",
                'sources': [],
                'vector_results': [],
                'graph_context': {},
                'expanded_queries': [],
                'validation': {},
            }

    @staticmethod
    async def execute_parallel(sub_questions: List[str], chatbot, 
                                model: str = None,
                                use_history: bool = False) -> List[Dict[str, Any]]:
        """
        Run all sub-questions in parallel using ThreadPoolExecutor.
        chatbot.ask_question() is synchronous, so we wrap it in run_in_executor.
        """
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=min(len(sub_questions), 3))

        tasks = [
            loop.run_in_executor(
                executor,
                WorkerAgent.execute,
                sq, chatbot, model, use_history
            )
            for sq in sub_questions
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error results
        processed = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"❌ Worker exception for sub-question {i}: {result}")
                processed.append({
                    'answer': f"Error: {str(result)}",
                    'sources': [],
                    'vector_results': [],
                    'graph_context': {},
                    'expanded_queries': [],
                    'validation': {},
                })
            else:
                processed.append(result)

        executor.shutdown(wait=False)
        return processed


# ─────────────────────────────────────────────────────────────
# Layer 3: Verifier
# ─────────────────────────────────────────────────────────────

class Verifier:
    """
    Checks each worker's retrieved evidence for grounding/sufficiency.
    
    Reuses the existing _validate_content_sufficiency() output that's already
    in the worker result's 'validation' dict — no duplicate validation call.
    
    A sub-question "passes" if:
      - completeness_score >= 5, OR
      - the answer is substantive (not a refusal/out-of-scope message)
    """

    # Known refusal and rate-limit phrases from the chatbot
    _REFUSAL_PHRASES = [
        "outside the scope",
        "outside the course materials",
        "does not appear in the provided course material",
        "not covered in the course material",
        "not found in the course material",
        "cannot provide information on this topic",
        "not mentioned in the provided course material",
        "not mentioned in the syllabus",
        "experiencing high traffic",
        "wait a moment and try again",
        "rate limit",
        "unauthorized",
        "api key",
        "invalid key",
        "error processing",
        "i encountered an error",
    ]

    @staticmethod
    def _get_keywords(text: str) -> List[str]:
        """Extract core search terms from a query, filtering out common question stopwords."""
        stopwords = {
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
            'over', 'under', 'through', 'during', 'while', 'because', 'since', 'until', 'key',
            'principles', 'concepts', 'concept', 'features', 'characteristics', 'vs', 'versus',
            'difference', 'differences', 'compare', 'comparison'
        }
        words = re.sub(r'[^\w\s]', ' ', text.lower()).split()
        return [w for w in words if w not in stopwords and len(w) >= 3]

    @staticmethod
    def check(sub_question: str, worker_result: Dict[str, Any]) -> SubQuestionResult:
        """
        Verify a single worker result. Returns a SubQuestionResult with
        resolved_by set to "corpus" (sufficient) or "insufficient" (needs web fallback).
        """
        answer = (worker_result.get('answer') or '').strip()
        answer_lower = answer.lower()
        validation = worker_result.get('validation') or {}
        sources = worker_result.get('sources', [])
        
        verifier_score = validation.get('completeness_score', 0)
        is_main = validation.get('is_main_subject', False)
        reasoning = validation.get('reasoning', '')

        # Check if the answer is a refusal or rate limit message
        is_refusal = any(phrase in answer_lower for phrase in Verifier._REFUSAL_PHRASES)

        # Check if answer is substantive
        is_substantive = (
            bool(answer) and
            not is_refusal and
            len(answer) > 50 and  # More than a one-liner
            not answer.startswith("⚠️")
        )

        resolved_by = "corpus" if (is_substantive and (verifier_score >= 5 or (is_main and verifier_score >= 3))) else "insufficient"

        # Safety Override: If validation fell back to score-based heuristic (due to rate-limiting),
        # perform a direct keyword match check between the sub-question and matched sections
        # to prevent false positives for entirely out-of-syllabus terms (e.g. quantum computing)
        if resolved_by == "corpus" and "Calculated via score-based heuristic" in reasoning:
            keywords = Verifier._get_keywords(sub_question)
            if keywords:
                # Gather all words from retrieved section titles
                section_words = set()
                for s in sources:
                    section_title = (s.get('full_section') or s.get('title') or '').lower()
                    words = re.sub(r'[^\w\s]', ' ', section_title).split()
                    section_words.update(words)
                
                # Check overlap
                overlap = [kw for kw in keywords if kw in section_words]
                if not overlap:
                    resolved_by = "insufficient"
                    print(f"⚠️ Verifier [Heuristic Guard]: '{sub_question[:40]}...' matched high vector score but keywords {keywords} do not exist in section titles {list(section_words)[:10]} — forcing web fallback")

        if resolved_by == "corpus":
            print(f"✅ Verifier: '{sub_question[:40]}...' — PASSED (score={verifier_score}, main={is_main})")
        else:
            reason = "refusal" if is_refusal else f"score={verifier_score}, main={is_main}, substantive={is_substantive}"
            print(f"⚠️ Verifier: '{sub_question[:40]}...' — FAILED ({reason}) — flagged for web fallback")

        return SubQuestionResult(
            sub_question=sub_question,
            answer=answer if resolved_by == "corpus" else "",
            sources=sources if resolved_by == "corpus" else [],
            resolved_by=resolved_by,
            verifier_score=verifier_score,
            is_main_subject=is_main,
            validation=validation,
            raw_result=worker_result,
        )


# ─────────────────────────────────────────────────────────────
# Layer 4: Web Fallback Retrieval (Tavily)
# ─────────────────────────────────────────────────────────────

class WebFallbackRetriever:
    """
    Web search fallback using Tavily API.
    
    Only called for sub-questions that failed the Verifier.
    Results are clearly tagged as [Web Source], never silently mixed with corpus.
    
    Gracefully degrades if no Tavily API key is configured.
    """

    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY", "").strip()
        self.available = bool(self.api_key)
        if self.available:
            print("✅ Tavily web search: configured")
        else:
            print("⚠️ Tavily web search: no API key — web fallback disabled")

    def search(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        Search the web for a query using Tavily API.
        
        Returns:
            {
                "answer": str,           # Tavily's AI-generated answer
                "results": [             # Raw search results
                    {"title": str, "url": str, "content": str}
                ]
            }
        """
        if not self.available:
            return {"answer": "", "results": []}

        try:
            import requests
            
            response = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": max_results,
                    "include_answer": True,
                },
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", "")[:500],
                }
                for r in data.get("results", [])
            ]

            print(f"🌐 Tavily: Found {len(results)} web results for '{query[:40]}...'")
            return {
                "answer": data.get("answer", ""),
                "results": results,
            }

        except Exception as e:
            print(f"❌ Tavily search error: {e}")
            return {"answer": "", "results": []}

    async def search_multiple(self, queries: List[str]) -> List[Dict[str, Any]]:
        """Search multiple queries in parallel."""
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=min(len(queries), 3))
        
        tasks = [
            loop.run_in_executor(executor, self.search, query)
            for query in queries
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        processed = []
        for result in results:
            if isinstance(result, Exception):
                processed.append({"answer": "", "results": []})
            else:
                processed.append(result)
        
        executor.shutdown(wait=False)
        return processed


# ─────────────────────────────────────────────────────────────
# Layer 5: Synthesizer
# ─────────────────────────────────────────────────────────────

class Synthesizer:
    """
    Merges all verified sub-answers (corpus-sourced and web-sourced)
    into one coherent, cited report.
    
    Uses the existing UnifiedLLMClient for the final LLM call.
    Applies inline [Course Material] / [Web: URL] labels.
    """

    @staticmethod
    def merge(original_question: str, sub_results: List[SubQuestionResult],
              chatbot, model: str = None) -> str:
        """
        Synthesize all sub-question results into a single coherent answer.
        
        If there's only one sub-question that was resolved from corpus,
        returns the worker's answer directly (no extra LLM call needed).
        """
        # Single sub-question, corpus-resolved — return directly
        if len(sub_results) == 1 and sub_results[0].resolved_by == "corpus":
            answer = sub_results[0].answer
            if answer:
                print("📝 Synthesizer: Single corpus answer — returning directly")
                return answer

        # Build the synthesis context
        evidence_blocks = []
        for i, sr in enumerate(sub_results, 1):
            block = f"--- Sub-question {i}: {sr.sub_question} ---\n"
            
            if sr.resolved_by == "corpus" and sr.answer:
                block += f"[Source: Course Material]\n{sr.answer}\n"
            elif sr.resolved_by == "web" and sr.answer:
                block += f"[Source: Web Search]\n{sr.answer}\n"
                if sr.web_sources:
                    urls = ", ".join(ws.get("url", "") for ws in sr.web_sources[:3])
                    block += f"[Web URLs: {urls}]\n"
            else:
                block += "[Source: Insufficient — no reliable information found]\n"
            
            evidence_blocks.append(block)

        evidence_text = "\n".join(evidence_blocks)

        synthesis_prompt = f"""You are synthesizing a comprehensive research answer from multiple sub-question results.

ORIGINAL QUESTION: {original_question}

EVIDENCE FROM SUB-QUESTIONS:
{evidence_text}

SYNTHESIS RULES:
1. Merge all evidence into ONE coherent, well-structured answer.
2. Clearly label sources inline:
   - Information from course material: cite naturally (no special tag needed, this is the default)
   - Information from web searches: add [Web Source] tag before the relevant paragraph
3. If some sub-questions couldn't be answered, acknowledge the gap briefly.
4. Use a clear structure: introduction, main content organized by topic, conclusion if appropriate.
5. Do NOT invent information not present in the evidence.
6. Keep the answer thorough but focused — this is a deep research response.
7. If comparing topics, use a structured comparison (similarities, differences, etc.)

Write the synthesized answer:"""

        try:
            answer = chatbot._call_llm(
                prompt=synthesis_prompt,
                system_instruction=(
                    "You are a research synthesizer for an academic chatbot. "
                    "Merge evidence from multiple sources into one clear, well-cited answer. "
                    "Maintain academic tone. Label web-sourced content clearly."
                ),
                temperature=0.3,
                max_output_tokens=4096,
                low_latency=False,
            )

            if answer:
                print(f"📝 Synthesizer: Generated merged answer ({len(answer)} chars)")
                return answer.strip()

        except Exception as e:
            print(f"❌ Synthesizer LLM error: {e}")

        # Fallback: concatenate sub-answers
        print("⚠️ Synthesizer: LLM failed — falling back to concatenation")
        parts = []
        for sr in sub_results:
            if sr.answer:
                label = "[Course Material]" if sr.resolved_by == "corpus" else "[Web Source]"
                parts.append(f"**{sr.sub_question}** {label}\n\n{sr.answer}")
        
        return "\n\n---\n\n".join(parts) if parts else "Unable to generate a research answer. Please try rephrasing your question."


# ─────────────────────────────────────────────────────────────
# Main Engine — Ties All 5 Layers Together
# ─────────────────────────────────────────────────────────────

def _check_gap(sq, wr, chatbot):
    answer = (wr.get('answer') or '').strip()
    if not answer or len(answer) < 50:
        return sq, sq, True
    gap_prompt = (
        f"You are a research gap analyzer.\n"
        f"Sub-question: {sq}\n"
        f"Current answer: {answer[:2000]}\n\n"
        f"Identify ALL missing information in detail.\n"
        f"List specific search queries for each gap.\n"
        f"If answer is complete, reply with exactly: NO_GAPS"
    )
    gap_result = chatbot._call_llm(
        prompt=gap_prompt,
        system_instruction="Reply with 'NO_GAPS' if complete, or list missing information as search queries.",
        temperature=0.1,
        max_output_tokens=150,
    )
    if gap_result and "NO_GAPS" not in gap_result.upper():
        return sq, gap_result.strip(), True
    return sq, "", False

def _check_gap_iteration2(sq, wr, chatbot):
    answer = (wr.get('answer') or '').strip()
    gap_prompt2 = (
        f"Sub-question: {sq}\n"
        f"Updated answer: {answer[:500]}\n\n"
        f"Are there still gaps? Reply 'NO_GAPS' if complete, "
        f"or list remaining gaps."
    )
    gap_result2 = chatbot._call_llm(
        prompt=gap_prompt2,
        system_instruction="Reply 'NO_GAPS' if complete, or list remaining gaps.",
        temperature=0.1,
        max_output_tokens=150,
    )
    if gap_result2 and "NO_GAPS" not in gap_result2.upper():
        return gap_result2.strip(), True
    return "", False

class DeepResearchEngine:
    """
    Orchestrates the full 5-layer deep research pipeline.
    
    Usage:
        engine = DeepResearchEngine()
        result = await engine.run(question, chatbot, model="1")
    """

    def __init__(self):
        self.web_retriever = WebFallbackRetriever()

    async def run(self, question: str, chatbot, model: str = None,
                  use_history: bool = False, check_cancelled_cb = None) -> DeepResearchResult:
        """
        Execute the full deep research pipeline.
        
        Args:
            question: The user's question
            chatbot: The PDFChatbot instance (shared with /chat)
            model: Optional model ID for the synthesizer
            use_history: Whether to use conversation history
            
        Returns:
            DeepResearchResult with answer, sub_questions, layer_trace, sources, web_sources
        """
        start_time = time.perf_counter()
        from llm_client import AVAILABLE_MODELS  #👈
        time_budget = 245.0  # Safe internal budget comfortably below 300s (e.g. 245s)

        synthesis_attempts = 0
        critic_score = 0
        retry_triggered = False
        num_sub_questions = 0
        num_retrieval_ops = 0

        def log_stage_timing(stage_name, start_t):
            duration = time.perf_counter() - start_t
            print(f"[DeepResearch Timing]\n{stage_name}: {duration:.2f}s")
            return duration

        async def check_cancellation_and_budget(stage_name: str = ""):
            if check_cancelled_cb and await check_cancelled_cb():
                print(f"🛑 Client disconnected — aborting before {stage_name}.")
                return True
            elapsed = time.perf_counter() - start_time
            if elapsed > time_budget:
                print(f"⏱️ Deep Research budget exceeded ({elapsed:.2f}s > {time_budget}s) before {stage_name}.")
                raise TimeoutError(f"Deep research execution time budget exceeded ({elapsed:.2f}s > {time_budget}s) before {stage_name}.")
            return False

        if await check_cancellation_and_budget("Stage 1 (Orchestrator)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=[],
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        print(f"\n{'='*60}")
        print(f"🔬 Deep Research Engine — Starting pipeline")
        print(f"   Question: {question[:80]}...")
        print(f"{'='*60}\n")

        # ── Layer 1: Orchestrator ──
        print("━━━ Layer 1: Orchestrator ━━━")
        layer1_start = time.perf_counter()
        
        chatbot.switch_model(AVAILABLE_MODELS["1"])  # 👈  Gemini Flash
        print(f"🔄 Stage 1 model: {chatbot.model_config.display_name}")  # 👈 

        sub_questions = Orchestrator.plan(question, chatbot)
        num_sub_questions = len(sub_questions)
        log_stage_timing("Orchestrator Decision & Planning", layer1_start)
        
        if await check_cancellation_and_budget("Stage 1.5 (Query Analyzer)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Stage 1.5: Query Analyzer (DeepSeek) ──
        print("━━━ Stage 1.5: Query Analyzer ━━━")
        query_analyzer_start = time.perf_counter()
        chatbot.switch_model(AVAILABLE_MODELS["1"])  #DeepSeek
        print(f"🔄 Query Analyzer model: {chatbot.model_config.display_name}")

        expanded_queries = []
        for sq in sub_questions:
            query_prompt = (
                f"You are an expert query analyzer for academic research.\n\n"
                f"Original sub-question: {sq}\n\n"
                f"Generate 5-6 diverse search queries to find comprehensive information "
                f"about this topic from different angles:\n"
                f"- Core definition and characteristics\n"
                f"- Historical context and evolution\n"
                f"- Current state and developments\n"
                f"- Examples and case studies\n"
                f"- Advantages, challenges, and limitations\n"
                f"- Future trends and implications\n\n"
                f"Return ONLY a JSON array of strings. Example:\n"
                f'["query 1", "query 2", "query 3", "query 4", "query 5"]'
            )
            query_result = chatbot._call_llm(
                prompt=query_prompt,
                system_instruction="Return ONLY a JSON array of search query strings. No explanation.",
                temperature=0.1,
                max_output_tokens=300,
            )
            try:
                query_clean = (query_result or "").strip()
                query_clean = query_clean.replace("```json", "").replace("```", "").strip()
                queries = json.loads(query_clean)
                if isinstance(queries, list):
                    expanded_queries.extend(queries)
                    print(f"✅ Expanded '{sq[:40]}' into {len(queries)} queries")
                else:
                    expanded_queries.append(sq)
            except Exception as e:
                print(f"⚠️ Query expansion failed for '{sq[:40]}' — using original")
                expanded_queries.append(sq)

        # remove duplicates
        seen = set()
        expanded_queries = [q for q in expanded_queries if not (q in seen or seen.add(q))]
        num_retrieval_ops = len(expanded_queries)
        print(f"📝 Total expanded queries: {num_retrieval_ops}")
        log_stage_timing("Query Analyzer", query_analyzer_start)

        if await check_cancellation_and_budget("Layer 2 (Worker Agents)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Layer 2: Worker Agents ──
        print("━━━ Layer 2: Worker Agents ━━━")
        layer2_start = time.perf_counter()

        chatbot.switch_model(AVAILABLE_MODELS["1"])  # 👈
        print(f"🔄 Stage 2 model: {chatbot.model_config.display_name}")  # 👈

        worker_results = await WorkerAgent.execute_parallel(
            expanded_queries, chatbot, model="1", use_history=use_history
        )
        log_stage_timing(f"Worker Agents RAG Retrieval ({len(worker_results)} queries)", layer2_start)

        # 👇 Out of scope check — same threshold as /chat (top_score < 0.040)
        top_scores = []
        for wr in worker_results:
            vector_results = wr.get('vector_results', [])
            if vector_results:
                top_score = max((r.get('score', 0) if isinstance(r, dict) else getattr(r, 'score', 0))
                            for r in vector_results)
                top_scores.append(top_score)
            elif wr.get('is_cache_hit') and wr.get('top_score') is not None:
                # Cache hits don't carry vector_results (chatbot.py strips them before caching
                # since they hold non-serializable Pinecone objects), but the score itself is
                # cached separately in 'top_score' — use that instead of silently treating a
                # cached in-scope answer as a 0.0 score, which would falsely reject it here.
                top_scores.append(wr['top_score'])

        avg_top_score = sum(top_scores) / len(top_scores) if top_scores else 0
        print(f"📊 Average top retrieval score: {avg_top_score:.4f}")

        if avg_top_score < 0.040:
            print("⚠️ Low retrieval score — question out of syllabus")
            return DeepResearchResult(
                answer="⚠️ This question appears to be outside the scope of the IGNOU Media Literacy syllabus.\n\nI can help you with topics like:\n\n• Journalism (print, online, radio, television)\n• Digital Photography & Videography\n• Media Literacy & Media Ethics\n• Advertising & Public Relations\n• Social Media & Digital Communication\n• Visual Communication & Photojournalism\n• Communication Theory & Research Methods\n\nTry asking about one of these topics!",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[],
            )

        # ── Layer 3: Verifier ──
        print("━━━ Layer 3: Verifier ━━━")
        layer3_start = time.perf_counter()

        verified_results: List[SubQuestionResult] = []
        for sq, wr in zip(expanded_queries, worker_results):
            verified = Verifier.check(sq, wr)
            verified_results.append(verified)
        failed_indices = [i for i, vr in enumerate(verified_results) if vr.resolved_by == "insufficient"]
        passed_count = len(verified_results) - len(failed_indices)
        layer3_ms = (time.perf_counter() - layer3_start) * 1000
        print(f"   ⏱️ Layer 3 completed in {layer3_ms:.0f}ms — {passed_count} passed, {len(failed_indices)} need web fallback\n")
        log_stage_timing("Verifier", layer3_start)
        
        if await check_cancellation_and_budget("Stage 3.5 (Gap Analysis)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Stage 3.5: Gap Analysis — Iteration 1 (DeepSeek) ──
        print("━━━ Stage 3.5: Gap Analysis — Iteration 1 ━━━")
        gap_start = time.perf_counter()
        chatbot.switch_model(AVAILABLE_MODELS["1"])  
        print(f"🔄 Stage 3.5 model: {chatbot.model_config.display_name}")

        gaps_found = []  # sub_questions that have gaps
        gap_queries = []  # specific gap queries to re-search

        # Execute gap verification in parallel
        gap_tasks = []
        loop = asyncio.get_event_loop()
        gap_executor = ThreadPoolExecutor(max_workers=min(len(expanded_queries), 6))
        
        for sq, wr in zip(expanded_queries, worker_results):
            gap_tasks.append(
                loop.run_in_executor(gap_executor, _check_gap, sq, wr, chatbot)
            )
            
        gap_results = await asyncio.gather(*gap_tasks)
        gap_executor.shutdown(wait=False)
        
        for sq, gap_q, has_gap in gap_results:
            if has_gap:
                gaps_found.append(sq)
                gap_queries.append(gap_q)
                print(f"🔍 Gap found for: '{sq[:50]}'")
            else:
                print(f"✅ No gaps for: '{sq[:50]}'")

        if await check_cancellation_and_budget("Stage 2b (RAG Re-fetch)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── RAG Re-fetch for gaps (Iteration 2) ──
        if gap_queries:
            print(f"\n━━━ Stage 2b: RAG Re-fetch for gaps ━━━")
            chatbot.switch_model(AVAILABLE_MODELS["1"])  # Gemini Flash
            print(f"🔄 Model: {chatbot.model_config.display_name}")
            gap_worker_results = await WorkerAgent.execute_parallel(
                gap_queries, chatbot, model="1", use_history=False
            )
            # merge gap results back into worker_results
            for i, (sq, wr) in enumerate(zip(expanded_queries, worker_results)):
                if sq in gaps_found:
                    for gq, gwr in zip(gap_queries, gap_worker_results):
                        new_info = gwr.get('answer', '')
                        if new_info and len(new_info) > 50:
                            existing = wr.get('answer', '')
                            wr['answer'] = existing + "\n\n" + new_info

            if await check_cancellation_and_budget("Stage 3.5 Iteration 2 (Gap Analysis)"):
                return DeepResearchResult(
                    answer="⚠️ Research aborted due to client disconnection.",
                    sub_questions=sub_questions,
                    layer_trace=[],
                    sources=[],
                    web_sources=[]
                )

            # ── Gap Analysis Iteration 2 (DeepSeek) ──
            print(f"\n━━━ Stage 3.5: Gap Analysis — Iteration 2 ━━━")
            chatbot.switch_model(AVAILABLE_MODELS["1"])
            print(f"🔄 Model: {chatbot.model_config.display_name}")
            remaining_gaps = []
            
            gap_tasks2 = []
            gap_executor2 = ThreadPoolExecutor(max_workers=min(len(expanded_queries), 6))
            indexed_queries = []
            
            for sq, wr in zip(expanded_queries, worker_results):
                if sq in gaps_found:
                    gap_tasks2.append(
                        loop.run_in_executor(gap_executor2, _check_gap_iteration2, sq, wr, chatbot)
                    )
                    indexed_queries.append(sq)
                    
            gap_results2 = await asyncio.gather(*gap_tasks2)
            gap_executor2.shutdown(wait=False)
            
            for sq, (gap_res, has_gap) in zip(indexed_queries, gap_results2):
                if has_gap:
                    remaining_gaps.append(gap_res)
                    print(f"⚠️ Still has gaps: '{sq[:50]}'")
                else:
                    print(f"✅ Gaps resolved: '{sq[:50]}'")
        else:
            remaining_gaps = []
            print("✅ No gaps found — skipping Iteration 2\n")

        log_stage_timing("Gap Analysis (Iterations 1 & 2)", gap_start)

        if await check_cancellation_and_budget("Layer 4 (Web Search)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Layer 4: Web Fallback Retrieval ──
        # ── Layer 4: Web Search (Perplexity) ──
        print("━━━ Layer 4: Web Search (Perplexity) ━━━")
        layer4_start = time.perf_counter()
        chatbot.switch_model(AVAILABLE_MODELS["1"])  #Gemini
        print(f"🔄 Stage 4 model: {chatbot.model_config.display_name}")

        web_answers = {}  # query → answer
        web_sources_all = []

        # queries to search — remaining gaps + low score answers
        web_queries = list(remaining_gaps) if remaining_gaps else []
        for sq, wr in zip(expanded_queries, worker_results):
            validation = wr.get('validation', {})
            score = validation.get('completeness_score', 0)
            if score < 5 and sq not in web_queries:
                web_queries.append(sq)

        if web_queries:
            for query in web_queries:
                try:
                    perplexity_result = chatbot._call_llm(
                        prompt=query,
                        system_instruction="You are a web search assistant. Provide accurate, cited information about Media Literacy topics.",
                        temperature=0.1,
                        max_output_tokens=500,
                    )
                    if perplexity_result:
                        web_answers[query] = perplexity_result
                        web_sources_all.append({"title": query, "url": "", "content": perplexity_result})
                        print(f"   🌐 Web result found for: '{query[:50]}'")
                except Exception as e:
                    print(f"   ❌ Web search failed for '{query[:50]}': {e}")
        else:
            print(f"   ✅ No web search needed")

        log_stage_timing("Web Search / Fallback Retrieval", layer4_start)

        if await check_cancellation_and_budget("Stage 5 (Contradiction Worker)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Stage 5: Contradiction Worker (Gemini Flash) ──
        print("━━━ Stage 5: Contradiction Worker ━━━")
        stage5_start = time.perf_counter()
        chatbot.switch_model(AVAILABLE_MODELS["1"])  # Gemini Flash
        print(f"🔄 Stage 5 model: {chatbot.model_config.display_name}")

        # combine all answers
        all_answers = []
        for sq, wr in zip(expanded_queries, worker_results):
            answer = wr.get('answer', '')
            if answer:
                all_answers.append(f"Q: {sq}\nA: {answer[:500]}")

        for query, answer in web_answers.items():
            all_answers.append(f"Q: {query}\nA: {answer} [Web Source]")

        combined_content = "\n\n---\n\n".join(all_answers)

        contradiction_prompt = (
            f"You are a contradiction resolver.\n\n"
            f"Review these research findings and identify any contradictions:\n\n"
            f"{combined_content[:3000]}\n\n"
            f"If contradictions exist, resolve them by keeping the most accurate information.\n"
            f"Return the resolved, contradiction-free summary."
        )

        resolved_content = chatbot._call_llm(
            prompt=contradiction_prompt,
            system_instruction="Identify and resolve contradictions. Return detailed, accurate summary.",            temperature=0.1,
            max_output_tokens=3000,
        )

        if resolved_content:
            print(f"✅ Contradictions resolved")
        else:
            resolved_content = combined_content
            print(f"⚠️ Contradiction resolution failed — using original content")

        log_stage_timing("Contradiction Worker", stage5_start)

        if await check_cancellation_and_budget("Stage 6 (Synthesizer)"):
            return DeepResearchResult(
                answer="⚠️ Research aborted due to client disconnection.",
                sub_questions=sub_questions,
                layer_trace=[],
                sources=[],
                web_sources=[]
            )

        # ── Stage 6: Synthesizer + Critic (Gemini Pro) ──
        print("━━━ Stage 6: Synthesizer + Critic ━━━")
        stage6_start = time.perf_counter()
        chatbot.switch_model(AVAILABLE_MODELS["2"])  # Gemini Pro
        print(f"🔄 Stage 6 model: {chatbot.model_config.display_name}")

        MAX_RETRIES = 1
        SCORE_THRESHOLD = 8
        best_answer = ""
        best_score = 0

        for attempt in range(MAX_RETRIES + 1):
            synthesis_attempts = attempt + 1
            elapsed_before_attempt = time.perf_counter() - start_time
            remaining_budget = time_budget - elapsed_before_attempt
            if await check_cancellation_and_budget(f"Stage 6 synthesis attempt {attempt + 1}"):
                print(f"🛑 Client disconnected or budget exceeded — aborting Stage 6 synthesis attempt {attempt + 1}.")
                break
            print(f"🔄 Synthesis attempt {attempt + 1}/{MAX_RETRIES + 1} (budget remaining: {remaining_budget:.0f}s)")
            attempt_start = time.perf_counter()
            
            # Synthesize
            synthesis_prompt = (
                f"You are an expert academic researcher writing a comprehensive deep research report "
                f"for IGNOU Media Literacy students.\n\n"
                f"Original question: {question}\n\n"
                f"Research findings:\n{resolved_content[:10000]}\n\n"
                f"Write an EXHAUSTIVE, COMPREHENSIVE research report. "
                f"Every question deserves deep, thorough coverage.\n\n"
                f"Your report MUST include:\n"
                f"1. Executive Summary (2-3 paragraphs)\n"
                f"2. Introduction — background, context, significance (3-4 paragraphs)\n"
                f"3. Multiple detailed sections with sub-sections — cover ALL aspects\n"
                f"4. Real world examples and case studies for every major point\n"
                f"5. Historical context and evolution\n"
                f"6. Current state and developments\n"
                f"7. Critical analysis — advantages, disadvantages, challenges\n"
                f"8. Future implications and trends\n"
                f"9. Conclusion (2-3 paragraphs)\n"
                f"10. Complete bibliography with all sources\n\n"
                f"IMPORTANT RULES:\n"
                f"- Minimum 1500 words — no exceptions\n"
                f"- Every section must have multiple paragraphs\n"
                f"- Include specific facts, statistics, and data\n"
                f"- Label web sources as [Web Source]\n"
                f"- Write in academic style\n"
                f"- Be exhaustive — leave nothing out\n"
            )
            
            chatbot.switch_model(AVAILABLE_MODELS["2"])  # Gemini Pro
            final_answer = chatbot._call_llm(
                prompt=synthesis_prompt,
                system_instruction="Generate a comprehensive academic answer. Be thorough and well-structured.",
                temperature=0.3,
                # Pro's thinking now has a fixed 4096-token cap (see llm_client.py) instead of
                # eating an unbounded share of this budget, but the 10-section "exhaustive,
                # minimum 1500 words" report itself still needs real headroom on top of that —
                # bumped from 16000 so thinking + a full-length visible report both fit.
                max_output_tokens=24000,
                timeout=150,
            )
            
            if not final_answer:
                print(f"⚠️ Synthesis failed on attempt {attempt + 1}")
                continue
            
            # Critic evaluation
            # NOTE: pass the FULL answer, not a slice. Truncating this to a fixed
            # character count (previously [:2000], ~300 words) meant the critic was
            # judging a chopped-off excerpt of every multi-thousand-word report —
            # it would see the excerpt end mid-sentence and mark the (actually
            # complete) report as "incomplete" / "cuts off abruptly" every time,
            # which is why the 8/10 threshold was effectively unreachable and every
            # request burned all 6 retries. Flash's context window comfortably
            # fits a ~3-4k word report as input.
            critic_prompt = (
                f"You are a research quality critic.\n\n"
                f"Original question: {question}\n\n"
                f"Generated answer:\n{final_answer}\n\n"
                f"Score this answer from 1-10 based on:\n"
                f"- Completeness (covers all aspects)\n"
                f"- Accuracy (factually correct)\n"
                f"- Coherence (well structured)\n"
                f"- Relevance (answers the question)\n\n"
                f"Reply with ONLY this JSON:\n"
                f'{{"score": <1-10>, "feedback": "<what is missing or wrong>"}}'
            )
            
            critic_result = chatbot._call_fast_llm(
                prompt=critic_prompt,
                system_instruction='Reply with ONLY JSON: {"score": <1-10>, "feedback": "<feedback>"}',
                temperature=0.0,
                max_output_tokens=150,
            )
            
            # parse critic score
            print(f"DEBUG critic raw: '{critic_result}'")
            try:
                critic_clean = (critic_result or "").strip()
                critic_clean = critic_clean.replace("```json", "").replace("```", "").strip()
                critic_data = json.loads(critic_clean)
                score = int(critic_data.get("score", 0))
                feedback = critic_data.get("feedback", "")
                print(f"📊 Critic score: {score}/10 | Feedback: {feedback}")
            except Exception as e:
                score = 5
                feedback = "Could not parse critic response"
                print(f"⚠️ Could not parse critic score — using default 5/10")
            
            # keep best answer
            if score > best_score:
                best_score = score
                best_answer = final_answer
            critic_score = best_score
            log_stage_timing(f"Synthesis + Critic (attempt {attempt + 1})", attempt_start)
            
            # check if threshold reached
            if score >= SCORE_THRESHOLD:
                print(f"✅ Score {score} >= threshold {SCORE_THRESHOLD} — stopping")
                break
            
            if attempt < MAX_RETRIES:
                retry_triggered = True
                remaining = time_budget - (time.perf_counter() - start_time)
                print(f"⚠️ Score {score} < {SCORE_THRESHOLD} — re-fetching content... (budget remaining: {remaining:.0f}s)")
                if remaining < 60:
                    print(f"⏱️ Insufficient budget ({remaining:.0f}s) for retry — using best result so far.")
                    break
                
                # parallel re-fetch — RAG + Web simultaneously
                chatbot.switch_model(AVAILABLE_MODELS["1"])  # Gemini Flash for re-fetch
                refetch_results = await WorkerAgent.execute_parallel(
                    sub_questions, chatbot, model="1", use_history=False
                )
                
                # re-run web search for remaining gaps
                if web_queries:
                    chatbot.switch_model(AVAILABLE_MODELS["1"])  # Perplexity
                    for query in web_queries[:5]:
                        try:
                            new_web = chatbot._call_llm(
                                prompt=query,
                                system_instruction="Provide accurate cited information.",
                                temperature=0.1,
                                max_output_tokens=500,
                            )
                            if new_web:
                                web_answers[query] = new_web
                        except Exception as e:
                            print(f"❌ Web re-fetch failed: {e}")
                
                # rebuild resolved content
                all_answers = []
                for sq, wr in zip(expanded_queries, refetch_results):
                    answer = wr.get('answer', '')
                    if answer:
                        all_answers.append(f"Q: {sq}\nA: {answer[:500]}")
                for query, answer in web_answers.items():
                    all_answers.append(f"Q: {query}\nA: {answer} [Web Source]")
                resolved_content = "\n\n---\n\n".join(all_answers)

        log_stage_timing("Stage 6: Synthesizer + Critic", stage6_start)

        final_answer = best_answer or "Unable to generate a satisfactory answer."
        # ── Build Response ──
        total_elapsed = time.perf_counter() - start_time
        total_ms = total_elapsed * 1000

        # collect corpus sources
        all_corpus_sources = []
        for wr in worker_results:
            sources = wr.get('sources', [])
            if sources:
                all_corpus_sources.extend(sources)

        # build layer trace
        layer_trace = []
        for sq, wr in zip(expanded_queries, worker_results):
            validation = wr.get('validation', {})
            answer = wr.get('answer', '')
            layer_trace.append({
                "sub_question": sq,
                "resolved_by": "corpus" if (answer and len(answer) > 50) else "insufficient",
                "verifier_score": validation.get('completeness_score', 0),
                "is_main_subject": validation.get('is_main_subject', False),
                "sources_count": len(wr.get('sources', [])),
                "web_sources_count": len(web_sources_all),
                "critic_score": best_score,
            })

        print(f"{'='*60}")
        print(f"🔬 Deep Research Engine — Pipeline complete")
        print(f"   Total time: {total_ms:.0f}ms")
        print(f"   Sub-questions: {num_sub_questions}")
        print(f"   Retrieval operations: {num_retrieval_ops}")
        print(f"   Synthesis attempts: {synthesis_attempts}")
        print(f"   Retry triggered: {retry_triggered}")
        print(f"   Final critic score: {critic_score}/10")
        print(f"{'='*60}\n")

        return DeepResearchResult(
            answer=final_answer,
            sub_questions=sub_questions,
            layer_trace=layer_trace,
            sources=all_corpus_sources,
            web_sources=web_sources_all,
        )

    @staticmethod
    def _build_web_answer(web_sources: List[Dict[str, Any]]) -> str:
        """Build a simple answer from web search results when Tavily doesn't provide one."""
        if not web_sources:
            return ""
        parts = []
        for s in web_sources[:3]:
            content = s.get("content", "").strip()
            if content:
                parts.append(content)
        return "\n\n".join(parts)
