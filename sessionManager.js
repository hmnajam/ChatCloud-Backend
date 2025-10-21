import { Boom } from '@hapi/boom';
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';
import { useMySQLAuthState } from './useMySQLAuthState.js';
import { deleteSessionFromDB } from './db.js';

const sessions = new Map();

export const ReadinessState = {
    CONNECTING: 'CONNECTING',
    SYNCING: 'SYNCING',
    READY: 'READY',
    CLOSED: 'CLOSED'
};

export async function startSession(clientId) {
    if (sessions.has(clientId)) {
        console.log(`[${clientId}] Session already exists, skipping...`);
        return;
    }

    const session = {
        sock: null,
        state: ReadinessState.CONNECTING,
        pairingCode: null,
    };
    sessions.set(clientId, session);

    const { state, saveCreds } = await useMySQLAuthState(clientId);
    const isNewSession = !state.creds.registered;

    if (isNewSession) {
        console.log(`[${clientId}] No existing credentials found in DB. This is a new session.`);
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`[${clientId}] using WA v${version.join('.')}`);

    session.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state, // Pass the whole state object directly
        printQRInTerminal: false,
        syncFullHistory: false,
    });

    let readinessTimeout;

    const handleConnectionUpdate = async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            session.state = ReadinessState.SYNCING;
            console.log(`[${clientId}] Connection opened, syncing history...`);
            readinessTimeout = setTimeout(() => {
                if (session.state === ReadinessState.SYNCING) {
                    console.log(`[${clientId}] Syncing timed out after 60s. Assuming ready.`);
                    session.state = ReadinessState.READY;
                }
            }, 60000);
        } else if (connection === 'close') {
            clearTimeout(readinessTimeout);
            session.state = ReadinessState.CLOSED;
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${clientId}] Connection closed. Should reconnect: ${shouldReconnect}`);

            sessions.delete(clientId);

            if (shouldReconnect) {
                console.log(`[${clientId}] Reconnecting...`);
                setTimeout(() => startSession(clientId), 5000);
            } else {
                 await deleteSessionFromDB(clientId);
                 console.log(`[${clientId}] Session logged out, data deleted from DB.`);
            }
        }
    };

    if (isNewSession) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
            const question = (text) => new Promise(resolve => rl.question(text, resolve));
            const phoneNumber = await question(`[${clientId}] Enter phone number for new session: `);
            session.pairingCode = await session.sock.requestPairingCode(phoneNumber);
            console.log(`[${clientId}] Pairing Code: ${session.pairingCode}`);
        } catch (error) {
            console.error(`[${clientId}] Pairing code request failed:`, error);
            sessions.delete(clientId);
        } finally {
            rl.close();
        }
    }

    session.sock.ev.on('connection.update', handleConnectionUpdate);
    session.sock.ev.on('creds.update', saveCreds);
    session.sock.ev.on('messaging-history.set', () => {
        clearTimeout(readinessTimeout);
        session.state = ReadinessState.READY;
        console.log(`[${clientId}] History sync complete. Client is ready.`);
    });
}

export function getSession(clientId) {
    return sessions.get(clientId);
}

export async function deleteSession(clientId) {
    const session = sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    try {
        await session.sock.logout();
    } catch (error) {
        console.error(`[${clientId}] Error during logout:`, error);
    } finally {
        sessions.delete(clientId);
        await deleteSessionFromDB(clientId);
    }
}

export function listSessions() {
    return Array.from(sessions.entries()).map(([clientId, session]) => ({
        clientId,
        state: session.state,
        pairingCode: session.pairingCode,
    }));
}
