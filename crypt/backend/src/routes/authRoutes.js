const express = require('express');
const router = express.Router();
const { register, login, getMe, updateProfile, googleLogin, githubLogin, sendOTP, verifyOTP, checkUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/github', githubLogin);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/check-user', checkUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

module.exports = router;
