const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const { initializeFirebase } = require('./config/db');
const { initializeRedis } = require('./config/redis');

// Load env vars — always resolve relative to this file so it works from any cwd.
// Keep the standard backend/.env location first, but support the existing local
// backend/src/.env file so local dev does not silently start without credentials.
dotenv.config({
    path: [
        path.resolve(__dirname, '../.env'),
        path.resolve(__dirname, '.env')
    ]
});

// Load routes after dotenv so controllers capture the configured service URLs.
const voiceRoutes = require('./routes/voiceRoutes');

// Initialize Firebase and Redis
initializeFirebase();
initializeRedis();

const app = express();

// Middleware
app.use(express.json());       // Parse JSON body
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded body
app.use(cors());               // Enable CORS
app.use(helmet({
    crossOriginOpenerPolicy: false,
    // The SPA connects to Firebase and Google APIs. Keep the remaining Helmet
    // protections while allowing those client-side connections.
    contentSecurityPolicy: false
}));             // Security headers


// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/voice', require('./routes/voiceRoutes'));
app.use('/api/research', require('./routes/researchRoutes'));

// Backward compatibility for the separately hosted frontend, which points its
// chatbot base URL at the Space root and calls /chat, /health, and related
// endpoints directly. The bundled frontend uses /api/voice instead.
app.use('/', voiceRoutes);

// Serve uploaded files from a stable path regardless of the launch directory.
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// In production, Express is the single public service: it serves the compiled
// Vite app and the API from the same origin. Vite dev mode remains unchanged.
const frontendDist = path.resolve(__dirname, '../../dist');

if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    // Keep unknown API requests as JSON 404s instead of returning index.html.
    app.use('/api', (req, res) => {
        res.status(404).json({ message: 'API route not found' });
    });

    // React Router owns every remaining browser route.
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('DigiLab API is running...');
    });
}

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
