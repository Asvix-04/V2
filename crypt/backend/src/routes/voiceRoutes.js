const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const voiceController = require('../controllers/voiceController');

// Configure Multer for Audio Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/audio/');
    },
    filename: (req, file, cb) => {
        cb(null, `voice-${Date.now()}.webm`);
    }
});

const upload = multer({ storage });

// Create uploads/audio directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads/audio/')) {
    fs.mkdirSync('uploads/audio/', { recursive: true });
}

// @route   POST /api/voice/speech-to-speech
// @desc    Process audio, get RAG answer, and return text/speech
// @access  Private
router.post('/speech-to-speech', protect, voiceController.speechToSpeech);

// @route   POST /api/voice/text-to-text
// @desc    Process multi-language text chat
// @access  Private
router.post('/text-to-text', protect, voiceController.textToText);

// @route   POST /api/voice/chat
router.post('/chat', protect, voiceController.chat);

// @route   POST /api/voice/chat/simple
router.post('/chat/simple', protect, voiceController.chatSimple);

// @route   POST /api/voice/clear-history
router.post('/clear-history', protect, voiceController.clearHistory);

// @route   GET /api/voice/health
// @desc    Check voice service health
// @access  Public
router.get('/health', voiceController.healthCheck);

module.exports = router;
