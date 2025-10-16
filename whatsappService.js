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
let connectionLogicPromise;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
    // Prevent multiple connection attempts
    if (connectionLogicPromise) {
        return connectionLogicPromise;
    }

    connectionLogicPromise = new Promise(async (resolve, reject) => {
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

            // This is the correct, event-driven flow
            if (connection === 'connecting') {
                console.log('Connection is connecting...');
                // Do not ask for pairing code if we are already registered
                if (!sock.authState.creds.registered) {
                    const phoneNumber = await question('Please enter your mobile phone number (e.g., 1234567890): ');
                    try {
                        const code = await sock.requestPairingCode(phoneNumber);
                        console.log(`Your pairing code is: ${code}`);
                        console.log('Please enter this code in WhatsApp on your mobile phone (Settings > Linked Devices > Link a Device > Link with phone number).');
                    } catch (error) {
                        console.error('Failed to request pairing code:', error);
                        reject(error);
                        if (!rl.closed) rl.close();
                    }
                }
            } else if (connection === 'open') {
                console.log('opened connection');
                if (!rl.closed) rl.close();
                resolve(sock); // Resolve the promise when connection is open
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    connectToWhatsApp().catch(err => console.error('Reconnect failed', err));
                } else {
                    reject(new Error('Connection closed permanently.'));
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);
    });

    return connectionLogicPromise;
}

async function sendMessage(to, text) {
    if (!sock || sock.ws.readyState !== 1) {
        throw new Error('WhatsApp client not connected or connection not open');
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

export { connectToWhatsApp, sendMessage };