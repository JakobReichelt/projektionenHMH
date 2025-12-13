# WebSocket Server for TouchDesigner

A simple WebSocket server that connects to TouchDesigner via WebSocket protocol.

## Features

- Real-time WebSocket communication
- Broadcast messages to all connected clients
- REST API endpoint for sending data
- Health check endpoint
- JSON message format

## Setup

### Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:8080`

### Deploy to Railway

1. Push this repo to GitHub
2. Go to [Railway.app](https://railway.app)
3. Create a new project and connect your GitHub repo
4. Railway will automatically detect `package.json` and deploy
5. Your WebSocket URL will be something like: `wss://your-app.railway.app`

## API Endpoints

### WebSocket Connection
- **URL**: `ws://localhost:8080` (local) or `wss://your-app.railway.app` (Railway)
- **Message format**: JSON objects
- **Example**:
  ```json
  {
    "type": "sensor_data",
    "value": 42,
    "sensor": "temperature"
  }
  ```

### Broadcast (REST API)
- **Method**: POST
- **URL**: `/broadcast`
- **Body**: Any JSON data
- **Example**:
  ```bash
  curl -X POST http://localhost:8080/broadcast \
    -H "Content-Type: application/json" \
    -d '{"message": "Hello TouchDesigner"}'
  ```

### Health Check
- **Method**: GET
- **URL**: `/health`
- **Returns**: Server status and connected clients count

## TouchDesigner Integration

### Option 1: Using WebSocket DAT

1. In TouchDesigner, add a **WebSocket DAT** operator
2. Set the URL to your server (e.g., `wss://your-app.railway.app`)
3. Enable the DAT
4. Messages will appear in the DAT's table

### Option 2: Using Python Script DAT

```python
import websocket
import json
import threading

class WebSocketClient:
    def __init__(self, url):
        self.ws = websocket.WebSocketApp(
            url,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
            on_open=self.on_open
        )
        self.thread = threading.Thread(target=self.ws.run_forever)
        self.thread.daemon = True
        self.thread.start()
    
    def on_message(self, ws, message):
        print(f"Received: {message}")
        data = json.loads(message)
        # Process data here
    
    def on_error(self, ws, error):
        print(f"Error: {error}")
    
    def on_close(self, ws, close_status_code, close_msg):
        print("WebSocket closed")
    
    def on_open(self, ws):
        print("WebSocket connected")
    
    def send(self, data):
        self.ws.send(json.dumps(data))

# Usage
client = WebSocketClient('wss://your-app.railway.app')
client.send({"test": "message"})
```

## Environment Variables

The server uses `PORT` environment variable (defaults to 8080 if not set).

Railway will automatically set this for you.

## Message Format

All messages are JSON objects with the following structure:

```json
{
  "type": "message_type",
  "data": { /* your data */ },
  "timestamp": "2025-12-13T10:30:00.000Z"
}
```

## License

ISC
