const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/authMiddleware');
const { checkResearchQuota } = require('../middleware/quotaMiddleware');
const { pythonProxyHeaders } = require('../controllers/voiceController');
const DeepResearchUsage = require('../models/DeepResearchUsage');
const { getFirestore } = require('../config/db');

const formatDate = (date) => {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
};

// generateMockReport removed to ensure real research execution;

const getQuotaStatus = async (req, res) => {
    try {
        const activeLogs = await DeepResearchUsage.findActiveInWindow(req.user.id);
        const limit = 3;
        const used = activeLogs.length;
        const remaining = Math.max(0, limit - used);
        const allowed = remaining > 0;

        let renewAt = null;
        let message = `Deep Research remaining: ${remaining} of ${limit} this month.`;

        if (used >= limit) {
            const oldestLog = activeLogs[0];
            const renewDate = new Date(oldestLog.requestedAt);
            renewDate.setDate(renewDate.getDate() + 30);
            // renewDate.setMinutes(renewDate.getMinutes() + 2);
            renewAt = renewDate.toISOString();
            message = `Monthly Deep Research limit reached. Your quota renews on ${formatDate(renewDate)}.`;
        }

        res.json({
            allowed,
            used,
            remaining,
            limit,
            renewAt,
            message
        });
    } catch (error) {
        console.error('Error fetching research status:', error.message);
        res.status(500).json({ message: error.message });
    }
};

router.get('/status', protect, getQuotaStatus);
router.get('/quota', protect, getQuotaStatus);

// @desc    Generate Deep Research report & validate monthly quota (Uses Firestore transaction to avoid concurrency double spend)
// @route   POST /api/research/generate
// @access  Private
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

router.post('/generate', protect, checkResearchQuota, async (req, res) => {
    const { topic, language_code } = req.body;

    if (!topic || !topic.trim()) {
        return res.status(400).json({ message: 'Research topic is required' });
    }

    const db = getFirestore();
    if (!db) {
        return res.status(500).json({ message: 'Database client not initialized' });
    }

    const usageRef = db.collection('deep_research_usage');
    const limit = 3;
    let newDocId = null;

    try {
        // Run atomic quota check & log creation in a transaction to prevent race conditions
        await db.runTransaction(async (transaction) => {
            const queryRef = usageRef.where('userId', '==', req.user.id);
            const snapshot = await transaction.get(queryRef);

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const activeLogs = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    const requestedAt = (data.requestedAt && data.requestedAt.toDate)
                        ? data.requestedAt.toDate()
                        : new Date(data.requestedAt || Date.now());
                    return { id: doc.id, ...data, requestedAt };
                })
                .filter(log => log.requestedAt >= thirtyDaysAgo);

            if (activeLogs.length >= limit) {
                const error = new Error('Quota exceeded during concurrent submit');
                error.code = 'LIMIT_EXCEEDED';
                error.activeLogs = activeLogs;
                throw error;
            }

            // Create new usage entry inside transaction
            const newDocRef = usageRef.doc();
            newDocId = newDocRef.id;
            transaction.create(newDocRef, {
                userId: req.user.id,
                requestedAt: new Date(),
                createdAt: new Date()
            });
        });

        let data;
        try {
            // Service-to-service call to FastAPI backend
            const response = await axios.post(`${PYTHON_BACKEND_URL}/deepchat`, {
                question: topic,
                use_history: false,
                model: null,
                language_code: language_code || null
            }, {
                headers: pythonProxyHeaders(req),
                timeout: 300000 // 300 seconds (5 minutes) production-safe timeout
            });

            data = response.data;
            if (!data || !data.answer) {
                throw new Error('Downstream research service returned an empty answer');
            }
        } catch (apiError) {
            // Compensate/Rollback the quota decrement for this request since generation failed
            if (newDocId) {
                try {
                    await db.collection('deep_research_usage').doc(newDocId).delete();
                    console.log(`[Deep Research] Rolled back quota entry ${newDocId} due to API/Timeout failure`);
                } catch (rollbackError) {
                    console.error('[Deep Research] Failed to rollback quota entry:', rollbackError.message);
                }
            }
            throw apiError; // rethrow to handle in outer catch block
        }

        // Fetch updated quota status after successful transaction commit
        const updatedLogs = await DeepResearchUsage.findActiveInWindow(req.user.id);
        const used = updatedLogs.length;
        const remaining = Math.max(0, limit - used);
        const allowed = remaining > 0;

        let renewAt = null;
        let message = `Deep Research remaining: ${remaining} of ${limit} this month.`;

        if (used >= limit) {
            const oldestLog = updatedLogs[0];
            const renewDate = new Date(oldestLog.requestedAt);
            renewDate.setDate(renewDate.getDate() + 30);
            renewAt = renewDate.toISOString();
            message = `Monthly Deep Research limit reached. Your quota renews on ${formatDate(renewDate)}.`;
        }

        res.json({
            answer: data.answer,
            sources: data.sources,
            web_sources: data.web_sources,
            sub_questions: data.sub_questions,
            layer_trace: data.layer_trace,
            allowed,
            used,
            remaining,
            limit,
            renewAt,
            message
        });

    } catch (error) {
        if (error.code === 'LIMIT_EXCEEDED') {
            const oldestLog = error.activeLogs.sort((a, b) => a.requestedAt - b.requestedAt)[0];
            const renewDate = new Date(oldestLog.requestedAt);
            renewDate.setDate(renewDate.getDate() + 30);    

            return res.status(429).json({
                message: `Monthly Deep Research limit reached. Your quota renews on ${formatDate(renewDate)}.`,
                allowed: false,
                used: error.activeLogs.length,
                remaining: 0,
                limit,
                renewAt: renewDate.toISOString()
            });
        }

        console.error('[Deep Research] Error generating deep research:', error.message);

        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return res.status(504).json({ message: 'Downstream research service timed out. Please try again later.' });
            }
            if (error.code === 'ECONNREFUSED' || !error.response) {
                return res.status(502).json({ message: 'Downstream research service is currently unavailable. Please try again later.' });
            }
            const status = error.response.status;
            const message = error.response.data?.detail || error.response.data?.message || 'Downstream research service error';
            return res.status(status >= 400 && status < 500 ? status : 502).json({ message });
        }

        res.status(500).json({ message: error.message || 'Unexpected server error occurred during Deep Research generation.' });
    }
});

const ResearchSession = require('../models/ResearchSession');

// @desc    Get all research sessions for the logged-in user
// @route   GET /api/research/sessions
// @access  Private
router.get('/sessions', protect, async (req, res) => {
    try {
        const sessions = await ResearchSession.findByUserId(req.user.id);
        res.json(sessions.map((session) => session.toJSON()));
    } catch (error) {
        console.error('Fetch research sessions error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Save or update a research session
// @route   POST /api/research/sessions
// @access  Private
router.post('/sessions', protect, async (req, res) => {
    try {
        const { id, title, messages, createdAt } = req.body;
        if (!id) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        const session = await ResearchSession.save({
            id,
            title,
            messages,
            createdAt
        }, req.user.id);

        res.json(session.toJSON());
    } catch (error) {
        console.error('Save research session error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Delete a research session
// @route   DELETE /api/research/sessions/:id
// @access  Private
router.delete('/sessions/:id', protect, async (req, res) => {
    try {
        const success = await ResearchSession.delete(req.params.id, req.user.id);
        if (success) {
            res.json({ message: 'Research session deleted successfully' });
        } else {
            res.status(404).json({ message: 'Research session not found or unauthorized' });
        }
    } catch (error) {
        console.error('Delete research session error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
