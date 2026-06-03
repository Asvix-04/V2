const axios = require('axios');

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * Integrated Voice & Text Bridge
 * This controller proxies requests to the advanced Python AI server.
 * High-performance Base64 flow (no disk I/O).
 */

// @desc    Process Speech-to-Speech
// @route   POST /api/voice/speech-to-speech
exports.speechToSpeech = async (req, res) => {
    try {
        const {
            audio_base64,
            text,
            mime_type,
            response_language_code,
            use_history,
            model,
        } = req.body;

        if (!audio_base64 && !text) {
            return res.status(400).json({ message: 'No audio or text data provided' });
        }

        console.log(text
            ? `Forwarding text S2S request to AI backend... (${text.length} chars)`
            : `Forwarding S2S request to AI backend... (${audio_base64.length} chars)`);

        // Call specialized Python endpoint.
        // response_language_code is intentionally NOT defaulted to 'en-IN' here.
        // When null/undefined, the Python backend uses the STT-detected language,
        // so the AI responds in whatever language the user spoke.
        const response = await axios.post(`${PYTHON_BACKEND_URL}/speech-to-speech`, {
            audio_base64: audio_base64,
            text: text || null,
            mime_type: mime_type || 'audio/wav',
            use_history: use_history !== false,
            response_language_code: response_language_code || null,
            model: model || null,
        });

        res.json({
            ...response.data,
            transcript: response.data.transcript || '',
            answer: response.data.answer || '',
            audio_base64: response.data.audio_base64 || '',
            language: response.data.language || response.data.response_language || response.data.detected_language || null,
        });

    } catch (error) {
        console.error('Speech-to-Speech Proxy Error:', error.response?.data || error.message);
        const errorDetail = error.response?.data?.detail || error.message;
        res.status(500).json({ message: 'AI processing failed', detail: errorDetail });
    }
};

// @desc    Standard Chat Proxy
// @route   POST /api/voice/chat
exports.chat = async (req, res) => {
    try {
        if (req.query.stream === 'true') {
            const response = await axios.post(`${PYTHON_BACKEND_URL}/chat?stream=true`, req.body, {
                responseType: 'stream',
            });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            response.data.pipe(res);
            return;
        }

        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Chat Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Chat failed', detail: error.response?.data?.detail || error.message });
    }
};

// @desc    Simple Chat Proxy
// @route   POST /api/voice/chat/simple
exports.chatSimple = async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat/simple`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Chat Simple Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Chat Simple failed', detail: error.response?.data?.detail || error.message });
    }
};

// @desc    Clear History Proxy
// @route   POST /api/voice/clear-history
exports.clearHistory = async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/clear-history`);
        res.json(response.data);
    } catch (error) {
        console.error('Clear History Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Clear history failed' });
    }
};

// @desc    Process Multilingual Text-to-Text
// @route   POST /api/voice/text-to-text
exports.textToText = async (req, res) => {
    try {
        const question = req.body.question;
        const languageCode = req.body.language_code ?? req.body.languageCode ?? null;
        const useHistory = req.body.use_history ?? req.body.useHistory;
        const model = req.body.model || null;

        if (!question) {
            return res.status(400).json({ message: 'Question is required' });
        }

        console.log(`Forwarding T2T request to AI backend: "${question}"`);

        const response = await axios.post(`${PYTHON_BACKEND_URL}/text-to-text`, {
            question: question,
            language_code: languageCode,
            use_history: useHistory !== false,
            model,
        });

        res.json({
            answer: response.data.answer,
            original_question: response.data.original_question,
            detected_language: response.data.detected_language,
            sources: response.data.sources,
            validation: response.data.validation
        });

    } catch (error) {
        console.error('Text-to-Text Proxy Error:', error.response?.data || error.message);
        const errorDetail = error.response?.data?.detail || error.message;
        res.status(500).json({ message: 'Translation/Chat failed', detail: errorDetail });
    }
};

exports.syncHistory = async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/history/sync`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('History Sync Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'History sync failed', detail: error.response?.data?.detail || error.message });
    }
};

exports.healthCheck = async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_BACKEND_URL}/health`, {
            timeout: 5000,
        });

        const pythonHealth = response.data || {};
        const chatbotReady = pythonHealth.chatbot_ready !== false;

        if (!chatbotReady) {
            return res.status(503).json({
                status: 'unhealthy',
                service: 'Integrated-AI-Bridge',
                message: 'Python AI backend is reachable but not ready',
                python_backend: pythonHealth,
            });
        }

        res.json({
            status: 'healthy',
            service: 'Integrated-AI-Bridge',
            python_backend: pythonHealth,
        });
    } catch (error) {
        console.error('Health Check Proxy Error:', error.response?.data || error.message);
        res.status(503).json({
            status: 'unhealthy',
            service: 'Integrated-AI-Bridge',
            message: 'Python AI backend is unavailable',
            detail: error.response?.data?.detail || error.message,
        });
    }
};
