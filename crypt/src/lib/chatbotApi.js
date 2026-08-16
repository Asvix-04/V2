import axios from 'axios';

const CHATBOT_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:5001/api/voice';
const PENDING_ERRORS_KEY = 'chatbot_pending_error_events';
const MAX_PENDING = 200;

// Don't report failures for these paths (would cause feedback loops)
const REPORT_BLACKLIST = ['/metrics/summary', '/metrics/event', '/health'];

// Auth header from localStorage so the bridge can attribute events to the
// correct user (per-user metrics). Empty object for guests.
function _authHeaders() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user && user.token) return { Authorization: `Bearer ${user.token}` };
        }
    } catch { /* ignore */ }
    return {};
}

// ── LocalStorage queue for offline failures ───────────────────────

function _readPending() {
    try {
        const raw = localStorage.getItem(PENDING_ERRORS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function _writePending(events) {
    try {
        const trimmed = events.slice(-MAX_PENDING);
        localStorage.setItem(PENDING_ERRORS_KEY, JSON.stringify(trimmed));
    } catch { /* localStorage full or disabled */ }
}

function _queuePending(event) {
    const existing = _readPending();
    existing.push(event);
    _writePending(existing);
}

async function _flushPending() {
    const pending = _readPending();
    if (pending.length === 0) return;
    try {
        await axios.post(`${CHATBOT_BASE_URL}/metrics/event`, pending, { timeout: 3000, headers: _authHeaders() });
        localStorage.removeItem(PENDING_ERRORS_KEY);
    } catch {
        /* bridge still unreachable, leave queue for next attempt */
    }
}

// ── Error classification & reporting ──────────────────────────────

function _classifyError(error) {
    if (!error) return { error: 'unknown', status_code: 503 };
    if (!error.response) {
        // No response from anywhere — "Network Error"
        return {
            error: error.code || error.message || 'network_error',
            status_code: 503,
        };
    }
    return {
        error: error.response.data?.detail || error.response.data?.message || error.message || `http_${error.response.status}`,
        status_code: error.response.status,
    };
}

async function _reportError(endpoint, error, startedAt) {
    const cls = _classifyError(error);
    const event = {
        endpoint,
        status_code: cls.status_code,
        error: cls.error,
        response_time_ms: Date.now() - startedAt,
    };
    try {
        await axios.post(`${CHATBOT_BASE_URL}/metrics/event`, event, { timeout: 2000, headers: _authHeaders() });
    } catch {
        _queuePending({ ...event, queued_at: new Date().toISOString() });
    }
}

// ── Axios client ──────────────────────────────────────────────────

const chatbotClient = axios.create({
    baseURL: CHATBOT_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: inject auth + stamp start time for latency
chatbotClient.interceptors.request.use(
    (config) => {
        config.metadata = { startedAt: Date.now() };
        const userStr = localStorage.getItem('user');
        let isGuest = true;
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && user.token) {
                    config.headers.Authorization = `Bearer ${user.token}`;
                    isGuest = false;
                }
            } catch (e) {
                console.error("Error parsing user from localStorage", e);
            }
        }
        if (isGuest) {
            let guestId = localStorage.getItem('digilab-guest-id');
            if (!guestId) {
                guestId = 'guest_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                localStorage.setItem('digilab-guest-id', guestId);
            }
            config.headers['X-Guest-ID'] = guestId;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor: when the BRIDGE itself didn't respond (Network Error),
// the bridge had no chance to record the failure — so we report it from here.
// When the bridge DID respond with a 4xx/5xx, the bridge (or Python) already
// recorded it, so we don't re-report.
chatbotClient.interceptors.response.use(
    (response) => response,
    (error) => {
        try {
            const url = error?.config?.url || '';
            const isBlacklisted = REPORT_BLACKLIST.some(p => url.includes(p));
            const bridgeDidRespond = !!error?.response;
            if (!isBlacklisted && !bridgeDidRespond) {
                const startedAt = error?.config?.metadata?.startedAt || Date.now();
                _reportError(url || 'unknown', error, startedAt);
            }
        } catch { /* never let reporting throw */ }
        return Promise.reject(error);
    }
);

// Try draining any queued errors on module load (e.g. after page reload)
if (typeof window !== 'undefined') {
    _flushPending();
}

// ── Public API ────────────────────────────────────────────────────

export const chatbotApi = {
    checkHealth: async () => {
        try {
            const response = await chatbotClient.get('/health', { timeout: 10000 });
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

    getMetricsSummary: async (window = '30d') => {
        try {
            const response = await chatbotClient.get(`/metrics/summary?window=${window}`);
            // Bridge replied — good moment to flush queued client errors
            _flushPending();
            return response.data;
        } catch (error) {
            console.error('Chatbot getMetricsSummary failed:', error);
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

    getGuestQuota: async () => {
        try {
            const response = await chatbotClient.get('/guest-quota');
            return response.data;
        } catch (error) {
            console.error('Chatbot getGuestQuota failed:', error);
            throw error;
        }
    },
};

export default chatbotApi;
