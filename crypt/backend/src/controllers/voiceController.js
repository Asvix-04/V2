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
        const { audio_base64, mime_type, response_language_code, use_history } = req.body;

        if (!audio_base64) {
            return res.status(400).json({ message: 'No audio data provided' });
        }

        console.log(`Forwarding S2S request to AI backend... (${audio_base64.length} chars)`);

        // Call specialized Python endpoint
        const response = await axios.post(`${PYTHON_BACKEND_URL}/speech-to-speech`, {
            audio_base64: audio_base64,
            mime_type: mime_type || 'audio/wav',
            use_history: use_history !== false,
            response_language_code: response_language_code || 'en-IN'
        });

        // Return EXACT fields the frontend VoiceOverlay.jsx expects:
        // transcription, answer, audio_base64
        res.json({
            transcript: response.data.transcript,
            answer: response.data.answer,
            audio_base64: response.data.audio_base64,
            detected_language: response.data.detected_language,
            sources: response.data.sources,
            validation: response.data.validation
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
        const { question, languageCode, useHistory } = req.body;

        if (!question) {
            return res.status(400).json({ message: 'Question is required' });
        }

        console.log(`Forwarding T2T request to AI backend: "${question}"`);

        const response = await axios.post(`${PYTHON_BACKEND_URL}/text-to-text`, {
            question: question,
            language_code: languageCode || 'en-IN',
            use_history: useHistory !== false
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

exports.healthCheck = (req, res) => {
    res.json({ status: 'healthy', service: 'Integrated-AI-Bridge' });
};
