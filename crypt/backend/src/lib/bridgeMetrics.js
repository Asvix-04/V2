/**
 * bridgeMetrics.js — Bridge-side metrics layer.
 *
 * Why this exists:
 *   - When the Python backend is DOWN, its /metrics/summary endpoint is
 *     unreachable, so the dashboard goes blank. That's bad UX.
 *   - More importantly: failures that happen while Python is down can't be
 *     recorded by Python itself.
 *
 * What this module does:
 *   1. Records failures the bridge observes (Python unreachable) into a local
 *      log file using the SAME record schema as metrics_logger.py.
 *   2. Records frontend-reported failures (Network Error) into the same log.
 *   3. Provides a self-contained summary function that reads BOTH files
 *      (Python's data/metrics.jsonl + bridge's bridge_metrics.jsonl) and
 *      computes the dashboard payload — so the page works even when Python
 *      is dead.
 *
 * Schema match (so merging is just a concat):
 *   { timestamp, endpoint, status_code, response_time_ms, model,
 *     on_topic, has_sources, error }
 */

const fs = require('fs');
const path = require('path');

// Python writes to: <repo>/Backend_chatbot/data/metrics.jsonl
const PYTHON_METRICS_FILE = path.resolve(
    __dirname, '..', '..', '..', '..', 'Backend_chatbot', 'data', 'metrics.jsonl'
);

// Bridge appends to: <repo>/crypt/backend/bridge_metrics.jsonl
const BRIDGE_METRICS_FILE = path.resolve(
    __dirname, '..', '..', 'bridge_metrics.jsonl'
);

// ── Recording ─────────────────────────────────────────────────────

function _istIsoNow() {
    // Match metrics_logger.py: UTC + 5:30 offset, no "Z"
    const ist = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
    return ist.toISOString().replace('Z', '+05:30');
}

function recordFailure({ endpoint, status_code = 503, response_time_ms = 0, model = 'unknown', error = 'backend_unreachable', source = 'bridge', user_id = 'guest' }) {
    const record = {
        timestamp: _istIsoNow(),
        endpoint: endpoint || 'unknown',
        status_code,
        response_time_ms: Math.round((response_time_ms || 0) * 100) / 100,
        model,
        on_topic: true,
        has_sources: false,
        error,
        source,  // "bridge" or "client" — for our own debugging, ignored by summary
        user_id: user_id || 'guest',
    };
    try {
        fs.appendFileSync(BRIDGE_METRICS_FILE, JSON.stringify(record) + '\n', 'utf-8');
    } catch (e) {
        console.error('bridgeMetrics: write failed', e.message);
    }
    return record;
}

// ── Reading ───────────────────────────────────────────────────────

function _readJsonl(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const text = fs.readFileSync(file, 'utf-8');
        const records = [];
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                records.push(JSON.parse(trimmed));
            } catch { /* skip malformed lines */ }
        }
        return records;
    } catch (e) {
        console.error(`bridgeMetrics: read failed ${file}:`, e.message);
        return [];
    }
}

function _parseTs(ts) {
    if (!ts) return null;
    // Accept both "...+05:30" and "...Z"
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d;
}

function _readAllRecords() {
    const python = _readJsonl(PYTHON_METRICS_FILE);
    const bridge = _readJsonl(BRIDGE_METRICS_FILE);
    // Concatenate — both share the same schema.
    return python.concat(bridge);
}

// ── Summary computation (mirrors metrics_logger.get_metrics_summary) ──

function _windowStart(window) {
    const now = Date.now();
    switch (window) {
        case '24h': return new Date(now - 24 * 3600 * 1000);
        case '7d':  return new Date(now - 7 * 86400 * 1000);
        case '30d':
        default:    return new Date(now - 30 * 86400 * 1000);
    }
}

