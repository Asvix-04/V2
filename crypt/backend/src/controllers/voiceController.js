const axios = require('axios');
const jwt = require('jsonwebtoken');
const bridgeMetrics = require('../lib/bridgeMetrics');
const { reserveQuota, compensateQuota, getGuestQuotaData } = require('../middleware/guestQuotaMiddleware');

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * Integrated Voice & Text Bridge
 * Proxies requests to the Python AI server.
 *
 * IMPORTANT: each proxy records a failure to bridgeMetrics ONLY when Python
 * is unreachable (no HTTP response). If Python responds with an error code,
 * Python's own metrics_logger has already recorded it — we don't double-count.
 *
 * PYTHON_BACKEND_URL points at different things depending on where this Node
 * service is deployed:
 *   - On Hugging Face, Node and Python run in the same container, so it's
 *     http://127.0.0.1:8000 — pure Python, no middleware in the way.
 *   - On Render, Python doesn't run locally at all, so this has to be the
 *     Hugging Face Space's PUBLIC url — which is NOT pure Python, it's the
 *     exact same combined Node+Python container, meaning this outbound call
 *     also passes through that Space's own classifyUser/guest-check
 *     middleware before ever reaching Python. Without a guest header of its
 *     own, that middleware rejects this server-to-server call the same way
 *     it would reject a real guest browser request with no credentials.
 *     This header exists purely to satisfy that check on the receiving
 *     side — it has no bearing on who the real user is; that's carried
 *     separately via `user_id` in the request body.
 *
 * IMPORTANT: this must carry the REAL caller's own identity, not one shared
 * constant. A single hardcoded guest id here would bucket every request from
 * every user (and every deployment) under one shared guest quota on the
 * receiving side — which is exactly what happened: it silently exhausted
 * after normal testing traffic, then blocked every real user afterward.
 * Forwarding the original Authorization header (if logged in) or this
 * request's own guestId (if not) keeps each real user's quota isolated and
 * correct on whichever side actually enforces it.
 */
