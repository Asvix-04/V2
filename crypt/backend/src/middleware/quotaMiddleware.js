const DeepResearchUsage = require('../models/DeepResearchUsage');

const formatDate = (date) => {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
};

const checkResearchQuota = async (req, res, next) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Not authorized, user context missing' });
    }

    try {
        const activeLogs = await DeepResearchUsage.findActiveInWindow(req.user.id);
        const limit = 3;
        const used = activeLogs.length;

        if (used >= limit) {
            // Calculate renewal date based on oldest log in the active 30-day window
            const oldestLog = activeLogs[0];
            const renewAt = new Date(oldestLog.requestedAt);
            renewAt.setDate(renewAt.getDate() + 30);
            // renewAt.setMinutes(renewAt.getMinutes() + 2);

            const formattedDate = formatDate(renewAt);
            return res.status(429).json({
                message: `Monthly Deep Research limit reached. Your quota renews on ${formattedDate}.`,
                allowed: false,
                used,
                remaining: 0,
                limit,
                renewAt: renewAt.toISOString()
            });
        }

        // Expose quota information on the request object for usage inside endpoints
        req.quota = {
            allowed: true,
            used,
            remaining: limit - used,
            limit
        };

        next();
    } catch (error) {
        console.error('Quota validation middleware error:', error.message);
        res.status(500).json({ message: 'Quota validation failed', detail: error.message });
    }
};

module.exports = { checkResearchQuota };
