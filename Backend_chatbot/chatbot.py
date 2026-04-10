from groq import Groq
from typing import List, Dict, Any
import os
import json
import re
from dotenv import load_dotenv
from hybrid_retriever import HybridRetriever

load_dotenv()

class PDFChatbot:
    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not found in environment variables")
        
        try:
            self.groq_client = Groq(api_key=api_key)
        except TypeError:
            try:
                self.groq_client = Groq(
                    api_key=api_key,
                    timeout=30.0,
                    max_retries=2,
                )
            except:
                self.groq_client = Groq(api_key=api_key)
        
        self.retriever = HybridRetriever()
        self.conversation_history = []
    
    def ask_question(self, question: str, use_history: bool = True) -> Dict[str, Any]:
        """Process question with content sufficiency validation"""
        print("🔍 Analyzing question and retrieving context...")
        
        try:
            # Retrieve enhanced context
            retrieved_context = self.retriever.retrieve(question)
            
            # CRITICAL: Check if we actually got relevant results
            if not retrieved_context.vector_results:
                return {
                    'answer': "I couldn't find relevant information in the course materials to answer your question. The available content focuses on digital media, photography, and media literacy topics.",
                    'sources': [],
                    'vector_results': [],
                    'graph_context': {},
                    'expanded_queries': []
                }
            
            # NEW: Content Sufficiency Validation
            print("🔬 Validating content sufficiency...")
            validation_result = self._validate_content_sufficiency(question, retrieved_context)
            
            # Check completeness rating
            if validation_result['completeness_score'] < 7:
                print(f"⚠️ Content insufficient (score: {validation_result['completeness_score']}/10)")
                # Return honest limitation response
                return {
                    'answer': self._generate_limitation_response(question, validation_result, retrieved_context),
                    'sources': [r.metadata for r in retrieved_context.vector_results],
                    'vector_results': retrieved_context.vector_results,
                    'graph_context': retrieved_context.graph_context,
                    'expanded_queries': retrieved_context.expanded_queries,
                    'validation': validation_result
                }
            
            print(f"✅ Content sufficient (score: {validation_result['completeness_score']}/10)")
            
            # Build synthesis-focused prompt
            prompt = self._build_synthesis_prompt(question, retrieved_context)
            
            print("🤖 Generating synthesized answer...")
            
            # Enhanced system prompt with incompleteness detection
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system", 
                        "content": self._get_enhanced_system_prompt()
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1500
            )
            
            answer = response.choices[0].message.content
            
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
        NEW: Validate if retrieved content is sufficient to answer the question
        Returns completeness score (1-10) and reasoning
        """
        
        validation_prompt = f"""You are a content validator. Your job is to assess if the provided context is sufficient to answer the question.

QUESTION: {question}

CONTEXT TO EVALUATE:
{retrieved_context.combined_context}

ASSESSMENT TASK:
Rate the completeness of the context for answering this question on a scale of 1-10:
- 1-3: No relevant information or only tangential mentions
- 4-6: Some relevant information but major gaps exist
- 7-8: Most information present, minor gaps acceptable
- 9-10: Complete, comprehensive information available

EVALUATION CRITERIA:
1. Does the context DIRECTLY discuss the main topic of the question?
2. Is the topic mentioned IN DEPTH or just in passing?
3. For "describe/explain" questions: Is there at least one substantial paragraph?
4. For "list/enumerate" questions: Are most or all items present?
5. For "differentiate/compare" questions: Are both items discussed with specific details?

RESPOND IN THIS EXACT JSON FORMAT (no other text):
{{
  "completeness_score": <number 1-10>,
  "can_fully_answer": <true/false>,
  "topic_directly_discussed": <true/false>,
  "substantial_content_present": <true/false>,
  "reasoning": "<brief explanation>",
  "what_is_available": "<what information IS in the context>",
  "what_is_missing": "<what information is NOT in the context>"
}}"""

        try:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise content validator. Respond ONLY with valid JSON, no other text."
                    },
                    {"role": "user", "content": validation_prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            validation_text = response.choices[0].message.content.strip()
            
            # Extract JSON (handle potential markdown code blocks)
            json_match = re.search(r'\{.*\}', validation_text, re.DOTALL)
            if json_match:
                validation_result = json.loads(json_match.group(0))
            else:
                validation_result = json.loads(validation_text)
            
            return validation_result
            
        except Exception as e:
            print(f"⚠️ Validation error: {e}")
            # Fallback: Conservative validation
            return {
                "completeness_score": 5,
                "can_fully_answer": False,
                "topic_directly_discussed": False,
                "substantial_content_present": False,
                "reasoning": "Validation error - being conservative",
                "what_is_available": "Unknown due to validation error",
                "what_is_missing": "Unknown due to validation error"
            }
    
    def _generate_limitation_response(self, question: str, validation: Dict, context: Any) -> str:
        """Generate honest response when content is insufficient"""
        
        score = validation['completeness_score']
        available = validation.get('what_is_available', 'limited information')
        missing = validation.get('what_is_missing', 'comprehensive details')
        
        if score <= 3:
            # Very poor match
            return f"""I don't have sufficient information in the course materials to answer your question about "{question}".

The retrieved content does not directly discuss this topic. The course materials focus on digital media, photography techniques, camera operations, and media literacy.

