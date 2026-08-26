const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Resend } = require('resend');
const { getFirestore, getAuth } = require('../config/db');

// Initialize Resend optionally safely
let resend = null;
try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.includes('re_123')) {
        resend = new Resend(resendKey);
    }
} catch (e) {
    console.warn('Resend initialization failed:', e.message);
}

// Generate JWT Helper
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Helper to generate OTP, enforce 60s server-side rate limit, store in Firestore, and send via Resend
async function generateAndSendOtp(email, isSignup = false) {
    const db = getFirestore();
    const otpRef = db.collection('otps').doc(email);
    const existingDoc = await otpRef.get();

    if (existingDoc.exists) {
        const existingData = existingDoc.data();
        if (existingData.lastSentAt) {
            const lastSentTime = existingData.lastSentAt.toDate ? existingData.lastSentAt.toDate().getTime() : new Date(existingData.lastSentAt).getTime();
            const elapsed = Date.now() - lastSentTime;
            if (elapsed < OTP_RESEND_COOLDOWN_MS) {
                const remainingSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
                const error = new Error(`Please wait ${remainingSec}s before requesting another verification code.`);
                error.status = 429;
                error.remainingSec = remainingSec;
                throw error;
            }
        }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const lastSentAt = new Date();

    await otpRef.set({
        email,
        otp,
        expiresAt,
        lastSentAt,
        attempts: 0
    });

    if (!resend) {
        console.warn('OTP requested but Resend is not configured.');
        const error = new Error('Email service is currently unavailable. Please contact support.');
        error.status = 503;
        throw error;
    }

    const subject = isSignup ? 'Your Digilab Verification Code' : 'Your Digilab Login OTP';
    const actionText = isSignup ? 'complete your registration on' : 'sign in to';

    const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px;">
                <h2 style="color: #4F46E5;">${subject}</h2>
                <p>Enter the following 6-digit code to ${actionText} your Digilab account:</p>
                <h1 style="font-size: 36px; letter-spacing: 6px; color: #4F46E5; background: #F3F4F6; padding: 12px 20px; border-radius: 8px; display: inline-block;">${otp}</h1>
                <p style="color: #6B7280; font-size: 14px;">This code will expire in 10 minutes.</p>
                <p style="color: #9CA3AF; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
            </div>
        `
    });

    if (error) {
        console.error('Resend full error:', JSON.stringify(error, null, 2));
        const resendErr = new Error('Failed to send verification email');
        resendErr.status = 500;
        resendErr.detail = error.message || 'Unknown Resend error';
        throw resendErr;
    }

    return true;
}

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Validate user data
        const errors = User.validate({ name, email, password, role });
        if (errors.length > 0) {
            return res.status(400).json({ message: errors.join(', ') });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;

        // Check if user exists
        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            if (userExists.emailVerified === false) {
                // Account was created previously but never verified.
                // Do NOT overwrite existing password/name. Resend OTP and prompt verification.
                try {
                    await generateAndSendOtp(normalizedEmail, true);
                } catch (otpErr) {
                    const status = otpErr.status || 500;
                    return res.status(status).json({ message: otpErr.message });
                }
                return res.status(200).json({
                    message: 'Account verification pending. A new verification code has been sent to your email.',
                    requiresVerification: true,
                    email: userExists.email
                });
            }
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create unverified user instance
        const user = new User({
            name,
            email: normalizedEmail,
            password,
            role: role || 'student',
            emailVerified: false
        });

        // Hash password
        await user.hashPassword();

        // Save user to Firestore
        await user.save();

        // Send OTP via Resend
        try {
            await generateAndSendOtp(normalizedEmail, true);
        } catch (otpErr) {
            console.error('Registration OTP dispatch failed:', otpErr.message);
            const status = otpErr.status || 500;
            return res.status(status).json({
                message: otpErr.message || 'Account created but failed to send verification email.',
                requiresVerification: true,
                email: user.email
            });
        }

        res.status(201).json({
            message: 'Verification code sent to your email. Please verify to complete registration.',
            requiresVerification: true,
            email: user.email
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;

        // Check for user
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if password matches
        const isPasswordMatch = await user.matchPassword(password);

        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Verification Gate: unverified accounts are blocked from obtaining a JWT
        if (user.emailVerified === false) {
            return res.status(403).json({
                message: 'Please verify your email to log in.',
                requiresVerification: true,
                email: user.email
            });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user.id),
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Don't modify the user object on req directly if we fetched a fresh one, just send it
        // Or if middleware attached it correctly, just send req.user
        // But let's be safe and send what middleware likely attached, but filter password just in case
        const { password, ...userResponse } = req.user;
        res.status(200).json(userResponse);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        let user = await User.findById(req.user.id);

        if (user) {
            const updates = {};
            if (req.body.name) updates.name = req.body.name;
            if (req.body.email) updates.email = req.body.email;
            if (req.body.preferredName) updates.preferredName = req.body.preferredName;
            if (req.body.age) updates.age = req.body.age;
            if (req.body.gender) updates.gender = req.body.gender;
            if (req.body.location) updates.location = req.body.location;
            if (req.body.primaryLanguage) updates.primaryLanguage = req.body.primaryLanguage;
            if (req.body.profilePhoto) updates.profilePhoto = req.body.profilePhoto;

            if (req.body.password) {
                const salt = await bcrypt.genSalt(10);
                updates.password = await bcrypt.hash(req.body.password, salt);
            }

            // Handle nested objects carefully
            if (req.body.preferences) {
                updates.preferences = { ...(user.preferences || {}), ...req.body.preferences };
            }

            const updatedUser = await User.update(user.id, updates);

            res.json({
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                preferredName: updatedUser.preferredName,
                age: updatedUser.age,
                gender: updatedUser.gender,
                location: updatedUser.location,
                primaryLanguage: updatedUser.primaryLanguage,
                profilePhoto: updatedUser.profilePhoto,
                accountStatus: updatedUser.accountStatus,
                preferences: updatedUser.preferences,
                token: generateToken(updatedUser.id),
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Google auth (Login or Signup)
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
    try {
        const { idToken, mode } = req.body; // mode: 'login' or 'signup'
        if (!idToken) {
            return res.status(400).json({ message: 'Google ID token is required' });
        }

        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(idToken);
        const { email, name, picture, uid: googleId } = decodedToken;

        let user = await User.findOne({ email });

        if (mode === 'signup') {
            if (user) {
                return res.status(400).json({ message: 'Account already exists. Please sign in.' });
            }
            // Create user
            user = new User({
                name,
                email,
                password: await bcrypt.hash(Math.random().toString(36).slice(-10), 10),
                role: 'student',
                googleId,
                profilePhoto: picture
            });
            await user.save();
            return res.status(201).json({ message: 'Account created successfully! Please sign in with Google.' });
        }

        // Login Mode (default)
        if (!user) {
            return res.status(404).json({ message: 'Account not found. Please sign up first.' });
        }

        // Update googleId if not present (optional)
        if (!user.googleId) {
            user.googleId = googleId;
            if (!user.profilePhoto) user.profilePhoto = picture;
            await user.save();
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            profilePhoto: user.profilePhoto,
            token: generateToken(user.id),
        });
    } catch (error) {
        console.error('Google Auth error:', error);
        res.status(400).json({ message: 'Google authentication failed' });
    }
};

// @desc    GitHub login
// @route   POST /api/auth/github
// @access  Public
exports.githubLogin = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ message: 'GitHub code is required' });
        }

        // Exchange code for access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }, {
            headers: { Accept: 'application/json' }
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            return res.status(400).json({ message: 'GitHub authentication failed' });
        }

        const response = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const { email, name, avatar_url, id: githubId } = response.data;

        let userEmail = email;
        if (!userEmail) {
            const emailsResponse = await axios.get('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const primaryEmail = emailsResponse.data.find(e => e.primary && e.verified);
            userEmail = primaryEmail ? primaryEmail.email : null;
        }

        if (!userEmail) {
            return res.status(400).json({ message: 'Could not obtain email from GitHub' });
        }

        let user = await User.findOne({ email: userEmail });

        if (!user) {
            user = new User({
                name: name || userEmail.split('@')[0],
                email: userEmail,
                password: await bcrypt.hash(Math.random().toString(36).slice(-10), 10),
                role: 'student',
                githubId: githubId.toString(),
                profilePhoto: avatar_url
            });
            await user.save();
        } else if (!user.githubId) {
            user.githubId = githubId.toString();
            if (!user.profilePhoto) user.profilePhoto = avatar_url;
            await user.save();
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            profilePhoto: user.profilePhoto,
            token: generateToken(user.id),
        });
    } catch (error) {
        console.error('GitHub login error:', error);
        res.status(400).json({ message: 'GitHub authentication failed' });
    }
};

// @desc    Send OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
    try {
        const { email, isSignup } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
        await generateAndSendOtp(normalizedEmail, Boolean(isSignup));

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        const status = error.status || 500;
        console.error('Send OTP error:', error.message);
        res.status(status).json({ message: error.message });
    }
};

// @desc    Verify OTP and log in / activate account
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
        const db = getFirestore();
        const otpRef = db.collection('otps').doc(normalizedEmail);
        const otpDoc = await otpRef.get();

        if (!otpDoc.exists) {
            return res.status(400).json({ message: 'Verification code not found or expired. Please request a new code.' });
        }

        const otpData = otpDoc.data();

        // Check if expired
        const expiresAtTime = otpData.expiresAt.toDate ? otpData.expiresAt.toDate().getTime() : new Date(otpData.expiresAt).getTime();
        if (Date.now() > expiresAtTime) {
            await otpRef.delete();
            return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        }

        // Check max attempts (5)
        const attempts = (otpData.attempts || 0) + 1;
        if (attempts > 5) {
            await otpRef.delete();
            return res.status(400).json({ message: 'Too many incorrect attempts. Please request a new verification code.' });
        }

        // Check if matching
        if (otpData.otp !== String(otp).trim()) {
            await otpRef.update({ attempts });
            const remaining = 5 - attempts;
            return res.status(400).json({
                message: remaining > 0
                    ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                    : 'Too many incorrect attempts. Please request a new verification code.'
            });
        }

        // Success! Remove the OTP
        await otpRef.delete();

        // Find or create user
        let user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            // Auto-register the user if they don't exist (login via OTP flow)
            user = new User({
                name: normalizedEmail.split('@')[0],
                email: normalizedEmail,
                password: await bcrypt.hash(Math.random().toString(36).slice(-10), 10),
                role: 'student',
                emailVerified: true
            });
            await user.save();
        } else if (user.emailVerified === false) {
            // Mark user as verified
            await User.update(user.id, { emailVerified: true });
            user.emailVerified = true;
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            profilePhoto: user.profilePhoto,
            emailVerified: true,
            token: generateToken(user.id),
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Check if user exists
// @route   POST /api/auth/check-user
// @access  Public
exports.checkUser = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ message: 'Account not found. Please sign up first.' });
        }

        res.json({
            exists: true,
            name: user.name,
            profilePhoto: user.profilePhoto
        });
    } catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({ message: error.message });
    }
};