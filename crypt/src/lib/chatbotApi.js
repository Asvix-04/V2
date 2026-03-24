import axios from 'axios';

const chatbotClient = axios.create({
    baseURL: 'https://asvix-digilab.hf.space',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const chatbotApi = {
    // Health check
    checkHealth: async () => {
        try {
            const response = await chatbotClient.get('/health');
            return response.data;
        } catch (error) {
            console.error('Chatbot health check failed:', error);
            throw error;
        }
    },

    // Standard text chat (English)
    sendMessage: async (question, useHistory = true) => {
        try {
            const response = await chatbotClient.post('/chat', {
                question,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot sendMessage failed:', error);
            throw error;
        }
    },

    // Simple text chat
    sendSimpleMessage: async (question, useHistory = true) => {
        try {
            const response = await chatbotClient.post('/chat/simple', {
                question,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot sendSimpleMessage failed:', error);
            throw error;
        }
    },

    // Multilingual text-to-text chat
    textToText: async (question, languageCode = 'en-IN', useHistory = true) => {
        try {
            const response = await chatbotClient.post('/text-to-text', {
                question,
                language_code: languageCode,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot textToText failed:', error);
            throw error;
        }
    },

    // Voice-to-voice: send base64 audio, get base64 audio response back
    speechToSpeech: async (audioBase64, mimeType = 'audio/wav', responseLanguageCode = 'en-IN', useHistory = true) => {
        try {
            const response = await chatbotClient.post('/speech-to-speech', {
                audio_base64: audioBase64,
                mime_type: mimeType,
                use_history: useHistory,
                response_language_code: responseLanguageCode,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot speechToSpeech failed:', error);
            throw error;
        }
    },

    // Clear conversation history
    clearHistory: async () => {
        try {
            const response = await chatbotClient.post('/clear-history');
            return response.data;
        } catch (error) {
            console.error('Chatbot clearHistory failed:', error);
            throw error;
        }
    },

    // Get conversation history
    getHistory: async () => {
        try {
            const response = await chatbotClient.get('/history');
            return response.data;
        } catch (error) {
            console.error('Chatbot getHistory failed:', error);
            throw error;
        }
    },
};

export default chatbotApi;