If you're looking for information about topics covered in the course, I can help with questions about:
- Photography techniques and equipment
- Digital imaging and editing
- Media literacy concepts
- Video and audio production
- Journalism and storytelling

Please feel free to ask about these topics instead."""

        elif score <= 6:
            # Partial information
            return f"""I found limited information about this topic in the course materials, but not enough for a complete answer.

**What I found:**
{available}

**What's missing:**
{missing}

**My assessment:** The materials provide only partial information ({score}/10 completeness). I cannot give you a comprehensive answer without potentially making assumptions beyond what's explicitly stated in the course content.

If you have a more specific question about the aspects that ARE covered, I'd be happy to help with that."""

        else:
            # This shouldn't happen (score >= 7 means we proceed with full answer)
            return "Content validation inconsistency. Please try rephrasing your question."
    
    def _get_enhanced_system_prompt(self) -> str:
        """Enhanced system prompt with incompleteness detection"""
        return """You are an expert course assistant specializing in Digital Media and Media Literacy.

YOUR PRIMARY GOAL: Provide DIRECT, SPECIFIC answers by extracting and synthesizing information from course materials.

CRITICAL RULES:
1. Answer the EXACT question asked - don't just describe what sections contain
2. EXTRACT specific facts, definitions, and comparisons from the provided context
3. NEVER say "the material discusses..." - instead say "According to [Section], [the actual information]"
4. For comparison questions:
   • Create clear side-by-side comparisons
   • List specific characteristics of each item
   • Highlight KEY differences explicitly
5. For definition questions:
   • Provide the exact definition from the material
   • Add relevant context if available
6. For process/steps questions:
   • List each step clearly with its source
   • Number the steps for clarity
7. Always cite sections, but focus on CONTENT, not metadata

INCOMPLETENESS DETECTION PROTOCOL (CRITICAL):
🔍 Before finalizing your answer, check for these incompleteness signals:

1. PARTIAL LISTING INDICATORS:
   - Phrases like: "some characteristics include...", "among the types are...", "examples include..."
   - Words: "etc.", "and others", "such as", "for example"
   → If found: Explicitly state "The materials mention X, Y, Z. Additional items may exist but are not detailed here."

2. NUMBERED ITEMS MISMATCH:
   - Question asks for "5 principles" but you only find 3
   → State clearly: "I found 3 of the mentioned principles in the materials: [list them]. The complete list of 5 is not provided."

3. FORWARD REFERENCES:
   - "This will be discussed in Unit X", "See Section Y for details"
   → State: "The materials reference additional details in [location] which are not included in the retrieved sections."

4. DEPTH ASSESSMENT:
   - If you have only 1-2 sentences on a topic that warrants more
   → Acknowledge: "The materials provide a brief overview. More detailed information may exist in other sections."

5. TOPICAL RELEVANCE CHECK:
   - If context mentions the query term but in a DIFFERENT context
   - Example: "learning" in "camera learning" vs "machine learning"
   → State clearly: "The term appears in the materials but in a different context ([explain context]). Information about [query topic] is not directly covered."

ANSWER STRUCTURE (adapt based on question type):

For COMPARISON questions (differentiate/compare):
**[Item 1]:**
• Characteristic 1 (from Section X)
• Characteristic 2 (from Section Y)

**[Item 2]:**
• Characteristic 1 (from Section X)
• Characteristic 2 (from Section Y)

**Key Differences:**
• Difference 1
• Difference 2

For DEFINITION questions:
Direct definition with source, then additional context if relevant.

For PROCESS questions:
Step-by-step list with section citations.

WHAT NOT TO DO:
❌ "Section 3.2 discusses cameras..." (too vague)
✅ "According to Section 3.2, SLR cameras use a mirror mechanism that..."

❌ "The material covers the differences..." (no actual answer)
✅ "SLR cameras differ from DSLR cameras in three key ways: 1) [specific difference]..."

❌ Aggregating sparse mentions into a false coherent answer
✅ Acknowledging when information is incomplete or insufficient

REMEMBER: Extract and synthesize - don't just point to sections! Be honest about gaps and limitations."""

    def _build_synthesis_prompt(self, question: str, retrieved_context: Any) -> str:
        """Build prompt for synthesis with strict grounding"""
        
        history = ""
        if self.conversation_history:
            history = "\n=== PREVIOUS CONVERSATION (for context only) ===\n"
            for conv in self.conversation_history[-2:]:
                history += f"Q: {conv['question']}\nA: {conv['answer'][:150]}...\n\n"
        
        prompt = f"""{history}

=== STUDENT'S CURRENT QUESTION ===
{question}

=== RETRIEVED COURSE MATERIALS (YOUR ONLY SOURCE OF TRUTH) ===

{retrieved_context.combined_context}

=== END OF RETRIEVED MATERIALS ===

INSTRUCTIONS:
1. Answer STRICTLY based on the context above - do not use external knowledge
2. Cite the specific section/unit for EVERY piece of information you provide
3. If the context doesn't fully answer the question, explicitly state what's missing
4. For process/lifecycle questions: list each step with its source section
5. Use this citation format: "According to [Section X.Y]..." or "As stated in [Unit N]..."
6. Apply INCOMPLETENESS DETECTION - check for partial lists, forward references, or insufficient depth

Provide your answer now:"""
        
        return prompt
        
    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
