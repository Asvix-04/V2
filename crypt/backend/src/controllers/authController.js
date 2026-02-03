const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

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

            const updatedUser = await User.update(user._id, updates);

            res.json({
                _id: updatedUser._id,
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
                token: generateToken(updatedUser._id),
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

