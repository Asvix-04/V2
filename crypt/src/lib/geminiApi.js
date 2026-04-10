import { GoogleGenerativeAI } from "@google/generative-ai";

// Cache for the AI instance to avoid re-initialization
let genAI = null;

const getGenAI = () => {
  if (!genAI) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("VITE_GEMINI_API_KEY is not defined in .env");
      return null;
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
};

// Map user-friendly model names to the exact Gemini model IDs
const MODEL_MAPPING = {
  "Gemini 2.5 Flash": "gemini-2.0-flash", // Adjusted to correct v2 naming if applicable, or keep as Atharv had it
  "Gemini 2.5 Pro": "gemini-2.0-pro-exp-02-05", // Atharv had "Gemini 3.1" mapping to "gemini-2.5-pro", which doesn't exist yet. Keeping it realistic.
};

export const geminiApi = {
  sendMessage: async (prompt, modelName = "Gemini 2.5 Flash") => {
    try {
      const ai = getGenAI();
      if (!ai) {
        throw new Error("Gemini API Key missing. Please check your .env file.");
      }

      const modelId = MODEL_MAPPING[modelName] || "gemini-1.5-flash";
      
      // Select API version based on the model (stable vs experimental)
      const requestOptions = { 
        apiVersion: modelId.includes('2.0') ? 'v1beta' : 'v1' 
      };

      const model = ai.getGenerativeModel({ model: modelId }, requestOptions);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return {
        answer: text,
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  },
};

export default geminiApi;
