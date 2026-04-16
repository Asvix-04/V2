"""
Follow-up Question Generator for Chatbot Responses.

Generates context-aware follow-up questions grounded in the user's
question, the assistant response, and recent conversation history.
"""

import json
import re
from typing import List, Dict, Any, Optional
from llm_client import UnifiedLLMClient, ModelConfig, AVAILABLE_MODELS


class FollowUpGenerator:
    """Generates intelligent follow-up questions for chatbot responses."""

    def __init__(self, llm_client: Optional[UnifiedLLMClient] = None):
        """
        Initialize the follow-up question generator.
        
        Args:
            llm_client: UnifiedLLMClient instance. If None, creates default client.
        """
        if llm_client is None:
            model_config = AVAILABLE_MODELS["1"]  # Default to Gemini Flash
            self.llm_client = UnifiedLLMClient(model_config)
        else:
            self.llm_client = llm_client

    def generate(
        self,
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        max_retries: int = 2
    ) -> Dict[str, List[str]]:
        """
        Generate follow-up questions based on the assistant's response.

        Args:
            assistant_response: The chatbot's response to analyze
            user_question: The original user question that prompted the response
            conversation_history: Optional list of previous messages with 'role' and 'content'
            max_retries: Number of retry attempts if LLM parsing fails

        Returns:
            Dictionary with keys:
            {
                "type_2_context_aware": ["question1", "question2"],
                "status": "success" | "fallback"
            }
        """
        # Try LLM-based generation first
        for attempt in range(max_retries):
            try:
                result = self._generate_with_llm(
                    assistant_response,
                    user_question,
                    conversation_history
                )
                result["type_2_context_aware"] = self._filter_context_grounded_questions(
                    result.get("type_2_context_aware", []),
                    assistant_response,
                    user_question,
                    conversation_history
                )
                if self._validate_output(result):
                    result["status"] = "success"
                    return result
            except Exception as e:
                if attempt < max_retries - 1:
                    continue
                # Fall through to fallback on final attempt
                break

        # Fallback to pattern-based generation if LLM fails
        fallback = self._generate_with_fallback(
            assistant_response,
            user_question,
            conversation_history
        )
        fallback["type_2_context_aware"] = self._filter_context_grounded_questions(
            fallback.get("type_2_context_aware", []),
            assistant_response,
            user_question,
            conversation_history
        )

        # Ensure there is at least one context-grounded follow-up.
        if not fallback["type_2_context_aware"]:
            concepts = self._extract_key_concepts(assistant_response)
            if concepts:
                fallback["type_2_context_aware"] = [
                    f"Can you explain more about {concepts[0]} based on what you just shared?"
                ]
            else:
                fallback["type_2_context_aware"] = [
                    "Can you explain one key point from your previous answer in more detail?"
                ]

        return fallback

    def _generate_with_llm(
        self,
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, List[str]]:
        """
        Generate follow-up questions using LLM.

        Args:
            assistant_response: The chatbot's response
            user_question: The original user question
            conversation_history: Optional conversation context

        Returns:
            Dictionary with type_2_context_aware questions
        """
        # Build context from conversation history
        conversation_context = ""
        if conversation_history:
            recent_messages = conversation_history[-4:] if len(conversation_history) > 4 else conversation_history
            conversation_context = "Recent conversation:\n"
            for msg in recent_messages:
                role = msg.get("role", "").capitalize()
                content = msg.get("content", "")[:200]  # Truncate for brevity
                conversation_context += f"{role}: {content}\n"
            conversation_context += "\n---\n\n"

        prompt = f"""You are a helpful educational chatbot assistant. Based on the conversation and response below, generate follow-up questions for the user.

{conversation_context}Original User Question: {user_question}

Assistant Response: {assistant_response}

Generate 2-3 context-aware follow-up questions in JSON format.

Context-Aware Questions:
- Questions that reference and build on what was already discussed
- Must explicitly include one or more concrete terms from the assistant response
- Must remain answerable by the same course context (no out-of-scope jumps)
- Format examples: "How does this connect to X?", "Why is X important here?", "Can you expand on X?"

Return ONLY valid JSON (no markdown, no extras):
{{
    "type_2_context_aware": ["question1", "question2", "question3"]
}}

Requirements:
- Every question must be grounded in the provided response/context
- All questions should be natural and conversational
- Avoid questions already answered in the response
- Generate in English only"""

        response_text = self.llm_client.generate(prompt)
        result = self._parse_json_response(response_text)
        return result

    def _generate_with_fallback(
        self,
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, List[str]]:
        """
        Fallback pattern-based question generation when LLM fails.

        Extracts key nouns/concepts and builds context-aware questions from them.
        """
        concepts = self._extract_key_concepts(assistant_response)
        type_2 = self._build_context_questions(
            concepts,
            assistant_response,
            user_question,
            conversation_history
        )
        return {
            "type_2_context_aware": type_2[:3],
            "status": "fallback"
        }

    def _extract_key_concepts(self, text: str) -> List[str]:
        """
        Extract key noun phrases and concepts from text.
        
        Simple pattern-based extraction (can be enhanced with NLP).
        """
        # Remove common filler words
        stopwords = {
            'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
            'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'been', 'be', 'have', 'has', 'had',
            'do', 'does', 'did', 'can', 'could', 'would', 'should', 'may',
            'might', 'must', 'will', 'shall', 'such', 'as', 'it'
        }
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        concepts = []
        
        for sentence in sentences[:5]:  # Analyze first 5 sentences
            # Extract capitalized phrases (proper nouns) and technical terms
            words = sentence.split()
            for i, word in enumerate(words):
                word_clean = re.sub(r'[^\w\s-]', '', word).lower()
                
                # Look for capitalized words or multi-word phrases
                if word[0].isupper() and word_clean not in stopwords and len(word_clean) > 3:
                    # Check if part of a phrase
                    if i + 1 < len(words) and words[i + 1][0].isupper():
                        phrase = f"{word} {words[i + 1]}"
                        concepts.append(phrase[:50])
                    else:
                        concepts.append(word_clean[:50])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_concepts = []
        for c in concepts:
            if c.lower() not in seen and len(c) > 3:
                seen.add(c.lower())
                unique_concepts.append(c)

        if unique_concepts:
            return unique_concepts[:5]  # Return top 5 concepts

        # Fallback: derive concepts from meaningful lowercase tokens.
        tokens = re.findall(r"\b[a-zA-Z][a-zA-Z-]{3,}\b", text.lower())
        for token in tokens:
            if token not in stopwords and token not in seen:
                seen.add(token)
                unique_concepts.append(token)
        
        return unique_concepts[:5]  # Return top 5 concepts

    def _build_context_questions(
        self,
        concepts: List[str],
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> List[str]:
        """Build Type 2 (context-aware) questions referencing the conversation."""
        questions = []
        
        if not concepts:
            return questions
        
        primary_concept = concepts[0]
        
        # Extract domain/context from user question
        context_keywords = self._extract_context_keywords(user_question)
        
        # Pattern 1: "Why is this [concept] important in [domain]?"
        if context_keywords:
            domain = context_keywords[0]
            q1 = f"Why is this {primary_concept} important in {domain}?"
            questions.append(q1)
        else:
            q1 = f"Why is this {primary_concept} significant in this context?"
            questions.append(q1)
        
        # Pattern 2: "How does that concept connect to [previously mentioned]?"
        if len(concepts) > 1:
            other_concept = concepts[1]
            q2 = f"How does that {primary_concept} connect to {other_concept}?"
            questions.append(q2)
        else:
            q2 = f"What are the implications of this {primary_concept} for future developments?"
            questions.append(q2)
        
        return questions[:2]

    def _extract_context_keywords(self, question: str) -> List[str]:
        """Extract domain/context keywords from user question."""
        keywords = []
        words = [re.sub(r'[^\w-]', '', w) for w in question.lower().split()]
        words = [w for w in words if w]
        
        # Look for domain-specific keywords (simplified)
        domain_keywords = {
            'media', 'journalism', 'broadcasting', 'television', 'radio',
            'advertising', 'photography', 'videography', 'communication',
            'digital', 'social', 'ethics', 'literacy', 'public relations'
        }
        
        # Match both single-word and two-word domain phrases.
        candidates = list(words)
        candidates.extend([f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1)])

        for candidate in candidates:
            if candidate in domain_keywords:
                keywords.append(candidate)
        
        return keywords[:1]

    def _filter_context_grounded_questions(
        self,
        questions: List[str],
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> List[str]:
        """Keep only follow-ups that are grounded in the current context."""
        grounded = []
        seen = set()
        for q in questions:
            cleaned = (q or "").strip()
            if not cleaned:
                continue
            if not cleaned.endswith("?"):
                cleaned = f"{cleaned}?"
            key = cleaned.lower()
            if key in seen:
                continue
            if self._is_context_grounded(cleaned, assistant_response, user_question, conversation_history):
                seen.add(key)
                grounded.append(cleaned)
        return grounded[:3]

    def _is_context_grounded(
        self,
        question: str,
        assistant_response: str,
        user_question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> bool:
        """A question is grounded if it overlaps with key context terms."""
        stopwords = {
            'what', 'is', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
            'with', 'by', 'how', 'does', 'do', 'are', 'me', 'my', 'it', 'its', 'tell', 'can', 'you',
            'about', 'this', 'that', 'why', 'when', 'where', 'which', 'who', 'whom', 'was', 'were',
            'been', 'being', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
            'shall', 'must', 'need', 'not', 'from', 'into', 'than', 'then', 'also', 'just', 'only'
        }

        context_parts = [assistant_response or "", user_question or ""]
        if conversation_history:
            context_parts.extend([msg.get("content", "") for msg in conversation_history[-4:]])
        context_text = " ".join(context_parts).lower()

        context_terms = {
            token for token in re.findall(r"\b[a-zA-Z][a-zA-Z-]{3,}\b", context_text)
            if token not in stopwords
        }
        if not context_terms:
            return False

        question_terms = {
            token for token in re.findall(r"\b[a-zA-Z][a-zA-Z-]{3,}\b", question.lower())
            if token not in stopwords
        }
        if not question_terms:
            return False

        overlap = question_terms.intersection(context_terms)
        return len(overlap) >= 1

    def _parse_json_response(self, response_text: str) -> Dict[str, List[str]]:
        """
        Extract and parse JSON from LLM response.

        Handles cases where the LLM wraps JSON in markdown code blocks.
        """
        # Strip markdown code fences if present
        json_pattern = r'```(?:json)?\s*(\{.*?\})\s*```'
        match = re.search(json_pattern, response_text, re.DOTALL)
        if match:
            response_text = match.group(1)

        # Locate the outermost JSON object
        json_start = response_text.find('{')
        if json_start != -1:
            brace_count = 0
            json_end = -1
            for i in range(json_start, len(response_text)):
                if response_text[i] == '{':
                    brace_count += 1
                elif response_text[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_end = i + 1
                        break

            if json_end != -1:
                parsed = json.loads(response_text[json_start:json_end])
                if "type_2_context_aware" in parsed and isinstance(parsed["type_2_context_aware"], list):
                    return {"type_2_context_aware": parsed["type_2_context_aware"]}

        raise ValueError("Could not parse JSON from LLM response")

    def _validate_output(self, output: Dict[str, Any]) -> bool:
        """Validate that output has the required structure and content."""
        if not isinstance(output, dict):
            return False
        if "type_2_context_aware" not in output:
            return False
        if not isinstance(output["type_2_context_aware"], list):
            return False
        if len(output["type_2_context_aware"]) < 1:
            return False
        for q in output["type_2_context_aware"]:
            if not isinstance(q, str) or len(q.strip()) < 5:
                return False
        return True


def generate_follow_up_questions(
    assistant_response: str,
    user_question: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    llm_client: Optional[UnifiedLLMClient] = None
) -> Dict[str, List[str]]:
    """
    Convenience function to generate context-aware follow-up questions.

    Args:
        assistant_response: The chatbot's response
        user_question: The original user's question
        conversation_history: Optional previous conversation messages
        llm_client: Optional LLM client to reuse

    Returns:
        Dictionary with ``type_2_context_aware`` (list of questions) and ``status``.

    Example::

        result = generate_follow_up_questions(
            assistant_response="Radio broadcasting emerged in the 1920s...",
            user_question="When did radio broadcasting start?",
            conversation_history=[...]
        )
        print(result["type_2_context_aware"])  # List of context-aware questions
    """
    generator = FollowUpGenerator(llm_client)
    return generator.generate(
        assistant_response,
        user_question,
        conversation_history
    )
