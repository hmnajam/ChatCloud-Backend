import { Boom } from '@hapi/boom';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import { rm, stat } from 'fs/promises';
import readline from 'readline';

const sessions = new Map();

export const ReadinessState = {
    CONNECTING: 'CONNECTING',
    SYNCING: 'SYNCING',
    READY: 'READY',
    CLOSED: 'CLOSED'
};

// A single, intelligent function to start a session.
// It will check if a session exists to determine if it's a reconnect or a new pairing.
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

    const authPath = path.join('auth_info_baileys', clientId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[${clientId}] using WA v${version.join('.')}`);

    session.sock = makeWASocket({
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

            sessions.delete(clientId); // Clean up failed session

            if (shouldReconnect) {
                console.log(`[${clientId}] Reconnecting...`);
                setTimeout(() => startSession(clientId), 5000); // Retry after 5s
            }
        }
    };

    // This is the crucial logic change.
    // We only ask for a pairing code if the user doesn't have credentials saved.
    // On a reconnect, the `creds.registered` will be true, and this block will be skipped.
    if (!session.sock.authState.creds.registered) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
            const question = (text) => new Promise(resolve => rl.question(text, resolve));
            const phoneNumber = await question(`[${clientId}] Enter phone number for new session: `);
            session.pairingCode = await session.sock.requestPairingCode(phoneNumber);
            console.log(`[${clientId}] Pairing Code: ${session.pairingCode}`);
        } catch (error) {
            console.error(`[${clientId}] Pairing code request failed:`, error);
            sessions.delete(clientId); // Clean up on failure
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

    await session.sock.logout();
    sessions.delete(clientId);

    const authPath = path.join('auth_info_baileys', clientId);
    await rm(authPath, { recursive: true, force: true });
}

export function listSessions() {
    return Array.from(sessions.entries()).map(([clientId, session]) => ({
        clientId,
        state: session.state,
        pairingCode: session.pairingCode,
    }));
}