function computeSummary(window = '30d', userId = null) {
    const all = _readAllRecords();
    if (all.length === 0) {
        return {
            total_questions: 0,
            avg_response_time: 0.0,
            success_rate: 0.0,
            failure_rate: 0.0,
            grounding_rate: 0.0,
            on_topic_rate: 0.0,
            status: 'no_data',
            history: [],
            health_history: [],
            health_pct_change: 0,
        };
    }

    const start = _windowStart(window);

    // Per-user filtering: when a userId is provided, only that user's records
    // count. Records logged before per-user tracking (no user_id) are excluded
    // from any specific user's view — each user effectively starts fresh.
    const records = [];
    for (const r of all) {
        const ts = _parseTs(r.timestamp);
        if (!ts || ts < start) continue;
        if (userId && (r.user_id || 'guest') !== userId) continue;
        records.push({ ...r, _ts: ts });
    }
    records.sort((a, b) => a._ts - b._ts);

    if (records.length === 0) {
        return {
            total_questions: 0,
            avg_response_time: 0.0,
            success_rate: 0.0,
            failure_rate: 0.0,
            grounding_rate: 0.0,
            on_topic_rate: 0.0,
            status: 'empty_window',
            history: [],
            health_history: [],
            health_pct_change: 0,
        };
    }

    const total = records.length;
    const successes = records.filter(r => r.status_code >= 200 && r.status_code < 300);
    const failures  = records.filter(r => r.status_code >= 400);
    const chat = records.filter(r => r.endpoint === '/chat');
    const totalChat = chat.length;

    const avgMs = records.reduce((s, r) => s + (r.response_time_ms || 0), 0) / total;

    const success_rate = total > 0 ? (successes.length / total) * 100 : 0;
    const failure_rate = total > 0 ? (failures.length  / total) * 100 : 0;

    const grounding_rate = totalChat > 0
        ? (chat.filter(r => r.has_sources).length / totalChat) * 100
        : 0;
    const on_topic_rate = totalChat > 0
        ? (chat.filter(r => r.on_topic).length / totalChat) * 100
        : 0;

    // Format a Date object in IST (UTC+5:30) — matches metrics_logger.py
    function _fmtIst(d, withSeconds = false) {
        try {
            const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
            const hh = String(ist.getUTCHours()).padStart(2, '0');
            const mm = String(ist.getUTCMinutes()).padStart(2, '0');
            if (!withSeconds) return `${hh}:${mm}`;
            const ss = String(ist.getUTCSeconds()).padStart(2, '0');
            return `${hh}:${mm}:${ss}`;
        } catch { return 'Now'; }
    }

    // health_history (last 20 records)
    const health_history = records.slice(-20).map(r => {
        let health = 100;
        if (r.status_code >= 400) health -= 40;
        if ((r.response_time_ms || 0) > 2000) {
            const penalty = Math.min(30, ((r.response_time_ms - 2000) / 100));
            health -= penalty;
        }
        health = Math.max(0, health);
        return {
            time: _fmtIst(r._ts, true),
            health: Math.round(health * 10) / 10,
            is_error: r.status_code >= 400,
        };
    });

    // Trend history (last 10 /chat)
    const history = chat.slice(-10).map(r => ({
        name: _fmtIst(r._ts, false),
        aiResponseTime: Math.round((r.response_time_ms / 1000) * 100) / 100,
        networkLatency: Math.round(((r.response_time_ms * 0.1) / 1000) * 100) / 100,
    }));

    // Health % change (last 5 vs prior 5)
    let pct_change = 0;
    if (health_history.length >= 10) {
        const prev = health_history.slice(-10, -5).reduce((s, h) => s + h.health, 0) / 5;
        const curr = health_history.slice(-5).reduce((s, h) => s + h.health, 0) / 5;
        if (prev > 0) pct_change = ((curr - prev) / prev) * 100;
    }

    return {
        total_questions: totalChat,
        avg_response_time: Math.round((avgMs / 1000) * 100) / 100,
        success_rate: Math.round(success_rate * 10) / 10,
        failure_rate: Math.round(failure_rate * 10) / 10,
        grounding_rate: Math.round(grounding_rate * 10) / 10,
        on_topic_rate: Math.round(on_topic_rate * 10) / 10,
        history,
        health_history,
        health_pct_change: Math.round(pct_change * 10) / 10,
        status: success_rate > 95 ? 'operational' : (failure_rate > 0 ? 'outage' : 'operational'),
        // Diagnostic — helpful when debugging
        _sources: {
            python_file: PYTHON_METRICS_FILE,
            python_file_exists: fs.existsSync(PYTHON_METRICS_FILE),
            bridge_file: BRIDGE_METRICS_FILE,
            bridge_file_exists: fs.existsSync(BRIDGE_METRICS_FILE),
        },
    };
}

module.exports = {
    recordFailure,
    computeSummary,
    PYTHON_METRICS_FILE,
    BRIDGE_METRICS_FILE,
};
