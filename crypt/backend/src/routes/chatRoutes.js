const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Unique filename: fieldname-timestamp.ext
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// File Filter (Optional: limit types)
const fileFilter = (req, file, cb) => {
    // Accept all for now or restrict
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit similar to frontend text
});

const deriveTitleFromMessages = (messages = []) => {
    const firstUserMessage = messages.find((message) => {
        return message?.role === 'user' && typeof message.content === 'string' && message.content.trim();
    });
    if (!firstUserMessage) return 'New Chat';
    const trimmed = firstUserMessage.content.trim();
    return trimmed.length > 30 ? `${trimmed.substring(0, 30)}...` : trimmed;
};

const normalizeConversationTitle = (value = '') => {
    return typeof value === 'string' ? value.trim() : '';
};

const serializeConversationMessages = (messages = []) => {
    try {
        return JSON.stringify(Array.isArray(messages) ? messages : []);
    } catch (error) {
        return '[]';
    }
};

const hasSameConversationPayload = (existingSession, messages, title) => {
    if (!existingSession) return false;
    return normalizeConversationTitle(existingSession.title || deriveTitleFromMessages(existingSession.messages))
        === normalizeConversationTitle(title || deriveTitleFromMessages(messages))
        && serializeConversationMessages(existingSession.messages) === serializeConversationMessages(messages);
};

const mergeMessages = (dbMessages, clientMessages) => {
    if (!Array.isArray(dbMessages) || dbMessages.length === 0) {
        return clientMessages;
    }
    if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
        return dbMessages;
    }

    const n = dbMessages.length;
    const m = clientMessages.length;
    let maxOverlap = 0;

    for (let L = Math.min(n, m); L > 0; L--) {
        let match = true;
        for (let i = 0; i < L; i++) {
            const dbMsg = dbMessages[n - L + i];
            const clMsg = clientMessages[i];
            if (!dbMsg || !clMsg || dbMsg.role !== clMsg.role || dbMsg.content !== clMsg.content) {
                match = false;
                break;
            }
        }
        if (match) {
            maxOverlap = L;
            break;
        }
    }

    const nonOverlappingDb = dbMessages.slice(0, n - maxOverlap);
    return [...nonOverlappingDb, ...clientMessages];
};

// @desc    Upload a file
// @route   POST /api/chat/upload
// @access  Private
router.post('/upload', protect, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    // Construct URL
    // Assuming server runs on process.env.PORT or 5001
    // Ideally use full base URL from env, but relative path works if proxy/cors set up
    // For now returning relative path that frontend can prepend base URL to
    const filePath = `/uploads/${req.file.filename}`;

    res.json({
        message: 'File uploaded successfully',
        url: filePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
    });
});

const ChatSession = require('../models/ChatSession');

ChatSession.startDraftPurgeWorker();

