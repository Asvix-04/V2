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

module.exports = router;
