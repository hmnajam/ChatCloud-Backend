import { Boom } from '@hapi/boom';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

// Define the states for our state machine
const ReadinessState = {
    CONNECTING: 'CONNECTING',
    SYNCING: 'SYNCING',
    READY: 'READY',
    CLOSED: 'CLOSED'
};

let sock;
let currentState = ReadinessState.CLOSED;
let readinessTimeout;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    currentState = ReadinessState.CONNECTING;

    sock = makeWASocket({
        version,
        logger: pino({ level: 'info' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
            console.log('Connection is connecting...');
            if (!sock.authState.creds.registered) {
                const phoneNumber = await question('Please enter your mobile phone number (e.g., 1234567890): ');
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`Your pairing code is: ${code}`);
                    console.log('Please enter this code on your mobile device to link.');
                } catch (error) {
                    console.error('Failed to request pairing code:', error);
                    if (!rl.closed) {
                        rl.close();
                    }
                }
            }
        } else if (connection === 'open') {
            console.log('Connection opened, now syncing history...');
            currentState = ReadinessState.SYNCING;
            // Set a timeout to pragmatically move to READY state
            readinessTimeout = setTimeout(() => {
                if (currentState === ReadinessState.SYNCING) {
                    console.log('Syncing timed out, considering client ready.');
                    currentState = ReadinessState.READY;
                }
            }, 20000); // 20-second timeout
            if (!rl.closed) {
                rl.close();
            }
        } else if (connection === 'close') {
            clearTimeout(readinessTimeout);
            currentState = ReadinessState.CLOSED;
            if (!rl.closed) {
                rl.close();
            }
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        }
    });

    sock.ev.on('messaging-history.set', () => {
        clearTimeout(readinessTimeout);
        console.log('History sync complete. Client is ready.');
        currentState = ReadinessState.READY;
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

function getReadinessState() {
    return currentState;
}

function getSocket() {
    return sock;
}

async function sendMessage(to, text) {
    const jid = `${to}@s.whatsapp.net`;
    try {
        await sock.sendMessage(jid, { text });
        return { success: true, message: 'Message sent successfully.' };
    } catch (error) {
        console.error('Error sending message:', error);
        throw new Error('Failed to send message');
    }
}

export { connectToWhatsApp, sendMessage, getSocket, getReadinessState, ReadinessState };