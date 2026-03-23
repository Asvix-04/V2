const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Resend } = require('resend');
const { getFirestore, getAuth } = require('../config/db');

const resend = new Resend(process.env.RESEND_API_KEY);

// Generate JWT Helper
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

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

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create user instance
        const user = new User({
            name,
            email,
            password,
            role: role || 'student'
        });

        // Hash password
        await user.hashPassword();

        // Save user to Firestore
        await user.save();

        res.status(201).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user.id),
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

        // Check for user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if password matches
        const isPasswordMatch = await user.matchPassword(password);

        if (isPasswordMatch) {
            res.json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user.id),
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
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
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        const db = getFirestore();
        await db.collection('otps').doc(email).set({
            email,
            otp,
            expiresAt
        });

        // Send email via Resend
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: email,
            subject: 'Your Digilab Login OTP',
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Your Login Code</h2>
                    <p>Enter the following 6-digit code to sign in to your Digilab account:</p>
                    <h1 style="font-size: 32px; letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this code, you can safely ignore this email.</p>
                </div>
            `
        });

        if (error) {
            console.error('Resend full error:', JSON.stringify(error, null, 2));
            return res.status(500).json({ 
                message: 'Failed to send OTP email', 
                detail: error.message || 'Unknown Resend error' 
            });
        }

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Verify OTP and log in
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        const db = getFirestore();
        const otpDoc = await db.collection('otps').doc(email).get();

        if (!otpDoc.exists) {
            return res.status(400).json({ message: 'OTP not found or expired' });
        }

        const otpData = otpDoc.data();

        // Check if expired
        if (new Date() > otpData.expiresAt.toDate()) {
            await db.collection('otps').doc(email).delete();
            return res.status(400).json({ message: 'OTP has expired' });
        }

        // Check if matching
        if (otpData.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP code' });
        }

        // Success! Remove the OTP
        await db.collection('otps').doc(email).delete();

        // Find or create user
        let user = await User.findOne({ email });

        if (!user) {
            // Auto-register the user if they don't exist
            user = new User({
                name: email.split('@')[0],
                email,
                password: await bcrypt.hash(Math.random().toString(36).slice(-10), 10),
                role: 'student'
            });
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
        
        const user = await User.findOne({ email });
        
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

