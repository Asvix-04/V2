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
const { classifyUser } = require('../middleware/guestQuotaMiddleware');

if (!fs.existsSync('uploads/audio/')) {
    fs.mkdirSync('uploads/audio/', { recursive: true });
}

// @route   GET /api/voice/guest-quota
router.get('/guest-quota', classifyUser, voiceController.getGuestQuota);

// @route   POST /api/voice/speech-to-speech
// @desc    Process audio, get RAG answer, and return text/speech
// @access  Public (Guest support)
router.post('/speech-to-speech', classifyUser, voiceController.speechToSpeech);

// @route   POST /api/voice/text-to-text
// @desc    Process multi-language text chat
// @access  Public (Guest support)
router.post('/text-to-text', classifyUser, voiceController.textToText);

// @route   POST /api/voice/chat
router.post('/chat', classifyUser, voiceController.chat);

// @route   POST /api/voice/chat/simple
router.post('/chat/simple', classifyUser, voiceController.chatSimple);

// @route   POST /api/voice/clear-history
router.post('/clear-history', classifyUser, voiceController.clearHistory);

// @route   GET /api/voice/metrics/summary
router.get('/metrics/summary', voiceController.getMetricsSummary);

// @route   POST /api/voice/metrics/event
// @desc    Frontend-reported failure event (e.g. axios "Network Error")
// @access  Public
router.post('/metrics/event', voiceController.recordClientError);

// @route   POST /deepchat
// @desc    Deep Research Chat Proxy
// @access  Public (classifyUser support)
router.post('/deepchat', classifyUser, voiceController.deepChat);

// @route   GET /api/voice/health
// @desc    Check voice service health
// @access  Public
router.get('/health', voiceController.healthCheck);

module.exports = router;

