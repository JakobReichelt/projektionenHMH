const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 8080;
const ASSETS_DIR = path.join(__dirname, 'assets');

// Get available asset folders
const getAssetFolders = () => {
  try {
    return fs.readdirSync(ASSETS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
};

// Determine default asset folder (NIKI preferred, or first alphabetically)
const getDefaultFolder = () => {
  const folders = getAssetFolders();
  return folders.find(f => f.toLowerCase() === 'niki') || folders.sort()[0] || null;
};

const DEFAULT_FOLDER = getDefaultFolder();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Helper function to find folder case-insensitively
const findFolder = (folderName) => {
  if (!folderName) return null;
  const folders = getAssetFolders();
  return folders.find(f => f.toLowerCase() === folderName.toLowerCase()) || null;
};

// Serve video files with range request support for better streaming
app.get(/^\/[1-6]\.mp4$/, (req, res, next) => {
  const videoFile = req.path.slice(1);
  const requestedShow = req.query.show || DEFAULT_FOLDER;
  
  if (!requestedShow) return next();
  
  // Find the actual folder name (case-insensitive)
  const show = findFolder(requestedShow);
  
  if (!show) return next();
  
  const filePath = path.join(ASSETS_DIR, show, videoFile);
  
  if (!fs.existsSync(filePath)) return next();
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  // Set moderate caching (1 hour) to allow for updates
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');
  
  if (range) {
    // Handle range requests for video seeking
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;
    
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', 'video/mp4');
    
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    // Send entire file
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', 'video/mp4');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
});

// Fallback: direct access to asset folders
app.use('/assets', express.static('assets'));

// Broadcast to all connected clients
const broadcast = (message) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected. Total:', wss.clients.size);
  
  ws.on('message', (message) => {
    const msg = message.toString().trim();
    console.log('Received:', msg);
    broadcast(msg);
  });

  ws.on('close', () => {
    console.log('Client disconnected. Total:', wss.clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// API endpoints
app.post('/broadcast', (req, res) => {
  const message = JSON.stringify({
    type: 'broadcast',
    data: req.body,
    timestamp: new Date().toISOString()
  });
  broadcast(message);
  res.json({ success: true, clients: wss.clients.size });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: wss.clients.size,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`📁 Default assets: ${DEFAULT_FOLDER || 'none'}`);
});