router.get('/sessions', protect, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 0;
        const cursor = req.query.cursor ? String(req.query.cursor) : null;

        const sessions = await ChatSession.findByUserId(req.user.id, { limit, cursor });
        console.log("Sessions length:", sessions.length);
        if (sessions.length > 0) {
            console.log("First session constructor name:", sessions[0].constructor.name);
            console.log("Has toJSON?", typeof sessions[0].toJSON);
        }
        res.json(sessions.map((session) => session.toJSON ? session.toJSON() : session));
    } catch (error) {
        console.error('Fetch sessions error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get paginated messages for a session
// @route   GET /api/chat/sessions/:id/messages
// @access  Private
router.get('/sessions/:id/messages', protect, async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 20;
        
        const session = await ChatSession.findByIdWithPagination(req.params.id, req.user.id, offset, limit);
        if (session) {
            res.json(session);
        } else {
            res.status(404).json({ message: 'Session not found' });
        }
    } catch (error) {
        console.error('Fetch session messages error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Save or update a chat session
// @route   POST /api/chat/sessions
// @access  Private
router.post('/sessions', protect, async (req, res) => {
    try {
        const { sessionId, messages, title, disappearingMode, isDraft, unsentText } = req.body;
        const isDisappearing = disappearingMode === true || disappearingMode === 'true';

        const normalizedMessages = Array.isArray(messages) ? messages : [];
        const existingSession = sessionId
            ? await ChatSession.findById(sessionId, req.user.id, { includeDeleted: true })
            : null;

        const mergedMessages = existingSession
            ? mergeMessages(existingSession.messages, normalizedMessages)
            : normalizedMessages;

        const shouldSaveAsDraft = isDraft === true
            && (existingSession ? existingSession.isDraft === true : true)
            && (mergedMessages.length > 1 || (unsentText && unsentText.trim()));
        const resolvedTitle = title || existingSession?.title || deriveTitleFromMessages(mergedMessages);
        const shouldPreserveDraftExpiry = shouldSaveAsDraft
            && existingSession?.isDraft === true
            && existingSession?.deleted !== true
            && hasSameConversationPayload(existingSession, mergedMessages, resolvedTitle)
            && existingSession?.unsentText === unsentText;
        const updatedAt = shouldPreserveDraftExpiry
            ? (existingSession?.updatedAt || existingSession?.createdAt || new Date())
            : new Date();
        const draftExpiresAt = shouldSaveAsDraft
            ? (shouldPreserveDraftExpiry
                ? existingSession?.draftExpiresAt || ChatSession.buildDraftExpiry(updatedAt)
                : ChatSession.buildDraftExpiry(updatedAt))
            : null;
        const expiresAt = isDisappearing
            ? (existingSession?.disappearingMode ? existingSession?.expiresAt : new Date(Date.now() + ChatSession.DISAPPEARING_CHAT_TTL_MS))
            : null;

        const session = new ChatSession({
            id: sessionId || existingSession?.id || null,
            userId: req.user.id,
            messages: mergedMessages,
            title: resolvedTitle,
            createdAt: existingSession?.createdAt || updatedAt,
            updatedAt,
            deleted: false,
            deletedAt: null,
            disappearingMode: isDisappearing,
            expiresAt,
            isDraft: shouldSaveAsDraft,
            draftExpiresAt,
            unsentText: unsentText || ""
        });

        await session.save();
        res.json(session.toJSON());
    } catch (error) {
        console.error('Save session error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Clear all chat history
// @route   DELETE /api/chat/sessions
// @access  Private
router.delete('/sessions', protect, async (req, res) => {
    try {
        await ChatSession.deleteAllByUserId(req.user.id);
        res.json({ message: 'History cleared' });
    } catch (error) {
        console.error('Clear history error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Delete a specific session
// @route   DELETE /api/chat/sessions/:id
// @access  Private
router.delete('/sessions/:id', protect, async (req, res) => {
    try {
        const success = await ChatSession.deleteById(req.params.id, req.user.id);
        if (success) {
            res.json({ message: 'Session deleted' });
        } else {
            res.status(404).json({ message: 'Session not found' });
        }
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get all deleted chat sessions for a user
// @route   GET /api/chat/sessions/deleted
// @access  Private
router.get('/sessions-deleted', protect, async (req, res) => {
    try {
        const sessions = await ChatSession.findByUserId(req.user.id, { onlyDeleted: true });
        res.json(sessions.map((session) => session.toJSON()));
    } catch (error) {
        console.error('Fetch deleted sessions error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Restore a specific session
// @route   POST /api/chat/sessions/:id/restore
// @access  Private
router.post('/sessions/:id/restore', protect, async (req, res) => {
    try {
        const success = await ChatSession.restoreById(req.params.id, req.user.id);
        if (success) {
            res.json({ message: 'Session restored' });
        } else {
            res.status(404).json({ message: 'Session not found' });
        }
    } catch (error) {
        console.error('Restore session error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Archive a draft into Today history
// @route   POST /api/chat/sessions/:id/archive
// @access  Private
router.post('/sessions/:id/archive', protect, async (req, res) => {
    try {
        const session = await ChatSession.archiveById(req.params.id, req.user.id);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }
        res.json(session.toJSON());
    } catch (error) {
        console.error('Archive session error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Permanently delete a draft
// @route   DELETE /api/chat/sessions/:id/draft
// @access  Private
router.delete('/sessions/:id/draft', protect, async (req, res) => {
    try {
        const success = await ChatSession.deleteDraftById(req.params.id, req.user.id);
        if (!success) {
            return res.status(404).json({ message: 'Draft not found' });
        }
        res.json({ message: 'Draft deleted' });
    } catch (error) {
        console.error('Delete draft error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Update a specific session title
// @route   PATCH /api/chat/sessions/:id/title
// @access  Private
router.patch('/sessions/:id/title', protect, async (req, res) => {
    try {
        const { title } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ message: 'Title is required' });
        }
        const session = await ChatSession.updateTitleById(req.params.id, req.user.id, title.trim());
        if (session) {
            res.json(session.toJSON());
        } else {
            res.status(404).json({ message: 'Session not found' });
        }
    } catch (error) {
        console.error('Update session title error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
