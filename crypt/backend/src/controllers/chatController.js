const { getFirestore } = require('../config/db');

const CHAT_COLLECTION = 'chat_conversations';
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

const parseNow = (req) => {
    const at = req.query.at;
    if (!at) return new Date();

    const parsed = new Date(at);
    if (Number.isNaN(parsed.getTime())) {
        return new Date();
    }
    return parsed;
};

const formatDraftTitle = (messages = []) => {
    const firstUserMessage = messages.find((msg) => msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim());
    if (!firstUserMessage) return 'New Draft';

    const clean = firstUserMessage.content.trim().replace(/\s+/g, ' ');
    if (clean.length <= 52) return clean;
    return `${clean.slice(0, 52)}...`;
};

const toSummary = (id, draft) => {
    const messages = Array.isArray(draft.messages) ? draft.messages : [];
    const lastMessage = messages[messages.length - 1] || null;

    return {
        id,
        title: draft.title || formatDraftTitle(messages),
        updatedAt: draft.updatedAt,
        draftExpiresAt: draft.draftExpiresAt,
        messageCount: messages.length,
        lastMessage: lastMessage ? {
            role: lastMessage.role,
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
            createdAt: lastMessage.createdAt
        } : null
    };
};

const isDraftActive = (draft, now) => {
    if (!draft || !draft.draftExpiresAt) return false;
    const expiresAt = new Date(draft.draftExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) return false;
    return expiresAt.getTime() > now.getTime();
};

// @desc    Get all active drafts for authenticated user
// @route   GET /api/chat/drafts
// @access  Private
exports.listDrafts = async (req, res) => {
    try {
        const db = getFirestore();
        const now = parseNow(req);

        const snapshot = await db.collection(CHAT_COLLECTION)
            .where('userId', '==', req.user.id)
            .get();

        const drafts = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((draft) => isDraftActive(draft, now))
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .map((draft) => toSummary(draft.id, draft));

        res.json({ drafts });
    } catch (error) {
        console.error('List drafts error:', error);
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
        const draftDoc = await db.collection(CHAT_COLLECTION).doc(req.params.id).get();

        if (!draftDoc.exists) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        const draft = draftDoc.data();
        if (draft.userId !== req.user.id) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        if (!isDraftActive(draft, now)) {
            return res.status(404).json({ message: 'Draft not found' });
        }

        res.json({
            draft: {
                id: draftDoc.id,
                title: draft.title || formatDraftTitle(draft.messages),
                messages: Array.isArray(draft.messages) ? draft.messages : [],
                createdAt: draft.createdAt,
                updatedAt: draft.updatedAt,
                draftExpiresAt: draft.draftExpiresAt
            }
        });
    } catch (error) {
        console.error('Get draft error:', error);
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
            draftExpiresAt
        };

        await ref.set(payload, { merge: true });

        const savedDraft = {
            id: ref.id,
            ...payload
        };

        res.status(existing ? 200 : 201).json({
            draft: {
                id: savedDraft.id,
                title: savedDraft.title,
                messages: savedDraft.messages,
                createdAt: savedDraft.createdAt,
                updatedAt: savedDraft.updatedAt,
                draftExpiresAt: savedDraft.draftExpiresAt
            },
            summary: toSummary(savedDraft.id, savedDraft)
        });
    } catch (error) {
        console.error('Append draft message error:', error);
        res.status(500).json({ message: error.message });
    }
};
