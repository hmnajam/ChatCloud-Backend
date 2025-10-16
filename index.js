require('dotenv').config();
const express = require('express');
const { connectToWhatsApp, sendMessage } = require('./whatsappService');

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
    res.send('WhatsApp API Backend is running!');
});

app.post('/api/send-message', apiKeyMiddleware, async (req, res) => {
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

// Connect to WhatsApp and start the server
connectToWhatsApp().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log('To send a message, make a POST request to http://localhost:${PORT}/api/send-message');
        console.log('Make sure to include your API key in the "x-api-key" header.');
    });
}).catch(err => {
    console.error("Failed to connect to WhatsApp", err);
});