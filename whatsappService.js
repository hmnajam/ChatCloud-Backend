import { Boom } from '@hapi/boom';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';

// Define the states for our state machine
const ReadinessState = {
    CONNECTING: 'CONNECTING',
    SYNCING: 'SYNCING',
    READY: 'READY',
    CLOSED: 'CLOSED'
};

// A simple in-memory store for session states
const sessionStates = new Map();

async function connectToWhatsApp(clientId, onStateChange) {
    const authPath = path.join('auth_info_baileys', clientId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[${clientId}] using WA v${version.join('.')}, isLatest: ${isLatest}`);

    onStateChange(ReadinessState.CONNECTING);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Use silent logger for less noise
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`[${clientId}] Connection opened, now syncing history...`);
            onStateChange(ReadinessState.SYNCING);
        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${clientId}] Connection closed due to `, lastDisconnect.error, ', reconnecting ', shouldReconnect);
            onStateChange(ReadinessState.CLOSED);
            if (shouldReconnect) {
                connectToWhatsApp(clientId, onStateChange);
            }
        }
    });

    sock.ev.on('messaging-history.set', () => {
        console.log(`[${clientId}] History sync complete. Client is ready.`);
        onStateChange(ReadinessState.READY);
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

export { connectToWhatsApp, ReadinessState };