function pythonProxyHeaders(req) {
    // Always include a per-user-unique X-Guest-ID fallback, even when we also
    // forward Authorization. If the receiving side's JWT_SECRET ever differs
    // from this service's (e.g. Render vs. Hugging Face configured
    // separately), its own classifyUser will fail to verify our forwarded
    // token and fall through to its guest path — and needs a guest id to
    // fall back to right there, or it 400s exactly like the original bug.
    // Keying it to this user's own id keeps that fallback isolated per user
    // instead of one shared bucket.
    const headers = { 'X-Guest-ID': req.guestId || `user-${getUserId(req)}` };
    if (req.headers.authorization) {
        headers.Authorization = req.headers.authorization;
    }
    return headers;
}

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
    let reservedQuotaObj = null;
    let reserved = false;

    if (req.isGuest) {
        try {
            reservedQuotaObj = await reserveQuota(req.guestId);
            reserved = true;
        } catch (err) {
            if (err.message === 'limit_exceeded') {
                return res.status(429).json({ message: 'Guest message limit exceeded. Please log in.', detail: 'guest_quota_exceeded' });
            }
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }

    try {
        const { audio_base64, mime_type, response_language_code, use_history } = req.body;

        if (!audio_base64) {
            if (reserved) await compensateQuota(req.guestId);
            return res.status(400).json({ message: 'No audio data provided' });
        }

        console.log(`Forwarding S2S request to AI backend... (${audio_base64.length} chars)`);

        // Call specialized Python endpoint.
        // response_language_code is intentionally NOT defaulted to 'en-IN' here.
        // When null/undefined, the Python backend uses the STT-detected language,
        // so the AI responds in whatever language the user spoke. (This used to
        // default to 'en-IN' below, contradicting this comment — VoiceOverlay
        // never passes a response language, so every voice reply was silently
        // forced to English regardless of what was actually spoken.)
        const response = await axios.post(`${PYTHON_BACKEND_URL}/speech-to-speech`, {
            audio_base64: audio_base64,
            mime_type: mime_type || 'audio/wav',
            use_history: use_history !== false,
            response_language_code: response_language_code || null,
            user_id: userId
        }, { headers: pythonProxyHeaders(req) });

        res.json({
            transcript: response.data.transcript,
            answer: response.data.answer,
            audio_base64: response.data.audio_base64,
            detected_language: response.data.detected_language,
            sources: response.data.sources,
            validation: response.data.validation,
            guestQuota: reservedQuotaObj
        });

    } catch (error) {
        if (reserved) {
            await compensateQuota(req.guestId);
        }
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
    let reservedQuotaObj = null;
    let reserved = false;

    if (req.isGuest) {
        try {
            reservedQuotaObj = await reserveQuota(req.guestId);
            reserved = true;
        } catch (err) {
            if (err.message === 'limit_exceeded') {
                return res.status(429).json({ message: 'Guest message limit exceeded. Please log in.', detail: 'guest_quota_exceeded' });
            }
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }

    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat`, { ...req.body, user_id: userId }, { headers: pythonProxyHeaders(req) });
        res.json({
            ...response.data,
            guestQuota: reservedQuotaObj
        });
    } catch (error) {
        if (reserved) {
            await compensateQuota(req.guestId);
        }
        console.error('Chat Proxy Error:', error.response?.data || error.message);
        _onProxyError('/chat', error, start, userId);
        res.status(500).json({ message: 'Chat failed', detail: error.response?.data?.detail || error.message });
    }
};

// @desc    Streaming Chat Proxy (Server-Sent Events) — default model only for now
// @route   POST /api/voice/chat/stream
exports.chatStream = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);
    let reservedQuotaObj = null;
    let reserved = false;

    if (req.isGuest) {
        try {
            reservedQuotaObj = await reserveQuota(req.guestId);
            reserved = true;
        } catch (err) {
            if (err.message === 'limit_exceeded') {
                return res.status(429).json({ message: 'Guest message limit exceeded. Please log in.', detail: 'guest_quota_exceeded' });
            }
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }

    try {
        const upstream = await axios.post(
            `${PYTHON_BACKEND_URL}/chat/stream`,
            { ...req.body, user_id: userId },
            { headers: pythonProxyHeaders(req), responseType: 'stream' }
        );

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // disable nginx/proxy buffering so chunks flush immediately
        });

        // Same guest-quota info the non-streaming routes attach to their JSON
        // body, sent here as the first SSE event since there's no single
        // response object to attach it to.
        if (reservedQuotaObj) {
            res.write(`data: ${JSON.stringify({ guestQuota: reservedQuotaObj })}\n\n`);
        }

        upstream.data.pipe(res);

        upstream.data.on('error', (err) => {
            console.error('Chat Stream Proxy Error (mid-stream):', err.message);
            try { res.end(); } catch { /* connection already gone */ }
        });

        req.on('close', () => {
            // Client navigated away / closed the tab — stop reading from Python.
            upstream.data.destroy();
        });
    } catch (error) {
        if (reserved) {
            await compensateQuota(req.guestId);
        }
        console.error('Chat Stream Proxy Error:', error.response?.data || error.message);
        _onProxyError('/chat', error, start, userId);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Chat failed', detail: error.response?.data?.detail || error.message });
        } else {
            res.end();
        }
    }
};

// @desc    Simple Chat Proxy
// @route   POST /api/voice/chat/simple
exports.chatSimple = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);
    let reservedQuotaObj = null;
    let reserved = false;

    if (req.isGuest) {
        try {
            reservedQuotaObj = await reserveQuota(req.guestId);
            reserved = true;
        } catch (err) {
            if (err.message === 'limit_exceeded') {
                return res.status(429).json({ message: 'Guest message limit exceeded. Please log in.', detail: 'guest_quota_exceeded' });
            }
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }

    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/chat/simple`, { ...req.body, user_id: userId }, { headers: pythonProxyHeaders(req) });
        res.json({
            ...response.data,
            guestQuota: reservedQuotaObj
        });
    } catch (error) {
        if (reserved) {
            await compensateQuota(req.guestId);
        }
        console.error('Chat Simple Proxy Error:', error.response?.data || error.message);
        _onProxyError('/chat/simple', error, start, userId);
        res.status(500).json({ message: 'Chat Simple failed', detail: error.response?.data?.detail || error.message });
    }
};

