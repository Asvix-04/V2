const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const { initializeFirebase } = require('./config/db');

// Load env vars — always resolve relative to this file so it works from any cwd.
// Keep the standard backend/.env location first, but support the existing local
// backend/src/.env file so local dev does not silently start without credentials.
dotenv.config({
    path: [
        path.resolve(__dirname, '../.env'),
        path.resolve(__dirname, '.env')
    ]
});

// Initialize Firebase
initializeFirebase();

const app = express();

// Middleware
app.use(express.json());       // Parse JSON body
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded body
app.use(cors());               // Enable CORS
app.use(helmet({
    crossOriginOpenerPolicy: false
}));             // Security headers


// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/voice', require('./routes/voiceRoutes'));

// Serve Static Uploads
app.use('/uploads', express.static('uploads'));

// Base Route
app.get('/', (req, res) => {
    res.send('DigiLab API is running...');
});

// Error Handler
app.use((err, req, res, next) => {
    const statusCode = res.statusCode ? res.statusCode : 500;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
