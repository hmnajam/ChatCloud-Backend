import 'dotenv/config';
import express from 'express';
import { initDatabase } from './db.js';
import pool from './db.js';
import { startSession } from './sessionManager.js';
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

// Use the routers with API key protection
app.use('/api/clients', apiKeyMiddleware, clientRoutes);
app.use('/api/messages', apiKeyMiddleware, messageRoutes);

// Function to automatically reconnect existing sessions on startup
async function reconnectExistingSessions() {
    console.log('Scanning for existing sessions in the database...');
    try {
        const [rows] = await pool.query('SELECT DISTINCT clientId FROM baileys_auth_store;');
        if (rows.length === 0) {
            console.log('No existing sessions found in the database.');
            return;
        }

        const reconnectPromises = rows.map(row => {
            const clientId = row.clientId;
            console.log(`[${clientId}] Found existing session. Attempting to reconnect...`);
            return startSession(clientId).catch(error => {
                console.error(`[${clientId}] Failed to reconnect session on startup:`, error);
            });
        });

        await Promise.all(reconnectPromises);
        console.log('Finished reconnecting sessions.');

    } catch (error) {
        console.error('Error querying for existing sessions:', error);
    }
}

// Main function to initialize and start the server
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            reconnectExistingSessions();
        });
    } catch (error) {
        console.error('Failed to start the server:', error);
        process.exit(1); // Exit if the database connection fails
    }
}

startServer();
