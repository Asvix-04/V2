import axios from 'axios';

const chatbotClient = axios.create({
    baseURL: import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:5001/api/voice',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor to inject the token for our Node.js gateway
chatbotClient.interceptors.request.use(
    (config) => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && user.token) {
                    config.headers.Authorization = `Bearer ${user.token}`;
                }
            } catch (e) {
                console.error("Error parsing user from localStorage", e);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export const chatbotApi = {
    checkHealth: async () => {
        try {
            const response = await chatbotClient.get('/health');
            return response.data;
        } catch (error) {
            console.error('Chatbot health check failed:', error);
            throw error;
        }
    },

    sendMessage: async (question, model = null, useHistory = true) => {
        try {
            const response = await chatbotClient.post('/chat', {
                question,
                model,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot sendMessage failed:', error);
            throw error;
        }
    },

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

    clearHistory: async () => {
        try {
            const response = await chatbotClient.post('/clear-history');
            return response.data;
        } catch (error) {
            console.error('Chatbot clearHistory failed:', error);
            throw error;
        }
    },

    getHistory: async () => {
        try {
            const response = await chatbotClient.get('/history');
            return response.data;
        } catch (error) {
            console.error('Chatbot getHistory failed:', error);
            throw error;
        }
    },

    speechToSpeech: async (audioBase64, mimeType, responseLanguageCode = null, useHistory = true) => {
        try {
            const response = await chatbotClient.post('/speech-to-speech', {
                audio_base64: audioBase64,
                mime_type: mimeType,
                response_language_code: responseLanguageCode,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot speechToSpeech failed:', error);
            throw error;
        }
    },

    textToText: async (question, languageCode = null, useHistory = true) => {
        try {
            const payload = { question, use_history: useHistory };
            if (languageCode) payload.language_code = languageCode;
            const response = await chatbotClient.post('/text-to-text', payload);
            return response.data;
        } catch (error) {
            console.error('Chatbot textToText failed:', error);
            throw error;
        }
    },
};

export default chatbotApi;
