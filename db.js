import mysql from 'mysql2/promise';
import 'dotenv/config';

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Function to initialize the database table
export async function initDatabase() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS baileys_auth_store (
            clientId VARCHAR(255) NOT NULL,
            keyId VARCHAR(255) NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (clientId, keyId)
        );
    `;
    try {
        const connection = await pool.getConnection();
        await connection.query(createTableQuery);
        connection.release();
        console.log('Database table "baileys_auth_store" is ready.');
    } catch (error) {
        console.error('Failed to initialize database table:', error);
        throw error; // Propagate the error to be handled by the application's startup logic
    }
}

// Function to delete all auth data for a given clientId
export async function deleteSessionFromDB(clientId) {
    const query = `DELETE FROM baileys_auth_store WHERE clientId = ?;`;
    try {
        const [result] = await pool.query(query, [clientId]);
        console.log(`[${clientId}] Session deleted from database. Rows affected: ${result.affectedRows}`);
    } catch (error) {
        console.error(`[${clientId}] Failed to delete session from database:`, error);
        throw error;
    }
}

// Export the pool for use in other modules
export default pool;