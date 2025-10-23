import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { useMySQLAuthState } from "./useMySQLAuthState.js";
import { deleteSessionFromDB } from "./db.js";

const sessions = new Map();

export const ReadinessState = {
  CONNECTING: "CONNECTING",
  SYNCING: "SYNCING",
  READY: "READY",
  CLOSED: "CLOSED",
};

export function startSession(clientId, phoneNumber) {
  return new Promise(async (resolve, reject) => {
    if (sessions.has(clientId)) {
      console.log(`[${clientId}] Session already exists, skipping...`);
      return resolve(null);
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
      console.log(
        `[${clientId}] No existing credentials found in DB. This is a new session.`
      );
    } else {
      // Immediately resolve the promise for existing sessions that are reconnecting.
      // The connection logic will proceed in the background.
      resolve(null);
    }

    if (isNewSession) {
      console.log(
        `[${clientId}] No existing credentials found in DB. This is a new session.`
      );
      if (!phoneNumber) {
        const err = new Error("Phone number is required for a new session.");
        console.error(`[${clientId}] Error:`, err.message);
        sessions.delete(clientId);
        return reject(err);
      }
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`[${clientId}] using WA v${version.join(".")}`);

    session.sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      browser: ["Chrome", "Desktop", "112.0.5615.49"],
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    let connectionTimeout;
    let readinessTimeout;

    const handleConnectionUpdate = async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        clearTimeout(connectionTimeout); // Clear the timeout on successful connection
        session.state = ReadinessState.SYNCING;
        console.log(`[${clientId}] Connection opened, syncing history...`);

        if (isNewSession) {
          console.log("if", isNewSession);
          try {
            console.log(
              `[${clientId}] Requesting pairing code for phone number: ${phoneNumber}`
            );
            const code = await session.sock.requestPairingCode(phoneNumber);
            session.pairingCode = code;
            console.log(
              "----------------------------------------------------------------"
            );
            console.log(`[${clientId}] Your Pairing Code: ${code}`);
            console.log(
              "----------------------------------------------------------------"
            );
            // resolve(code); // Resolve the promise with the pairing code
          } catch (error) {
            console.error(`[${clientId}] Pairing code request failed:`, error);
            sessions.delete(clientId);
            reject(error);
          }
        } 
        
        // else {
        //   console.log("else", isNewSession);
        //   resolve(null); // Resolve with null for existing sessions
        // }

        readinessTimeout = setTimeout(() => {
          if (session.state === ReadinessState.SYNCING) {
            console.log(
              `[${clientId}] Syncing timed out after 60s. Assuming ready.`
            );
            session.state = ReadinessState.READY;
          }
        }, 60000);
      } else if (connection === "close") {
        clearTimeout(readinessTimeout);
        session.state = ReadinessState.CLOSED;
        const shouldReconnect =
          lastDisconnect.error instanceof Boom &&
          lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
        console.log(
          `[${clientId}] Connection closed. Should reconnect: ${shouldReconnect}`
        );

        sessions.delete(clientId);

        if (shouldReconnect) {
          console.log(`[${clientId}] Reconnecting...`);
          setTimeout(() => {
            startSession(clientId, null).catch((err) =>
              console.error(
                `[${clientId}] Error during automatic reconnection:`,
                err
              )
            );
          }, 5000);
        } else {
          await deleteSessionFromDB(clientId);
          console.log(
            `[${clientId}] Session logged out, data deleted from DB.`
          );
        }
      }
    };

    session.sock.ev.on("connection.update", handleConnectionUpdate);
    session.sock.ev.on("creds.update", saveCreds);

    // Set a timeout for the initial connection
    connectionTimeout = setTimeout(() => {
      if (session.state === ReadinessState.CONNECTING) {
        console.error(`[${clientId}] Connection timed out after 30s.`);
        session.sock.end(new Error("Connection timed out")); // Gracefully close the socket
        sessions.delete(clientId);
        reject(new Error("Connection timed out"));
      }
    }, 30000);

    session.sock.ev.on("messaging-history.set", () => {
      clearTimeout(readinessTimeout);
      session.state = ReadinessState.READY;
      console.log(`[${clientId}] History sync complete. Client is ready.`);
    });
  });
}

export function getSession(clientId) {
  return sessions.get(clientId);
}

export async function deleteSession(clientId) {
  const session = sessions.get(clientId);
  if (!session) throw new Error("Session not found");

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
