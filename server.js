/**
 * Optimized WebSocket Server
 * Main server entry point - modular, maintainable, AI-friendly
 * 
 * Architecture:
 * - config.js: All configuration in one place
 * - utils.js: Pure utility functions
 * - media-handler.js: Media file serving with iOS optimization
 * - websocket-manager.js: WebSocket connection management
 */

const express = require('express');
const http = require('http');
const config = require('./src/server/config');
const utils = require('./src/server/utils');
const { createMediaHandler } = require('./src/server/media-handler');
const { 
  createWebSocketServer, 
  createBroadcastHandler, 
  createHealthHandler 
} = require('./src/server/websocket-manager');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Get available asset folders and determine default
const availableFolders = utils.getAssetFolders(config.assetsDir);
const defaultFolder = config.getDefaultShow(availableFolders);

console.log('📁 Available shows:', availableFolders);
console.log('📁 Default show:', defaultFolder || 'none');

// Middleware
app.use(express.json());
app.use(express.static(config.publicDir));

// Create media request handler
const mediaHandler = createMediaHandler(availableFolders, defaultFolder);

// Media routes (MP4, HLS)
app.get(/^\/(?:[1-6]\.mp4|[1-6]\.m3u8|[1-6]_\d+\.ts)$/, mediaHandler);
app.head(/^\/(?:[1-6]\.mp4|[1-6]\.m3u8|[1-6]_\d+\.ts)$/, mediaHandler);

// CORS preflight for media files
app.options(/^\/(?:[1-6]\.mp4|[1-6]\.m3u8|[1-6]_\d+\.ts)$/, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, If-None-Match');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Fallback: direct access to asset folders
app.use('/assets', express.static('assets'));

// WebSocket setup
const wss = createWebSocketServer(server);

// API endpoints
app.post('/broadcast', createBroadcastHandler(wss));
app.get('/health', createHealthHandler(wss));

// Start server
server.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📡 WebSocket: ws://localhost:${config.port}`);
  
  // Optimize HTTP server for iOS media delivery
  server.keepAliveTimeout = config.media.keepAliveTimeout;
  server.headersTimeout = config.media.headersTimeout;
  server.maxHeadersCount = config.media.maxHeadersCount;
  
  console.log('✅ Server optimized for iOS media streaming');
});
