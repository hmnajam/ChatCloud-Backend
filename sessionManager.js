import { Boom } from '@hapi/boom';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import { rm } from 'fs/promises';
import readline from 'readline';

const sessions = new Map();

// A helper function to create a socket connection. This will be used by both new sessions and reconnections.
async function createSocket(clientId, onStateChange) {
    const authPath = path.join('auth_info_baileys', clientId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[${clientId}] using WA v${version.join('.')}, isLatest: ${isLatest}`);

    onStateChange(ReadinessState.CONNECTING);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        syncFullHistory: false,
    });

    let readinessTimeout;
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`[${clientId}] Connection opened, now syncing history...`);
            onStateChange(ReadinessState.SYNCING);
            readinessTimeout = setTimeout(() => {
                console.log(`[${clientId}] Syncing timed out after 60 seconds. Assuming client is ready.`);
                onStateChange(ReadinessState.READY);
            }, 60000);
        } else if (connection === 'close') {
            clearTimeout(readinessTimeout);
            onStateChange(ReadinessState.CLOSED);
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${clientId}] Connection closed due to `, lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                reconnectSession(clientId); // Attempt to reconnect
            }
        }
    });

    sock.ev.on('messaging-history.set', () => {
        clearTimeout(readinessTimeout);
        console.log(`[${clientId}] History sync complete. Client is ready.`);
        onStateChange(ReadinessState.READY);
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

// Function to create a new session INTERACTIVELY
async function createNewSession(clientId) {
    if (sessions.has(clientId)) {
        throw new Error('Session for this client already exists.');
    }

    const session = { sock: null, state: ReadinessState.CONNECTING, pairingCode: null };
    sessions.set(clientId, session);

    const onStateChange = (newState) => {
        session.state = newState;
        console.log(`[${clientId}] State changed to: ${newState}`);
    };

    try {
        session.sock = await createSocket(clientId, onStateChange);

        if (!session.sock.authState.creds.registered) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            try {
                const question = (text) => new Promise((resolve) => rl.question(text, resolve));
                const phoneNumber = await question(`[${clientId}] Please enter your mobile phone number (e.g., 1234567890): `);
                const code = await session.sock.requestPairingCode(phoneNumber);
                session.pairingCode = code;
                console.log(`[${clientId}] Your pairing code is: ${code}`);
            } finally {
                rl.close();
            }
        }
    } catch (error) {
        console.error(`[${clientId}] Failed to create new session:`, error);
        sessions.delete(clientId);
        throw error;
    }
}

// Function to reconnect an existing session NON-INTERACTIVELY
async function reconnectSession(clientId) {
    if (sessions.has(clientId)) {
        console.log(`[${clientId}] Session already in map. Skipping reconnect.`);
        return;
    }

    const session = { sock: null, state: ReadinessState.CONNECTING, pairingCode: null };
    sessions.set(clientId, session);

    const onStateChange = (newState) => {
        session.state = newState;
        console.log(`[${clientId}] State changed to: ${newState}`);
    };

    try {
        session.sock = await createSocket(clientId, onStateChange);
    } catch (error) {
        console.error(`[${clientId}] Failed to reconnect session:`, error);
        sessions.delete(clientId);
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

    if (session.sock && session.sock.ws.readyState === 1) {
        session.sock.ws.close();
    }

    sessions.delete(clientId);

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
            pairingCode: session.pairingCode
        });
    }
    return sessionList;
}

export const ReadinessState = {
    CONNECTING: 'CONNECTING',
    SYNCING: 'SYNCING',
    READY: 'READY',
    CLOSED: 'CLOSED'
};

export { createNewSession, reconnectSession, getSession, deleteSession, listSessions };