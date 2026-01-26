/**
 * WebSocket Manager
 * Handles WebSocket connections and message broadcasting
 * AI-Friendly: Centralized WebSocket logic with clear event handlers
 */

const WebSocket = require('ws');

/**
 * Create and configure WebSocket server
 * @param {Object} server - HTTP server instance
 * @returns {Object} WebSocket server instance
 */
function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  // Broadcast to all connected clients
  wss.broadcast = function(message) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  };

  // Connection handler
  wss.on('connection', (ws) => {
    console.log('Client connected. Total:', wss.clients.size);
    
    ws.on('message', (message) => {
      const msg = message.toString().trim();
      console.log('Received:', msg);
      wss.broadcast(msg);
    });

    ws.on('close', () => {
      console.log('Client disconnected. Total:', wss.clients.size);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}

/**
 * Create broadcast endpoint handler
 * @param {Object} wss - WebSocket server instance
 * @returns {Function} Express route handler
 */
function createBroadcastHandler(wss) {
  return (req, res) => {
    const message = JSON.stringify({
      type: 'broadcast',
      data: req.body,
      timestamp: new Date().toISOString()
    });
    
    wss.broadcast(message);
    
    res.json({ 
      success: true, 
      clients: wss.clients.size 
    });
  };
}

/**
 * Create health check endpoint handler
 * @param {Object} wss - WebSocket server instance
 * @returns {Function} Express route handler
 */
function createHealthHandler(wss) {
  return (req, res) => {
    res.json({
      status: 'ok',
      clients: wss.clients.size,
      timestamp: new Date().toISOString()
    });
  };
}

module.exports = {
  createWebSocketServer,
  createBroadcastHandler,
  createHealthHandler
};
