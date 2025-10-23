import makeWASocket, {
    fetchLatestBaileysVersion,
    DisconnectReason,
    initAuthCreds,
    BufferJSON,
    proto
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

// This is a simplified in-memory authentication state helper,
// based on the structure required by Baileys.
const useInMemoryAuthState = () => {
    const creds = initAuthCreds();
    const keys = {};

    const saveCreds = () => {
        // In a real app, you would save the creds to a file or database.
        // For this test, we do nothing as it's ephemeral.
    };

    const readData = (key) => {
        return keys[key] || null;
    }

    const writeData = (key, value) => {
        keys[key] = value;
    }

    const removeData = (key) => {
        delete keys[key];
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    ids.forEach(id => {
                        let value = readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromPartial(value);
                        }
                        data[id] = value;
                    });
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                writeData(key, value);
                            } else {
                                removeData(key);
                            }
                        }
                    }
                },
            },
        },
        saveCreds,
    };
};


const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise(resolve => rl.question(text, resolve));

async function runTest() {
    console.log('--- Starting Standalone Pairing Code Test ---');

    const phoneNumber = await question('Please enter your full phone number (e.g., 1234567890): ');
    if (!phoneNumber) {
        console.error('Phone number is required.');
        rl.close();
        return;
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using Baileys version: ${version.join('.')}`);

    const { state, saveCreds } = useInMemoryAuthState();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'trace' }), // Use trace for max verbosity
        printQRInTerminal: false,
        auth: state,
        browser: [ 'Chrome', 'Desktop', '112.0.5615.49' ],
    });

    sock.ev.on('creds.update', saveCreds);

    let connectionTimeout = setTimeout(() => {
        console.error('--> TEST FAILED: Connection timed out after 30 seconds.');
        sock.end(new Error('Connection timed out'));
    }, 30000);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'open') {
            clearTimeout(connectionTimeout);
            console.log('Connection opened successfully. Requesting pairing code...');
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('-------------------------------------------');
                console.log(`--> TEST SUCCESS! Your pairing code is: ${code}`);
                console.log('-------------------------------------------');
            } catch (error) {
                console.error('--> TEST FAILED: Could not request pairing code.', error);
            } finally {
                sock.end(); // Close the connection after the test
            }
        } else if(connection === 'close') {
            clearTimeout(connectionTimeout);
            const reason = DisconnectReason[lastDisconnect?.error?.output?.statusCode] || 'Unknown';
            console.log(`Connection closed. Reason: ${reason}`);
            if (lastDisconnect?.error) {
                console.error('Underlying error:', lastDisconnect.error);
            }
            rl.close(); // Ensure readline is closed
        }
    });
}

runTest().catch(err => {
    console.error("--> TEST FAILED: The script crashed with an error.", err);
    rl.close();
});
