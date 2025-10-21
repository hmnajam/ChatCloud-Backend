import { Router } from 'express';
import multer from 'multer';
import { getSession, ReadinessState } from './sessionManager.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.post('/send-media', upload.single('file'), clientReadinessMiddleware, async (req, res) => {
    const { to, caption } = req.body;
    const sock = req.socket;
    const file = req.file;

    if (!to || !file) {
        return res.status(400).json({ error: 'Bad Request: "to" and a "file" upload are required.' });
    }

    try {
        const jid = `${to}@s.whatsapp.net`;
        let messagePayload;

        // Determine message type based on mimetype
        if (file.mimetype.startsWith('image/')) {
            messagePayload = {
                image: file.buffer,
                caption: caption || ''
            };
        } else if (file.mimetype.startsWith('video/')) {
            messagePayload = {
                video: file.buffer,
                caption: caption || ''
            };
        } else {
            // Default to sending as a document
            messagePayload = {
                document: file.buffer,
                mimetype: file.mimetype,
                fileName: file.originalname,
                caption: caption || ''
            };
        }

        await sock.sendMessage(jid, messagePayload);
        res.status(200).json({ success: true, message: 'Media sent successfully.' });
    } catch (error) {
        console.error('Error in /api/messages/send-media:', error);
        res.status(500).json({ error: 'Failed to send media.' });
    }
});

export default router;