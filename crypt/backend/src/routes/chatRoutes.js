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

// @desc    Get all chat sessions for a user
// @route   GET /api/chat/sessions
// @access  Private
router.get('/sessions', protect, async (req, res) => {
    try {
        const sessions = await ChatSession.findByUserId(req.user.id);
        res.json(sessions);
    } catch (error) {
        console.error('Fetch sessions error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Save or update a chat session
// @route   POST /api/chat/sessions
// @access  Private
router.post('/sessions', protect, async (req, res) => {
    try {
        const { sessionId, messages, title } = req.body;

        let session;
        if (sessionId) {
            // Find existing to update title if it's the first real question
            // For now just trust the client's messages and title
            session = new ChatSession({
                id: sessionId,
                userId: req.user.id,
                messages,
                title: title || (messages && messages[1] ? messages[1].content.substring(0, 30) + "..." : "New Chat")
            });
        } else {
            // Create new
            session = new ChatSession({
                userId: req.user.id,
                messages,
                title: title || (messages && messages[1] ? messages[1].content.substring(0, 30) + "..." : "New Chat")
            });
        }

        await session.save();
        res.json(session);
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
        res.json(sessions);
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

module.exports = router;
