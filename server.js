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

const getAssetSubfolderMap = () => {
  try {
    const entries = fs.readdirSync(ASSETS_DIR, { withFileTypes: true });
    const map = new Map();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      map.set(entry.name.toLowerCase(), entry.name);
    }
    return map;
  } catch {
    return new Map();
  }
};

const ASSET_SUBFOLDERS = getAssetSubfolderMap();

const getDefaultAssetsFolder = () => {
  const configured = (process.env.DEFAULT_ASSETS_SUBDOMAIN || process.env.DEFAULT_ASSETS_FOLDER || '')
    .toString()
    .trim()
    .toLowerCase();

  if (configured) {
    const mapped = ASSET_SUBFOLDERS.get(configured);
    if (mapped) return mapped;

    // Allow specifying the real folder name as well
    for (const folderName of ASSET_SUBFOLDERS.values()) {
      if (folderName.toLowerCase() === configured) return folderName;
    }
  }

  // Project default: prefer NIKI if present
  for (const folderName of ASSET_SUBFOLDERS.values()) {
    if (folderName.toLowerCase() === 'niki') return folderName;
  }

  const ordered = Array.from(ASSET_SUBFOLDERS.values()).sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  );
  return ordered[0] || null;
};

const DEFAULT_ASSETS_FOLDER = getDefaultAssetsFolder();

const getSubdomainKeyFromHost = (hostHeader) => {
  if (!hostHeader || typeof hostHeader !== 'string') return null;

  const host = hostHeader.split(':')[0].trim().toLowerCase();
  if (!host) return null;

  // Example: leibniz.example.com -> leibniz
  // Example (local dev): leibniz.localhost -> leibniz
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;

  // Avoid treating IPs like subdomains
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;

  return parts[0] || null;
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve background videos based on subdomain.
// Requests like /1.mp4 are mapped to assets/<SUBDOMAIN>/1.mp4 when such a folder exists.
app.get(/^\/(?:[1-7])\.mp4$/, (req, res, next) => {
  const subdomainKey = getSubdomainKeyFromHost(req.headers.host);
  const requestedFile = req.path.slice(1);

  const candidateFolders = [];

  if (subdomainKey) {
    const folderName = ASSET_SUBFOLDERS.get(subdomainKey);
    if (folderName) candidateFolders.push(folderName);
  }

  if (DEFAULT_ASSETS_FOLDER && !candidateFolders.includes(DEFAULT_ASSETS_FOLDER)) {
    candidateFolders.push(DEFAULT_ASSETS_FOLDER);
  }

  for (const folderName of candidateFolders) {
    const filePath = path.join(ASSETS_DIR, folderName, requestedFile);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  return next();
});

// Fallback: allow direct access to /LEIBNIZ/1.mp4 etc.
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
