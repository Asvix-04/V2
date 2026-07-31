const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkResearchQuota } = require('../middleware/quotaMiddleware');
const DeepResearchUsage = require('../models/DeepResearchUsage');
const { getFirestore } = require('../config/db');

const formatDate = (date) => {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
};

const generateMockReport = (topic) =>
    `# Autonomous Research Report: ${topic}

## Executive Summary
This research brief compiles the current state of knowledge regarding **${topic}**, synthesizing literature from academic journals, citation indexings, and clinical or technical trial reports.

## Key Technical Dimensions
### 1. Conceptual Architecture & Foundations
Contemporary frameworks highlight the integration of highly localized variables to achieve optimized system throughput. In the context of **${topic}**, key foundational variables include:
* **Algorithmic Adaptability:** Systems show high resilience under variable load thresholds.
* **Cognitive Integration:** Contextual engines perform semantic mapping with high structural coherence.

### 2. Empirical Findings & Benchmarks
Recent comparative studies indicate a substantial paradigm shift towards autonomous evaluation:
1. **Performance Index:** Accelerated workloads demonstrate up to a 34% reduction in end-to-end latency.
2. **Resource Alignment:** Dynamic memory allocation maps show improved spatial density.
3. **Accuracy Benchmarks:** Standard benchmarks report a $p$-value of $< 0.05$ across multi-modal benchmarks.

### 3. Open Challenges & Scientific Gaps
* **Constraint Boundaries:** Scalability decreases proportionally when subject to extreme localized noise.
* **Ethics & Bias:** Computational alignment requires rigorous auditing to mitigate model alignment drift.

---

## Academic References & Sources
1. *International Journal of Advanced Computation & ${topic}* (2025). [Link: https://scholar.google.com]
2. *Empirical Review on ${topic} Foundations*, Vol. 88, pp. 210-230. [Link: https://arxiv.org]
3. *National Institute of Scientific Engineering & Synthesis Reports* (2026). [Link: https://www.science.org]`;

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
            // renewDate.setDate(renewDate.getDate() + 30);
            renewDate.setMinutes(renewDate.getMinutes() + 2);
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
router.post('/generate', protect, checkResearchQuota, async (req, res) => {
    const { topic } = req.body;

    if (!topic || !topic.trim()) {
        return res.status(400).json({ message: 'Research topic is required' });
    }

    const db = getFirestore();
    if (!db) {
        return res.status(500).json({ message: 'Database client not initialized' });
    }

    const usageRef = db.collection('deep_research_usage');
    const limit = 3;

    try {
        // Run atomic quota check & log creation in a transaction to prevent race conditions
        await db.runTransaction(async (transaction) => {
            const queryRef = usageRef.where('userId', '==', req.user.id);
            const snapshot = await transaction.get(queryRef);

            const thirtyDaysAgo = new Date();
            // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setMinutes(thirtyDaysAgo.getMinutes() - 2);

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
            transaction.create(newDocRef, {
                userId: req.user.id,
                requestedAt: new Date(),
                createdAt: new Date()
            });
        });

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
            // renewDate.setDate(renewDate.getDate() + 30);
            renewDate.setMinutes(renewDate.getMinutes() + 2);
            renewAt = renewDate.toISOString();
            message = `Monthly Deep Research limit reached. Your quota renews on ${formatDate(renewDate)}.`;
        }

        // Generate mock RAG report content
        const reportText = generateMockReport(topic);

        res.json({
            answer: reportText,
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
            // renewDate.setDate(renewDate.getDate() + 30);
            renewDate.setMinutes(renewDate.getMinutes() + 2);

            return res.status(429).json({
                message: `Monthly Deep Research limit reached. Your quota renews on ${formatDate(renewDate)}.`,
                allowed: false,
                used: error.activeLogs.length,
                remaining: 0,
                limit,
                renewAt: renewDate.toISOString()
            });
        }

        console.error('Error generating deep research:', error.message);
        res.status(500).json({ message: error.message });
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