// @desc    Get Guest Quota data
// @route   GET /api/voice/guest-quota
exports.getGuestQuota = async (req, res) => {
    if (!req.isGuest) {
        return res.json({ messagesUsed: 0, limit: 5, sessionStarted: false });
    }
    try {
        const quota = await getGuestQuotaData(req.guestId);
        res.json(quota);
    } catch (err) {
        console.error('Failed to get guest quota:', err.message);
        res.status(503).json({ message: 'Service unavailable' });
    }
};

// @desc    Clear History Proxy
// @route   POST /api/voice/clear-history
exports.clearHistory = async (req, res) => {
    if (req.isGuest) {
        try {
            const quota = await getGuestQuotaData(req.guestId);
            if (quota && quota.sessionStarted) {
                return res.status(429).json({
                    message: 'Guest session already started. You cannot clear history or start a new session.',
                    detail: 'guest_quota_exceeded'
                });
            }
        } catch (err) {
            console.error('Failed to validate guest quota for clearHistory:', err.message);
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }
    try {
        const response = await axios.post(`${PYTHON_BACKEND_URL}/clear-history`, {}, { headers: pythonProxyHeaders(req) });
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
    let reservedQuotaObj = null;
    let reserved = false;

    if (req.isGuest) {
        try {
            reservedQuotaObj = await reserveQuota(req.guestId);
            reserved = true;
        } catch (err) {
            if (err.message === 'limit_exceeded') {
                return res.status(429).json({ message: 'Guest message limit exceeded. Please log in.', detail: 'guest_quota_exceeded' });
            }
            return res.status(503).json({ message: 'Service unavailable' });
        }
    }

    try {
        const { question } = req.body;
        // Frontend sends snake_case (chatbotApi.js's textToText/handleTranslate
        // build language_code/use_history), so those were the actual keys —
        // accepting camelCase too is just defensive, not the real fix.
        const languageCode = req.body.language_code ?? req.body.languageCode;
        const useHistory = req.body.use_history ?? req.body.useHistory;

        if (!question) {
            if (reserved) await compensateQuota(req.guestId);
            return res.status(400).json({ message: 'Question is required' });
        }

        console.log(`Forwarding T2T request to AI backend: "${question}"`);

        const response = await axios.post(`${PYTHON_BACKEND_URL}/text-to-text`, {
            question: question,
            // Not defaulted to 'en-IN' — same reasoning as speechToSpeech below:
            // null/undefined lets Python detect the question's own language and
            // translate the answer back into it, instead of always answering
            // in English when no language was explicitly picked.
            language_code: languageCode || null,
            use_history: useHistory !== false,
            user_id: userId
        }, { headers: pythonProxyHeaders(req) });

        res.json({
            answer: response.data.answer,
            original_question: response.data.original_question,
            detected_language: response.data.detected_language,
            sources: response.data.sources,
            validation: response.data.validation,
            guestQuota: reservedQuotaObj
        });

    } catch (error) {
        if (reserved) {
            await compensateQuota(req.guestId);
        }
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
        // Forward the real caller's own Authorization header so that, when
        // PYTHON_BACKEND_URL points at Hugging Face's public url (Render's
        // case), HF's own Node layer resolves the SAME real per-user identity
        // instead of treating every dashboard request as one shared guest.
        const summary = await bridgeMetrics.computeSummary(window, userId, req.headers.authorization);
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

// @desc    Deep Research Chat Proxy
// @route   POST /deepchat
exports.deepChat = async (req, res) => {
    const start = Date.now();
    const userId = getUserId(req);

    try {
        const response = await axios.post(
            `${PYTHON_BACKEND_URL}/deepchat`,
            req.body,
            {
                headers: pythonProxyHeaders(req),
                timeout: 300000 // 300 seconds (5 minutes) production-safe timeout
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('DeepChat Proxy Error:', error.response?.data || error.message);
        _onProxyError('/deepchat', error, start, userId);
        const status = error.response?.status || 500;
        const message = error.response?.data?.detail || error.response?.data?.message || 'Deep research proxy failed';
        res.status(status).json(error.response?.data || { message, detail: error.message });
    }
};

exports.healthCheck = async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_BACKEND_URL}/health`, { timeout: 5000, headers: pythonProxyHeaders(req) });
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

exports.pythonProxyHeaders = pythonProxyHeaders;

