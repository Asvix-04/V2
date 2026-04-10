import axios from 'axios';

const chatbotClient = axios.create({
    baseURL: import.meta.env.VITE_CHATBOT_API_URL || 'https://asvix-digilab.hf.space',
    headers: {
        'Content-Type': 'application/json',
    },
});

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

    speechToSpeech: async (audio, mimeType, language = 'en-IN', useHistory = true) => {
        try {
            const response = await chatbotClient.post('/speech-to-speech', {
                audio,
                mime_type: mimeType,
                language,
                use_history: useHistory,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot speechToSpeech failed:', error);
            throw error;
        }
    },
};

export default chatbotApi;
