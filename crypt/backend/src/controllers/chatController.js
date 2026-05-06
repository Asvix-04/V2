const { getFirestore } = require('../config/db');

const CHAT_COLLECTION = 'chat_conversations';
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 1000;

let purgeWorker = null;

const parseNow = (req) => {
    const at = req.query.at;
    if (!at) return new Date();

    const parsed = new Date(at);
    if (Number.isNaN(parsed.getTime())) {
        return new Date();
    }
    return parsed;
};

const parseDate = (value) => {
    if (!value) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
};

const isSameDay = (value, now) => {
    const parsed = parseDate(value);
    if (!parsed) return false;

    return parsed.getFullYear() === now.getFullYear()
        && parsed.getMonth() === now.getMonth()
        && parsed.getDate() === now.getDate();
};

const formatDraftTitle = (messages = []) => {
    const firstUserMessage = messages.find((msg) => msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim());
    if (!firstUserMessage) return 'New Draft';

    const clean = firstUserMessage.content.trim().replace(/\s+/g, ' ');
    if (clean.length <= 52) return clean;
    return `${clean.slice(0, 52)}...`;
};

const isDraftArchived = (draft) => Boolean(draft?.archivedAt);

const isConversationExpired = (conversation, now) => {
    if (!conversation?.draftExpiresAt) return false;

    const expiresAt = parseDate(conversation.draftExpiresAt);
    if (!expiresAt) return false;

    return expiresAt.getTime() <= now.getTime();
};

const isDraftActive = (draft, now) => {
    if (!draft || isDraftArchived(draft)) return false;
    return !isConversationExpired(draft, now);
};

const isTodayConversation = (conversation, now) => {
    if (!conversation) return false;

    const activityAt = conversation.updatedAt || conversation.createdAt;
    if (!isSameDay(activityAt, now)) {
        return false;
    }

    return isDraftArchived(conversation) && !isConversationExpired(conversation, now);
};

const toSummary = (id, draft, now = new Date()) => {
    const messages = Array.isArray(draft.messages) ? draft.messages : [];
    const lastMessage = messages[messages.length - 1] || null;

    return {
        id,
        title: draft.title || formatDraftTitle(messages),
        updatedAt: draft.updatedAt,
        draftExpiresAt: draft.draftExpiresAt,
        archivedAt: draft.archivedAt || null,
        isDraftActive: isDraftActive(draft, now),
        messageCount: messages.length,
        lastMessage: lastMessage ? {
            role: lastMessage.role,
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
            createdAt: lastMessage.createdAt
        } : null
    };
};

const toConversation = (id, conversation, now = new Date()) => ({
    id,
    title: conversation.title || formatDraftTitle(conversation.messages),
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    draftExpiresAt: conversation.draftExpiresAt,
    archivedAt: conversation.archivedAt || null,
    isDraftActive: isDraftActive(conversation, now)
});

const purgeExpiredConversations = async ({ db = getFirestore(), userId = null, now = new Date() } = {}) => {
    const collection = db.collection(CHAT_COLLECTION);
    const snapshot = userId
        ? await collection.where('userId', '==', userId).get()
        : await collection.get();

    const activeConversations = [];
    const expiredIds = [];

    snapshot.docs.forEach((doc) => {
        const conversation = doc.data();

        if (userId && conversation.userId !== userId) {
            return;
        }

        if (isConversationExpired(conversation, now)) {
            expiredIds.push(doc.id);
            return;
        }

        activeConversations.push({
            id: doc.id,
            ...conversation
        });
    });

    if (expiredIds.length > 0) {
        await Promise.all(expiredIds.map((id) => collection.doc(id).delete()));
    }

    return {
        activeConversations,
        deletedCount: expiredIds.length
    };
};

const startDraftPurgeWorker = () => {
    if (purgeWorker) {
        return;
    }

    const runPurge = async () => {
        try {
            const { deletedCount } = await purgeExpiredConversations();
            if (deletedCount > 0) {
                console.log(`Purged ${deletedCount} expired chat conversation(s)`);
            }
        } catch (error) {
            console.error('Draft purge worker error:', error);
        }
    };

    runPurge();
    purgeWorker = setInterval(runPurge, PURGE_INTERVAL_MS);

    if (typeof purgeWorker.unref === 'function') {
        purgeWorker.unref();
    }
};

