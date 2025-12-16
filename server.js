const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.static('assets'));

// Broadcast message to all connected clients
const broadcast = (message, excludeWs = null) => {
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected. Total:', wss.clients.size);
  ws.send('CONNECTED');

  ws.on('message', (message) => {
    const msg = message.toString().trim();
    console.log('Received:', msg);
    broadcast(msg);
  });

  ws.on('close', () => console.log('Client disconnected. Total:', wss.clients.size));
  ws.on('error', (error) => console.error('WebSocket error:', error));
});

// REST endpoints
app.post('/broadcast', (req, res) => {
  const message = JSON.stringify({
    type: 'broadcast',
    data: req.body,
    timestamp: new Date().toISOString()
  });
  broadcast(message);
  res.json({ success: true, clientsReached: wss.clients.size });
});

app.get('/health', (req, res) => res.json({
  status: 'ok',
  connectedClients: wss.clients.size,
  timestamp: new Date().toISOString()
}));

app.get('/', (req, res) => res.json({
  server: 'WebSocket Server for TouchDesigner',
  endpoints: { websocket: 'ws://localhost:' + PORT, broadcast: 'POST /broadcast', health: 'GET /health' }
}));

server.listen(PORT, () => {
  console.log(`🚀 WebSocket running on port ${PORT}`);
  console.log(`📡 ws://localhost:${PORT}`);
});
