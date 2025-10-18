import { connectToWhatsApp, ReadinessState } from './whatsappService.js';
import { rm } from 'fs/promises';
import path from 'path';
import readline from 'readline';

const sessions = new Map();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function createSession(clientId) {
    if (sessions.has(clientId)) {
        throw new Error('Session for this client already exists.');
    }

    console.log(`[${clientId}] Creating new session...`);
    const session = {
        sock: null,
        state: ReadinessState.CONNECTING,
        pairingCode: null
    };
    sessions.set(clientId, session);

    const onStateChange = (newState) => {
        session.state = newState;
        console.log(`[${clientId}] State changed to: ${newState}`);
    };

    session.sock = await connectToWhatsApp(clientId, onStateChange);

    // Handle pairing code logic for the new session
    if (!session.sock.authState.creds.registered) {
        const phoneNumber = await question(`[${clientId}] Please enter your mobile phone number (e.g., 1234567890): `);
        try {
            const code = await session.sock.requestPairingCode(phoneNumber);
            session.pairingCode = code;
            console.log(`[${clientId}] Your pairing code is: ${code}`);
        } catch (error) {
            console.error(`[${clientId}] Failed to request pairing code:`, error);
            sessions.delete(clientId); // Clean up failed session
            throw error;
        }
    }
}

function getSession(clientId) {
    return sessions.get(clientId);
}

async function deleteSession(clientId) {
    const session = sessions.get(clientId);
    if (!session) {
        throw new Error('Session not found.');
    }

    try {
        await session.sock.logout();
    } catch (error) {
        console.error(`[${clientId}] Error during logout:`, error);
    }

    // Close the connection if it's still open
    if (session.sock && session.sock.ws.readyState === 1) {
        session.sock.ws.close();
    }

    sessions.delete(clientId);

    // Delete the auth info directory
    const authPath = path.join('auth_info_baileys', clientId);
    try {
        await rm(authPath, { recursive: true, force: true });
        console.log(`[${clientId}] Session data deleted.`);
    } catch (error) {
        console.error(`[${clientId}] Error deleting session data:`, error);
    }
}

function listSessions() {
    const sessionList = [];
    for (const [clientId, session] of sessions.entries()) {
        sessionList.push({
            clientId,
            state: session.state,
            pairingCode: session.pairingCode // Include pairing code for new sessions
        });
    }
    return sessionList;
}

export { createSession, getSession, deleteSession, listSessions, ReadinessState };