import { Router } from 'express';
import { getSession, ReadinessState } from './sessionManager.js';

const router = Router();

// Middleware to check if the specific client session is ready
const clientReadinessMiddleware = (req, res, next) => {
    const { clientId } = req.body;
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required in the request body.' });
    }

    const session = getSession(clientId);
    if (!session) {
        return res.status(404).json({ error: `Session for clientId '${clientId}' not found.` });
    }

    if (session.state !== ReadinessState.READY) {
        return res.status(503).json({
            error: 'Service Unavailable: The WhatsApp client for this ID is not ready.',
            currentState: session.state
        });
    }

    // Attach the socket to the request object for the next handler
    req.socket = session.sock;
    next();
};

router.post('/send', clientReadinessMiddleware, async (req, res) => {
    const { to, text } = req.body;
    const sock = req.socket; // Get the socket from the middleware

    if (!to || !text) {
        return res.status(400).json({ error: 'Bad Request: "to" and "text" fields are required.' });
    }

    try {
        const jid = `${to}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        res.status(200).json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        console.error('Error in /api/messages/send:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

export default router;