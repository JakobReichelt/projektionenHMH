const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected. Total clients:', wss.clients.size);
  clients.add(ws);

  // Send simple welcome message
  ws.send('CONNECTED');

  // Handle incoming messages from clients
  ws.on('message', (message) => {
    try {
      // Convert buffer to string if needed
      let messageStr = message.toString().trim();
      console.log('Received:', messageStr);
      
      // Broadcast raw message to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send('ERROR: ' + error.message);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', wss.clients.size);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// REST endpoint to send data to all connected WebSocket clients
app.post('/broadcast', (req, res) => {
  const data = req.body;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'broadcast',
        data: data,
        timestamp: new Date().toISOString()
      }));
    }
  });

  res.json({
    success: true,
    clientsReached: wss.clients.size,
    message: 'Data broadcasted to all clients'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients: wss.clients.size,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    server: 'WebSocket Server for TouchDesigner',
    endpoints: {
      websocket: 'ws://localhost:8080',
      broadcast: 'POST /broadcast',
      health: 'GET /health'
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 WebSocket URL: ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
