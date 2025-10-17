import 'dotenv/config';
import express from 'express';
import { connectionReadyPromise, sendMessage, isReady } from './whatsappService.js';

async function startServer() {
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

    // Readiness check middleware
    const readinessMiddleware = (req, res, next) => {
        if (!isReady()) {
            return res.status(503).json({ error: 'Service Unavailable: WhatsApp client is not ready.' });
        }
        next();
    };

    app.get('/', (req, res) => {
        res.send('WhatsApp API Backend is running!');
    });

    // Apply readiness check only to the send-message route
    app.post('/api/send-message', apiKeyMiddleware, readinessMiddleware, async (req, res) => {
        const { to, text } = req.body;

        if (!to || !text) {
            return res.status(400).json({ error: 'Bad Request: "to" and "text" fields are required.' });
        }

        try {
            const result = await sendMessage(to, text);
            res.status(200).json(result);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to send message.' });
        }
    });

    // Wait for the WhatsApp connection to be ready before starting the server
    try {
        await connectionReadyPromise;
        app.listen(PORT, () => {
            console.log(`\nServer is running on port ${PORT}`);
            console.log('API is ready to accept requests.');
            console.log('To send a message, make a POST request to http://localhost:${PORT}/api/send-message');
        });
    } catch (err) {
        console.error("Failed to initialize WhatsApp connection and start server", err);
        process.exit(1); // Exit if connection fails
    }
}

startServer();