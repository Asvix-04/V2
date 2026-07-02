const axios = require('axios');
const jwt = require('jsonwebtoken');
const bridgeMetrics = require('../lib/bridgeMetrics');

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * Integrated Voice & Text Bridge
 * Proxies requests to the Python AI server.
 *
 * IMPORTANT: each proxy records a failure to bridgeMetrics ONLY when Python
 * is unreachable (no HTTP response). If Python responds with an error code,
 * Python's own metrics_logger has already recorded it — we don't double-count.
 */

/**
 * Soft-decode the JWT from the Authorization header to identify the user.
 * Returns the user id, or "guest" when there's no/invalid token.
 * (Voice routes are public/guest-friendly, so we never reject here.)
 */
function getUserId(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
            return decoded.id || decoded.uid || 'guest';
        } catch (e) {
            // invalid/expired token → treat as guest
        }
    }
    return 'guest';
}

function _onProxyError(endpoint, error, startedAt, userId = 'guest') {
    if (!error.response) {
        // True bridge-level failure: Python is unreachable / timed out.
        bridgeMetrics.recordFailure({
            endpoint,
            status_code: 503,
            response_time_ms: Date.now() - startedAt,
            error: error.code || error.message || 'backend_unreachable',
            source: 'bridge',
            user_id: userId,
        });
    }
}

// @desc    Process Speech-to-Speech
// @route   POST /api/voice/speech-to-speech
exports.speechToSpeech = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);
    try {
        const { audio_base64, mime_type, response_language_code, use_history } = req.body;

        if (!audio_base64) {
            return res.status(400).json({ message: 'No audio data provided' });
        }

        console.log(`Forwarding S2S request to AI backend... (${audio_base64.length} chars)`);

        // Call specialized Python endpoint.
        // response_language_code is intentionally NOT defaulted to 'en-IN' here.
        // When null/undefined, the Python backend uses the STT-detected language,
        // so the AI responds in whatever language the user spoke.
        const response = await axios.post(`${PYTHON_BACKEND_URL}/speech-to-speech`, {
            audio_base64: audio_base64,
            mime_type: mime_type || 'audio/wav',
            use_history: use_history !== false,
            response_language_code: response_language_code || 'en-IN',
            user_id: userId
        });

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
        _onProxyError('/speech-to-speech', error, start, userId);
        const errorDetail = error.response?.data?.detail || error.message;
        res.status(500).json({ message: 'AI processing failed', detail: errorDetail });
    }
};

// @desc    Standard Chat Proxy
// @route   POST /api/voice/chat
exports.chat = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat`, { ...req.body, user_id: userId });
        res.json(response.data);
    } catch (error) {
        console.error('Chat Proxy Error:', error.response?.data || error.message);
        _onProxyError('/chat', error, start, userId);
        res.status(500).json({ message: 'Chat failed', detail: error.response?.data?.detail || error.message });
    }
};

// @desc    Simple Chat Proxy
// @route   POST /api/voice/chat/simple
exports.chatSimple = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat/simple`, { ...req.body, user_id: userId });
        res.json(response.data);
    } catch (error) {
        console.error('Chat Simple Proxy Error:', error.response?.data || error.message);
        _onProxyError('/chat/simple', error, start, userId);
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
    const start = Date.now();
    const userId = getUserId(req);
    try {
        const { question, languageCode, useHistory } = req.body;

        if (!question) {
            return res.status(400).json({ message: 'Question is required' });
        }

        console.log(`Forwarding T2T request to AI backend: "${question}"`);

        const response = await axios.post(`${PYTHON_BACKEND_URL}/text-to-text`, {
            question: question,
            language_code: languageCode || 'en-IN',
            use_history: useHistory !== false,
            user_id: userId
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
        _onProxyError('/text-to-text', error, start, userId);
        const errorDetail = error.response?.data?.detail || error.message;
        res.status(500).json({ message: 'Translation/Chat failed', detail: errorDetail });
    }
};

// @desc    Metrics summary — reads BOTH Python's and bridge's log files directly,
//          so the dashboard keeps working even when Python is down.
// @route   GET /api/voice/metrics/summary
exports.getMetricsSummary = async (req, res) => {
    try {
        const window = req.query.window || '30d';
        const userId = getUserId(req);
        const summary = bridgeMetrics.computeSummary(window, userId);
        res.json(summary);
    } catch (error) {
        console.error('Metrics summary failed:', error.message);
        res.status(500).json({ message: 'Failed to compute metrics', detail: error.message });
    }
};

// @desc    Frontend-reported failure event (e.g. axios Network Error in the browser)
// @route   POST /api/voice/metrics/event
exports.recordClientError = (req, res) => {
    try {
        const userId = getUserId(req);
        const events = Array.isArray(req.body) ? req.body : [req.body];
        let accepted = 0;
        for (const ev of events) {
            if (!ev || typeof ev !== 'object') continue;
            bridgeMetrics.recordFailure({
                endpoint: ev.endpoint || '/client',
                status_code: ev.status_code || 503,
                response_time_ms: ev.response_time_ms || 0,
                model: ev.model || 'unknown',
                error: ev.error || ev.error_type || 'client_error',
                source: 'client',
                user_id: userId,
            });
            accepted++;
        }
        res.json({ accepted });
    } catch (e) {
        res.status(500).json({ message: 'Failed to record event', detail: e.message });
    }
};

exports.healthCheck = async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_BACKEND_URL}/health`, { timeout: 5000 });
        res.json({
            status: 'healthy',
            service: 'Integrated-AI-Bridge',
            backend: response.data,
        });
    } catch (error) {
        res.status(503).json({
            status: 'starting',
            service: 'Integrated-AI-Bridge',
            backend: 'unavailable',
        });
    }
};
