import { Router } from 'express';
import { createSession, deleteSession, getSession, listSessions } from './sessionManager.js';

const router = Router();

// Create a new client session
router.post('/', async (req, res) => {
    const { clientId } = req.body;
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required.' });
    }

    try {
        await createSession(clientId);
        // The pairing code needs to be retrieved from the console where the app is running
        res.status(201).json({ message: `Session created for ${clientId}. Please check the console for the pairing code.` });
    } catch (error) {
        console.error(`[${clientId}] Error creating session:`, error);
        res.status(500).json({ error: 'Failed to create session.', details: error.message });
    }
});

// Get all client sessions and their status
router.get('/', (req, res) => {
    const sessions = listSessions();
    res.status(200).json(sessions);
});

// Get a specific client session's status
router.get('/:clientId', (req, res) => {
    const { clientId } = req.params;
    const session = getSession(clientId);
    if (session) {
        res.status(200).json({
            clientId,
            state: session.state,
            pairingCode: session.pairingCode
        });
    } else {
        res.status(404).json({ error: 'Session not found.' });
    }
});

// Delete a client session
router.delete('/:clientId', async (req, res) => {
    const { clientId } = req.params;
    try {
        await deleteSession(clientId);
        res.status(200).json({ message: `Session for ${clientId} deleted successfully.` });
    } catch (error) {
        console.error(`[${clientId}] Error deleting session:`, error);
        res.status(500).json({ error: 'Failed to delete session.', details: error.message });
    }
});

export default router;