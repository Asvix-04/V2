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
    baseURL: import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:5001/api/voice',
    timeout: 120000,
    headers: {
        'Content-Type': 'application/json',
    },
});

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const apiClient = axios.create({
    baseURL: apiBaseUrl,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

async function checkNodeHealth() {
    const probes = [
        () => apiClient.get('/health'),
        () => apiClient.get('/status'),
        () => axios.get(`${apiBaseUrl.replace(/\/api\/?$/, '')}/health`, { timeout: 10000 }),
        () => axios.get(`${apiBaseUrl.replace(/\/api\/?$/, '')}/status`, { timeout: 10000 }),
    ];

    let lastError = null;
    for (const probe of probes) {
        try {
            return await probe();
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };

    const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            if (user && user.token) {
                headers.Authorization = `Bearer ${user.token}`;
            }
        } catch (e) {
            console.error("Error parsing user from localStorage", e);
        }
    }

    return headers;
}

function extractDeltaFromSseLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const payload = trimmed.startsWith('data:')
        ? trimmed.slice(5).trim()
        : trimmed;

    if (!payload || payload === '[DONE]') {
        return { done: true };
    }

    try {
        const parsed = JSON.parse(payload);
        if (parsed.error) return { error: parsed.error };
        if (parsed.done) return { done: true, response: parsed.response || null };
        return { delta: parsed.delta ?? parsed.text ?? parsed.content ?? '' };
    } catch {
        return { delta: payload };
    }
}

// Request interceptor: inject auth + stamp start time for latency
chatbotClient.interceptors.request.use(
    (config) => {
        config.metadata = { startedAt: Date.now() };
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
        const status = {
            node: false,
            ai: false,
            status: 'offline',
            message: 'Backend not connected',
        };

        try {
            await checkNodeHealth();
            status.node = true;
        } catch (error) {
            try {
                await chatbotClient.get('/health');
                status.node = true;
            } catch (voiceHealthError) {
                if (voiceHealthError.response) {
                    status.node = true;
                    return {
                        ...status,
                        status: 'degraded',
                        message: 'AI service unavailable',
                        detail: voiceHealthError.response?.data?.detail || voiceHealthError.response?.data?.message || voiceHealthError.message,
                    };
                }
                console.error('Node health check failed:', error);
                throw Object.assign(error, { healthStatus: status });
            }
        }

        try {
            const response = await chatbotClient.get('/health');
            status.ai = response.data?.status === 'healthy' || response.data?.status === 'ok';
            status.status = status.ai ? 'ok' : 'degraded';
            status.message = status.ai ? 'Connected' : 'AI service unavailable';
            return { ...response.data, ...status };
        } catch (error) {
            console.error('AI health check failed:', error);
            return {
                ...status,
                status: 'degraded',
                message: 'AI service unavailable',
                detail: error.response?.data?.detail || error.response?.data?.message || error.message,
            };
        }
    },

    sendMessage: async (question, model = null, useHistory = true, signal = null) => {
        try {
            const response = await chatbotClient.post('/chat', {
                question,
                model,
                use_history: useHistory,
            }, signal ? { signal } : undefined);
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

    syncHistory: async (history = []) => {
        try {
            const response = await chatbotClient.post('/history/sync', {
                history,
            });
            return response.data;
        } catch (error) {
            console.error('Chatbot syncHistory failed:', error);
            throw error;
        }
    },

    speechToSpeech: async (audioBase64, mimeType, responseLanguageCode = null, useHistory = true, model = null, signal = null) => {
        try {
            const payload = {
                audio_base64: audioBase64,
                mime_type: mimeType,
                response_language_code: responseLanguageCode,
                use_history: useHistory,
            };
            if (model) payload.model = model;
            const response = await chatbotClient.post('/speech-to-speech', payload, signal ? { signal } : undefined);
            return response.data;
        } catch (error) {
            console.error('Chatbot speechToSpeech failed:', error);
            throw error;
        }
    },

    sendMessageStreaming: async ({
        question,
        model = null,
        useHistory = true,
        signal = null,
        onChunk,
        onDone,
    }) => {
        const url = `${chatbotClient.defaults.baseURL.replace(/\/$/, '')}/chat?stream=true`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                question,
                model,
                use_history: useHistory,
            }),
            signal,
        });

        if (!response.ok || !response.body) {
            throw new Error(`Streaming unsupported: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
            throw new Error(`Streaming unsupported content type: ${contentType}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResponse = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() || '';

            for (const part of parts) {
                const parsed = extractDeltaFromSseLine(part);
                if (!parsed) continue;
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.done) {
                    finalResponse = parsed.response || finalResponse;
                    continue;
                }
                if (parsed.delta) onChunk?.(parsed.delta);
            }
        }

        if (buffer.trim()) {
            const parsed = extractDeltaFromSseLine(buffer);
            if (parsed?.error) throw new Error(parsed.error);
            if (parsed?.done) finalResponse = parsed.response || finalResponse;
            if (parsed?.delta) onChunk?.(parsed.delta);
        }

        onDone?.(finalResponse);
        return finalResponse;
    },

    speechToSpeechText: async (text, responseLanguageCode = null, useHistory = true, model = null, signal = null) => {
        try {
            const payload = {
                text,
                response_language_code: responseLanguageCode,
                use_history: useHistory,
            };
            if (model) payload.model = model;
            const response = await chatbotClient.post('/speech-to-speech', payload, signal ? { signal } : undefined);
            return response.data;
        } catch (error) {
            console.error('Chatbot speechToSpeechText failed:', error);
            throw error;
        }
    },

    textToText: async (question, languageCode = null, model = null, useHistory = true, signal = null) => {
        try {
            const payload = { question, use_history: useHistory };
            if (languageCode) payload.language_code = languageCode;
            if (model) payload.model = model;
            const response = await chatbotClient.post('/text-to-text', payload, signal ? { signal } : undefined);
            return response.data;
        } catch (error) {
            console.error('Chatbot textToText failed:', error);
            throw error;
        }
    },
};

export default chatbotApi;
