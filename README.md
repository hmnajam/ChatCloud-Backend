# WhatsApp Multi-Client API Backend

This project is a Node.js backend that uses `@whiskeysockets/baileys` (v7) to manage multiple WhatsApp accounts and send messages through a secure API. Session data is stored in a MySQL database, allowing for persistent sessions across server restarts.

## Features

- **Multi-Client:** Manage multiple WhatsApp accounts simultaneously.
- **Persistent Sessions:** Sessions are stored in a MySQL database and are automatically reconnected on startup.
- **Secure API:** Endpoints are protected with a static API key.
- **Interactive Pairing:** New clients are added using a simple, interactive pairing code flow in the terminal.

## Prerequisites

- Node.js (v18 or higher recommended)
- A running MySQL database.
- A WhatsApp account for each client you wish to connect.

## 1. Installation

Clone the repository and install the dependencies.

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

## 2. Configuration

Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and set your database credentials and a secure `API_KEY`. The `PORT` is optional and defaults to 3000.

```dotenv
# Database configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name

# API configuration
API_KEY=your-secret-api-key
PORT=3000
```

## 3. How It Works

This application can manage multiple WhatsApp accounts simultaneously. Each account is identified by a unique `clientId`.

- **On Startup:** The server will automatically connect to the MySQL database, create the necessary table if it doesn't exist, and then scan the database for existing sessions to reconnect them non-interactively.
- **API Endpoints:** You use a simple REST API to create new clients, view their status, delete them, and send messages.

---

## 4. API Usage

All API endpoints require an `x-api-key` header containing the `API_KEY` from your `.env` file.

### **Client Management (`/api/clients`)**

#### Create a New Client

This will start the interactive pairing process for a new WhatsApp account.

- **Endpoint:** `POST /api/clients`
- **Body (JSON):**
  ```json
  {
    "clientId": "your-unique-client-id"
  }
  ```
  *(e.g., "client-1", "work-phone", etc.)*

**After sending this request:**
1.  Look at the terminal where the Node.js application is running.
2.  It will prompt you to enter the phone number for this new client.
3.  After you enter the number, it will generate an 8-character **pairing code**.
4.  On your mobile phone, open WhatsApp, go to **Settings > Linked Devices > Link a Device**, and choose **"Link with phone number instead"**.
5.  Enter the pairing code to complete the setup. The session will be saved to the database.

#### List All Clients

This shows all active clients and their current readiness state (`CONNECTING`, `SYNCING`, `READY`, `CLOSED`).

- **Endpoint:** `GET /api/clients`
- **Example Response:**
  ```json
  [
    {
      "clientId": "client-1",
      "state": "READY",
      "pairingCode": null
    }
  ]
  ```

#### Delete a Client

This will log out the specified client and delete its session data from the database.

- **Endpoint:** `DELETE /api/clients/:clientId`
- **Example:** `DELETE /api/clients/client-1`

### **Message Sending (`/api/messages`)**

#### Send a Text Message

- **Endpoint:** `POST /api/messages/send`
- **Body (JSON):**
  ```json
  {
    "clientId": "client-1",
    "to": "1234567890",
    "text": "Hello from my multi-client API!"
  }
  ```
  *(Replace `clientId` with the ID of a connected client and `to` with the recipient's phone number.)*

**Important:** You can only send messages from clients that are in the `READY` state. If the client is still connecting or syncing, you will receive a `503 Service Unavailable` error. Wait a few moments for the client to become ready and try again.
