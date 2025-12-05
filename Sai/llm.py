import os
import json
from typing import List, Dict, Any
from openai import OpenAI   # install: pip install openai python-dotenv
from openai import APIError
from dotenv import load_dotenv
load_dotenv()


# --- Configuration ---
# Create .env & add your keys
# sample .env content:
# GROQ_API_KEY=your_groq_api_key_here   
# DEEPSEEK_API_KEY=your_deepseek_api_key_here
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")


class LLMService:
    """
    A service class to handle multi-model LLM generation with a primary/fallback system.

    It uses the OpenAI-compatible client for both Groq and DeepSeek.
    """

    def __init__(self, system_persona: str):
        """Initializes the service with model clients and configuration."""
        
        # 1. Primary Model: Groq (for Llama 3.3 70B)
        self.primary_model_name = "llama-3.3-70b-versatile" # Groq-specific name
        self.primary_client = OpenAI(
            api_key=GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )

        # 2. Fallback Model: DeepSeek
        self.fallback_model_name = "deepseek-r1" # DeepSeek model name
        self.fallback_client = OpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com/v1",
        )
        
        self.system_persona = system_persona

    def _call_api(self, client: OpenAI, model_name: str, messages: List[Dict[str, str]]) -> str:
        """
        Internal function to call a specific LLM API and extract the response.
        """
        print(f"-> Attempting generation with model: {model_name}...")
        
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.7,
            max_tokens=8192, 
            top_p=0.95
        )

        content = response.choices[0].message.content
        if not content:
            raise APIError(f"API returned an empty response for model {model_name}")

        print(f"-> Successfully received response from {model_name}.")
        return content

    def generate_response(self, user_query: str, chat_history: List[Dict[str, str]], external_data: str = "") -> str:
        """
        Generates an AI response, attempting the primary model first, then falling back.

        Args:
            user_query: The user's most recent message.
            chat_history: List of previous messages in the current session (role: user/assistant).
            external_data: Any external data/context the LLM should use (e.g., patient records, fetched articles).
        
        Returns:
            The final generated text response.
        """
        
        # --- 1. Context and Prompt Engineering ---
        
        # Combine system persona, external data, and chat history into the message structure
        full_context_prompt = f"EXTERNAL DATA/CONTEXT (Use this information to ground your response):\n{external_data}\n\n" \
                              f"CONVERSATION HISTORY:\n"
        
        # Build messages list, including the system role
        messages = [{"role": "system", "content": self.system_persona}]
        
        # Append history messages (user/assistant)
        messages.extend(chat_history)
        
        # Append the new user query, ensuring the external data is included if present
        messages.append({"role": "user", "content": user_query})

        # --- 2. Primary Model Attempt (Groq) ---
        try:
            return self._call_api(
                self.primary_client, 
                self.primary_model_name, 
                messages
            )
        except APIError as e:
            print(f"!!! Primary model ({self.primary_model_name}) failed with APIError: {e}. Falling back...")
        except Exception as e:
            print(f"!!! Primary model ({self.primary_model_name}) failed with unexpected error: {e}. Falling back...")
            
        # --- 3. Fallback Model Attempt (DeepSeek) ---
        try:
            # Note: We use the same 'messages' list for consistent context
            return self._call_api(
                self.fallback_client, 
                self.fallback_model_name, 
                messages
            )
        except Exception as e:
            print(f"!!! Fallback model ({self.fallback_model_name}) also failed: {e}")
            return "Sorry, both the primary and fallback AI models are currently unavailable. Please try again later. 🩺"


# --- Example Usage ---
if __name__ == "__main__":
    
    # 1. Define the System Persona of Chatbot
    chatbot_persona = (
        "You are MediBot, a friendly, knowledgeable, and professional health assistant. "
        "Your primary role is to answer health, symptom, medication, and wellness questions based on the "
        "latest information and the provided context/data. Always use a conversational and empathetic tone. "
        "Start your responses with emojis (like 🩺✨) and end with an encouraging remark. "
        "Crucially: Always state that your guidance is for informational purposes only and not a substitute for professional medical advice."
    )
    
    # Initialize the LLM Service
    llm_service = LLMService(system_persona=chatbot_persona)
    
    # 2. Example Data/Context (simulating a DB fetch or external file content)
    user_data = "The user's name is Alex. Alex is 35 years old and has a known allergy to penicillin. " \
                "Alex recently asked about dietary changes for managing stress."
    
    # 3. Example Chat History
    history = [
        {"role": "user", "content": "I've been feeling really run down and tired lately."},
        {"role": "assistant", "content": "🩺 That sounds tough, Alex. Given our previous chat about stress management, are you getting enough sleep and downtime? Sometimes fatigue is linked to chronic stress. What are your main symptoms? ✨"}
    ]
    
    # 4. New User Query
    new_query = "What are some immediate, safe steps I can take to boost my energy, considering my allergies?"

    print("\n" + "="*50)
    print(f"User Query: {new_query}")
    print("="*50 + "\n")

    # Generate the response
    final_response = llm_service.generate_response(
        user_query=new_query,
        chat_history=history,
        external_data=user_data
    )
    
    print("\n" + "--- FINAL BOT RESPONSE ---")
    print(final_response)
    print("------------------------------\n")
    
    # --- Simulate Fallback Scenario (e.g., if Groq key was invalid) ---
    print("\n" + "="*50)
    print("SIMULATING PRIMARY MODEL FAILURE (Fallback Test)")
    print("="*50 + "\n")
    
    # Temporarily break the Groq key to force a fallback
    original_groq_key = llm_service.primary_client.api_key
    llm_service.primary_client.api_key = "INVALID_GROQ_KEY" 

    fallback_query = "If the last model failed, please confirm if you successfully switched to DeepSeek."

    fallback_response = llm_service.generate_response(
        user_query=fallback_query,
        chat_history=[],
        external_data="The LLM should note that the first attempt failed and state the model used for this response."
    )

    print("\n" + "--- FALLBACK TEST RESPONSE ---")
    print(fallback_response)
    print("------------------------------\n")
    
    # Restore the key
    llm_service.primary_client.api_key = original_groq_key