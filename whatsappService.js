import { Boom } from '@hapi/boom';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

let sock;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        browser: Browsers.macOS('Desktop'),
        logger: pino({ level: 'info' }),
        shouldSyncHistoryMessage: () => false,
        printQRInTerminal: false, // v7 uses pairing code, not QR
    });

    // Handle pairing code
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('Please enter your mobile phone number (e.g., 1234567890): ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`Your pairing code is: ${code}`);
        console.log('Please enter this code in WhatsApp on your mobile phone (Settings > Linked Devices > Link a Device > Link with phone number).');
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('opened connection');
            rl.close(); // Close readline interface after successful connection
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

async function sendMessage(to, text) {
    if (!sock) {
        throw new Error('WhatsApp client not connected');
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