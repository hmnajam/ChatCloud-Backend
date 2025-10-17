import { Boom } from '@hapi/boom';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

let sock;
let isWhatsAppReady = false;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// This promise will resolve when the connection and initial sync are complete
const connectionReadyPromise = new Promise((resolve) => {
    const connectToWhatsApp = async () => {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

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
                        if (!rl.closed) rl.close();
                    }
                }
            } else if (connection === 'open') {
                console.log('Opened connection');
                if (!rl.closed) rl.close();
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            }
        });

        // This event is a more reliable indicator of readiness
        sock.ev.on('messaging-history.set', () => {
            isWhatsAppReady = true;
            console.log('WhatsApp client is ready.');
            resolve(true); // Resolve the promise
        });

        sock.ev.on('creds.update', saveCreds);
    };

    connectToWhatsApp().catch(err => console.error("Failed to connect to WhatsApp", err));
});

function isReady() {
    return isWhatsAppReady;
}

async function sendMessage(to, text) {
    if (!isReady()) {
        // This case is now handled by the server not starting until ready,
        // but it's good practice to keep the check.
        throw new Error('WhatsApp client is not ready yet.');
    }
    const jid = `${to}@s.whatsapp.net`;
    try {
        await sock.sendMessage(jid, { text });
        return { success: true, message: 'Message sent successfully.' };
    } catch (error) {
        console.error('Error sending message:', error);
        throw new Error('Failed to send message');
    }
}

export { connectionReadyPromise, sendMessage, isReady };