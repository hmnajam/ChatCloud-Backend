import { Router } from 'express';
import { startSession, deleteSession, getSession, listSessions } from './sessionManager.js';

const router = Router();

// Create a new client session
router.post('/', async (req, res) => {
  const { clientId, phoneNumber } = req.body;
    console.log(clientId, phoneNumber);

  if (!clientId || !phoneNumber) {
    return res.status(400).json({
      error: !clientId ? "clientId is required." : "phoneNumber is required.",
    });
  }
    try {
        await startSession(clientId);
        const session = getSession(clientId);
        // The pairing code will be available on the session object if it's a new session
        res.status(201).json({
            message: `Session creation initiated for ${clientId}. Please check the console for pairing code if this is a new client.`,
            pairingCode: session ? session.pairingCode : null
        });
    } catch (error) {
        console.error(`[${clientId}] Error creating session:`, error);
        res.status(500).json({ error: 'Failed to create session.', details: error.message });
    }
});



    // const pairingCode = await startSession(clientId, phoneNumber);
    // res.status(201).json({
    //   message: `Session creation initiated for ${clientId}. If this is a new client, the pairing code will be returned.`,
    //   pairingCode: pairingCode,
    // });


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