// @desc    Get all active drafts for authenticated user
// @route   GET /api/chat/drafts
// @access  Private
exports.listDrafts = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);

        const { activeConversations } = await purgeExpiredConversations({ db, userId: req.user.id, now });

        const drafts = activeConversations
            .filter((draft) => isDraftActive(draft, now))
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .map((draft) => toSummary(draft.id, draft, now));

        res.json({ drafts });
    } catch (error) {
        console.error('List drafts error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all non-draft conversations updated today for authenticated user
// @route   GET /api/chat/conversations/today
// @access  Private
exports.listTodayConversations = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);

        const { activeConversations } = await purgeExpiredConversations({ db, userId: req.user.id, now });

        const conversations = activeConversations
            .filter((conversation) => isTodayConversation(conversation, now))
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .map((conversation) => toSummary(conversation.id, conversation, now));

        res.json({ conversations });
    } catch (error) {
        console.error('List today conversations error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get one conversation by id
// @route   GET /api/chat/conversations/:id
// @access  Private
exports.getConversationById = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);
        const collection = db.collection(CHAT_COLLECTION);
        const conversationDoc = await collection.doc(req.params.id).get();

        if (!conversationDoc.exists) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        const conversation = conversationDoc.data();
        if (conversation.userId !== req.user.id) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        if (isConversationExpired(conversation, now)) {
            await collection.doc(req.params.id).delete();
            return res.status(404).json({ message: 'Conversation not found' });
        }

        res.json({
            conversation: toConversation(conversationDoc.id, conversation, now)
        });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get one active draft conversation
// @route   GET /api/chat/drafts/:id
// @access  Private
exports.getDraftById = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);
        const collection = db.collection(CHAT_COLLECTION);
        const draftDoc = await collection.doc(req.params.id).get();

        if (!draftDoc.exists) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        const draft = draftDoc.data();
        if (draft.userId !== req.user.id) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        if (isConversationExpired(draft, now)) {
            await collection.doc(req.params.id).delete();
            return res.status(404).json({ message: 'Draft not found' });
        }

        if (!isDraftActive(draft, now)) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        res.json({
            draft: toConversation(draftDoc.id, draft, now)
        });
    } catch (error) {
        console.error('Get draft error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Archive an active draft so it moves out of Drafts and into Today
// @route   POST /api/chat/drafts/:id/archive
// @access  Private
exports.archiveDraft = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);
        const nowIso = now.toISOString();

        const ref = db.collection(CHAT_COLLECTION).doc(req.params.id);
        const existingDoc = await ref.get();

        if (!existingDoc.exists) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        const existing = existingDoc.data();
        if (existing.userId !== req.user.id) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        if (isConversationExpired(existing, now)) {
            await ref.delete();
            return res.status(404).json({ message: 'Draft not found' });
        }

        const archivedConversation = {
            ...existing,
            archivedAt: existing.archivedAt || nowIso
        };

        await ref.set({ archivedAt: archivedConversation.archivedAt }, { merge: true });

        res.json({
            conversation: toConversation(existingDoc.id, archivedConversation, now),
            summary: toSummary(existingDoc.id, archivedConversation, now)
        });
    } catch (error) {
        console.error('Archive draft error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Append a message to a draft or create a new draft
// @route   POST /api/chat/drafts/message
// @access  Private
exports.appendDraftMessage = async (req, res) => {
    try {
        const { draftId, message } = req.body;

        if (!message || typeof message.content !== 'string' || !message.content.trim()) {
            return res.status(400).json({ message: 'Message content is required' });
        }

        if (!['user', 'assistant'].includes(message.role)) {
            return res.status(400).json({ message: 'Message role must be user or assistant' });
        }

        const now = parseNow(req);
        const nowIso = now.toISOString();
        const draftExpiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();

        const db = getFirestore();
        const collection = db.collection(CHAT_COLLECTION);

        await purgeExpiredConversations({ db, userId: req.user.id, now });

        let ref;
        let existing = null;

        if (draftId) {
            ref = collection.doc(draftId);
            const existingDoc = await ref.get();

            if (!existingDoc.exists) {
                return res.status(404).json({ message: 'Draft not found' });
            }

            existing = existingDoc.data();
            if (existing.userId !== req.user.id) {
                return res.status(404).json({ message: 'Draft not found' });
            }

            if (isConversationExpired(existing, now)) {
                await ref.delete();
                return res.status(404).json({ message: 'Draft not found' });
            }
        } else {
            ref = collection.doc();
        }

        const persistedMessage = {
            role: message.role,
            content: message.content.trim(),
            timestamp: message.timestamp || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: nowIso
        };

        const currentMessages = Array.isArray(existing?.messages) ? existing.messages : [];
        const messages = [...currentMessages, persistedMessage];

        const payload = {
            userId: req.user.id,
            messages,
            title: existing?.title || formatDraftTitle(messages),
            createdAt: existing?.createdAt || nowIso,
            updatedAt: nowIso,
            draftExpiresAt,
            archivedAt: null
        };

        await ref.set(payload, { merge: true });

        const savedDraft = {
            id: ref.id,
            ...payload
        };

        res.status(existing ? 200 : 201).json({
            draft: toConversation(savedDraft.id, savedDraft, now),
            summary: toSummary(savedDraft.id, savedDraft, now)
        });
    } catch (error) {
        console.error('Append draft message error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports.startDraftPurgeWorker = startDraftPurgeWorker;
