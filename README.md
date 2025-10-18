# WhatsApp API Backend

This project is a simple Node.js backend that uses `@whiskeysockets/baileys` (v7) to send WhatsApp messages through a secure API endpoint.

## Prerequisites

- Node.js (v18 or higher recommended)
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

## 3. First Run & Authentication (Pairing Code)

This application uses the new **Pairing Code** method to connect to your WhatsApp account. The old QR code method is no longer supported by the library.

Run the server for the first time:

```bash
node index.js
```

The application will prompt you to enter your mobile phone number in the terminal:
```
Please enter your mobile phone number (e.g., 1234567890):
```

1.  Enter your full phone number, including the country code, but without any `+` or spaces (e.g., `1234567890`).
2.  The application will then generate an 8-character pairing code and display it in the terminal:
    ```
    Your pairing code is: ABC-DEFG
    ```
3.  Open WhatsApp on your phone, go to **Settings > Linked Devices**, and tap **"Link a Device"**.
4.  Select the option to **"Link with phone number instead"**.
5.  Enter the 8-character code from your terminal.

Once the connection is successful, a session file will be created in the `auth_info_baileys` directory. On subsequent runs, the application will use this session file to log in automatically, so you only need to complete the pairing process once.

The server will then start, and you will see a message indicating it is ready to accept requests.

## 4. Sending a Message

To send a message, make a `POST` request to the `/api/send-message` endpoint.

- **Header:** `x-api-key: your-secret-api-key`
- **Body (JSON):**
  ```json
  {
    "to": "1234567890",
    "text": "Hello from my API!"
  }
  ```
  *(Replace `1234567890` with the recipient's phone number, including the country code.)*

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

### API Responses

- **Success (200 OK):**
  ```json
  {
    "success": true,
    "message": "Message sent successfully."
  }
  ```
- **Service Not Ready (503 Service Unavailable):**
  If the WhatsApp client is still initializing, you will receive this error. Please wait a few moments and try your request again.
  ```json
  {
    "error": "Service Unavailable: WhatsApp client is not ready.",
    "currentState": "CONNECTING"
  }
  ```
- **Other Errors (4xx/5xx):**
  Standard HTTP error codes will be returned for issues like a missing API key, bad request body, or internal server errors.