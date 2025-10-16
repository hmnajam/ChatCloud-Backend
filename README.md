# WhatsApp API Backend

This project is a simple Node.js backend that uses `@whiskeysockets/baileys` to send WhatsApp messages through a secure API endpoint.

## Prerequisites

- Node.js (v14 or higher recommended)
- A WhatsApp account

## 1. Installation

Clone the repository and install the dependencies.

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

## 2. Configuration

The application requires environment variables to run. Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and set the following variables:

- `PORT`: The port on which the server will run (e.g., 3000).
- `API_KEY`: A secret key of your choice to protect the API endpoint.

## 3. First Run & Authentication

To connect the application to your WhatsApp account, you need to scan a QR code.

Run the server for the first time:

```bash
node index.js
```

A QR code will be generated and displayed in your terminal. Open WhatsApp on your phone, go to **Settings > Linked Devices**, and scan the QR code.

Once the connection is successful, a session file will be created in the `auth_info_baileys` directory. On subsequent runs, the application will use this session file to log in automatically, so you only need to scan the QR code once.

You should see the following output in your terminal:
```
Server is running on port 3000
To send a message, make a POST request to http://localhost:3000/api/send-message
Make sure to include your API key in the "x-api-key" header.
```

## 4. Sending a Message

To send a message, make a `POST` request to the `/api/send-message` endpoint.

- **Header:** `x-api-key: your-secret-api-key`
- **Body (JSON):**
  ```json
  {
    "to": "1234567890",
    "text": "Hello from the API!"
  }
  ```
  *(Replace `1234567890` with the recipient's phone number, including the country code but without any `+` or spaces.)*

### Example `curl` command:

```bash
curl -X POST \
  http://localhost:3000/api/send-message \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: your-secret-api-key' \
  -d '{
    "to": "1234567890",
    "text": "Hello from the API!"
  }'
```

### Responses

- **Success (200 OK):**
  ```json
  {
    "success": true,
    "message": "Message sent successfully."
  }
  ```
- **Error (401 Unauthorized):**
  ```json
  {
    "error": "Unauthorized: Invalid API Key"
  }
  ```
- **Error (500 Internal Server Error):**
  ```json
  {
    "error": "Failed to send message."
  }
  ```