const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Try to get user from Firestore, fall back to JWT payload if unavailable
            try {
                const user = await User.findById(decoded.id);
                if (user) {
                    req.user = user.toJSON();
                } else {
                    // Firestore is up but user not found
                    return res.status(401).json({ message: 'User not found' });
                }
            } catch (dbErr) {
                // Firestore is unavailable — use the JWT payload directly
                console.warn('Firestore unavailable, using JWT payload for auth:', dbErr.message);
                req.user = { id: decoded.id, role: decoded.role || 'student' };
            }

            next();
        } catch (error) {
            console.error('Auth error:', error.message);
            res.status(401).json({ message: 'Not authorized, token invalid' });
        }
    } else if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
