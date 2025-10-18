import 'dotenv/config';
import express from 'express';
import { connectToWhatsApp, sendMessage, getReadinessState, ReadinessState } from './whatsappService.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware for API Key validation
const apiKeyMiddleware = (req, res, next) => {
    const providedApiKey = req.headers['x-api-key'];
    if (!providedApiKey || providedApiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};

// Robust readiness check middleware using the state machine
const readinessMiddleware = (req, res, next) => {
    const currentState = getReadinessState();
    if (currentState === ReadinessState.READY) {
        return next();
    }
    res.status(503).json({
        error: 'Service Unavailable: WhatsApp client is not ready.',
        currentState: currentState
    });
};

app.get('/', (req, res) => {
    res.send('WhatsApp API Backend is running!');
});

app.post('/api/send-message', apiKeyMiddleware, readinessMiddleware, async (req, res) => {
    const { to, text } = req.body;

    if (!to || !text) {
        return res.status(400).json({ error: 'Bad Request: "to" and "text" fields are required.' });
    }

    try {
        const result = await sendMessage(to, text);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /api/send-message:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Start the server immediately
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('API is ready to accept requests, but WhatsApp client may still be initializing.');
});

// Initiate WhatsApp connection in the background
connectToWhatsApp().catch(err => {
    console.error("Fatal error during WhatsApp connection:", err);
});