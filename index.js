import 'dotenv/config';
import express from 'express';
import { readdir } from 'fs/promises';
import path from 'path';
import { reconnectSession } from './sessionManager.js';
import clientRoutes from './clientRoutes.js';
import messageRoutes from './messageRoutes.js';

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

app.get('/', (req, res) => {
    res.send('WhatsApp Multi-Client API Backend is running!');
});

// Use the new routers with API key protection
app.use('/api/clients', apiKeyMiddleware, clientRoutes);
app.use('/api/messages', apiKeyMiddleware, messageRoutes);

// Function to automatically reconnect existing sessions on startup
async function reconnectExistingSessions() {
    console.log('Scanning for existing sessions...');
    const authDir = 'auth_info_baileys';
    try {
        const clientDirs = await readdir(authDir, { withFileTypes: true });
        const reconnectPromises = [];

        for (const clientDir of clientDirs) {
            if (clientDir.isDirectory()) {
                const clientId = clientDir.name;
                // No need to log here as reconnectSession will do it
                reconnectPromises.push(
                    reconnectSession(clientId).catch(error => {
                        // The error is already logged in reconnectSession, so we just catch to prevent unhandled rejection
                    })
                );
            }
        }

        if (reconnectPromises.length === 0) {
            console.log('No existing session directories found.');
        } else {
            await Promise.all(reconnectPromises);
        }

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Auth directory not found. Ready for new clients.');
        } else {
            console.error('Error reading auth directory:', error);
        }
    }
    console.log('Finished scanning for existing sessions.');
}

// Start the server and then reconnect sessions
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    reconnectExistingSessions();
});