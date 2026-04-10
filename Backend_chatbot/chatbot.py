from google import genai
from google.genai import types
from typing import List, Dict, Any
import os
import json
import re
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever

load_dotenv()

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

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY missing")

        self.client = genai.Client(api_key=api_key)

        # Stable model
        self.model_name = "gemini-2.5-flash"

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

        print("🔍 Analyzing question and retrieving context...")

        is_quote_query = False
        search_query = question
        extracted_quote = ""
        extracted_prompt = ""

        if "The user has highlighted the following specific text:" in question:
            is_quote_query = True

            prompt_match = re.search(r'User\'s prompt: "(.*?)"', question)
            quote_match = re.search(r'"""(.*?)"""', question, re.DOTALL)

            extracted_prompt = prompt_match.group(1).strip() if prompt_match else ""
            extracted_quote = quote_match.group(1).strip() if quote_match else ""

        elif question.strip().startswith(">"):

            is_quote_query = True

            if '"' in question:
                parts = question.rsplit('"', 1)
                extracted_quote = parts[0].replace('>', '').replace('"', '').strip()
                extracted_prompt = parts[1].strip()
            else:
                parts = question.split('\n', 1)
                extracted_quote = parts[0].replace('>', '').strip()
                extracted_prompt = parts[1].strip() if len(parts) > 1 else "Explain this."

            if not extracted_prompt:
                extracted_prompt = "Explain this quote."

        if is_quote_query:

            if len(extracted_prompt) > 5:
                search_query = extracted_prompt
            else:
                search_query = extracted_quote[:100]

            question = f"""The student highlighted this text:

"{extracted_quote}"

Their question is:

"{extracted_prompt}"

Focus ONLY on explaining the highlighted text."""

        try:

            retrieved_context = self.retriever.retrieve(search_query)

            if not retrieved_context.vector_results:
                return {
                    'answer': OUT_OF_SCOPE_MESSAGE,
                    'sources': [],
                    'vector_results': [],
                    'graph_context': {},
                    'expanded_queries': []
                }

            top_score = max((r.score for r in retrieved_context.vector_results), default=0)

            if top_score < 0.55 and not is_quote_query:
                return {
                    'answer': OUT_OF_SCOPE_MESSAGE,
                    'sources': [],
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries
                }

            if is_quote_query:

                validation_result = {
                    "completeness_score": 10,
                    "can_fully_answer": True,
                    "topic_directly_discussed": True,
                    "_validation_error": False
                }

            else:

                validation_result = self._validate_content_sufficiency(question, retrieved_context)

            prompt = self._build_synthesis_prompt(question, retrieved_context, validation_result)

            print("🤖 Generating answer...")

            answer = self._call_gemini(
                prompt=prompt,
                system_instruction=self._system_prompt,
                temperature=0.3
            )

            if use_history:

                self.conversation_history.append({
                    'question': question,
                    'answer': answer
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

            print(e)

            return {
                'answer': str(e),
                'sources': [],
                'vector_results': [],
                'graph_context': {},
                'expanded_queries': []
            }

    def _validate_content_sufficiency(self, question: str, retrieved_context: Any) -> Dict[str, Any]:

        validation_prompt = f"""
QUESTION:
{question}

CONTEXT:
{retrieved_context.combined_context[:2000]}

Return JSON:
{{"completeness_score": <1-10>, "can_fully_answer": <true/false>, "topic_directly_discussed": <true/false>, "reasoning": ""}}
"""

        try:

            validation_text = self._call_gemini(
                prompt=validation_prompt,
                system_instruction="Return ONLY JSON.",
                temperature=0.1,
                max_output_tokens=200
            )

            validation_result = self._parse_validation_json(validation_text)

            validation_result['_validation_error'] = False

            return validation_result

        except Exception:

            return {
                "completeness_score": 0,
                "can_fully_answer": True,
                "topic_directly_discussed": True,
                "_validation_error": True
            }

    def _parse_validation_json(self, text: str) -> dict:

        if not text:
            return None

        text = text.strip()

        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\n?\s*```\s*$', '', text)

        try:

            result = json.loads(text)

            if 'completeness_score' in result:
                return result

        except json.JSONDecodeError:
            pass

        json_match = re.search(r'\{.*?\}', text, re.DOTALL)

        if json_match:

            try:

                result = json.loads(json_match.group(0))

                if 'completeness_score' in result:
                    return result

            except json.JSONDecodeError:
                pass

        score_match = re.search(r'completeness_score["\s:]+(\d+)', text)

        if score_match:

            score = int(score_match.group(1))

            return {
                "completeness_score": score,
                "can_fully_answer": score >= 7,
                "topic_directly_discussed": True
            }

        return None

    def _get_system_prompt(self):

        return """You are Digilab, an expert academic assistant for IGNOU's Mass Communication and Journalism programme.

Write exam-ready answers based ONLY on provided material.

Structure answers clearly with explanation and key points."""

    def _build_synthesis_prompt(self, question, retrieved_context, validation):

        return f"""
QUESTION:
{question}

COURSE MATERIAL:
{retrieved_context.combined_context}

Write a clear exam-ready answer.
"""

    def explain_selection(self, selected_text, full_bot_message):

        prompt = f"""
Full answer:
{full_bot_message}

Selected text:
{selected_text}

Explain the selected text clearly.
"""

        explanation = self._call_gemini(prompt)

        return {"explanation": explanation}

    def clear_history(self):

        self.conversation_history = []