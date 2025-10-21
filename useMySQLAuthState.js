import { proto, BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import pool from './db.js';

export async function useMySQLAuthState(clientId) {
    const writeData = async (key, value) => {
        const serializedValue = JSON.stringify(value, BufferJSON.replacer);
        const query = `
            INSERT INTO baileys_auth_store (clientId, keyId, value)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE value = ?;
        `;
        try {
            await pool.query(query, [clientId, key, serializedValue, serializedValue]);
        } catch (error) {
            console.error(`Failed to write auth data for key "${key}":`, error);
        }
    };

    const readData = async (key) => {
        const query = `SELECT value FROM baileys_auth_store WHERE clientId = ? AND keyId = ?;`;
        try {
            const [rows] = await pool.query(query, [clientId, key]);
            if (rows.length > 0) {
                return JSON.parse(rows[0].value, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`Failed to read auth data for key "${key}":`, error);
            return null;
        }
    };

    const removeData = async (key) => {
        const query = `DELETE FROM baileys_auth_store WHERE clientId = ? AND keyId = ?;`;
        try {
            await pool.query(query, [clientId, key]);
        } catch (error) {
            console.error(`Failed to remove auth data for key "${key}":`, error);
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = { };
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`);
                            if(type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromPartial(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for(const category in data) {
                        for(const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData('creds', creds);
        }
    };
}
