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

// Cookie parsing (no dependency)
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function getSubdomain(req) {
  const hostHeader = req.headers.host || '';
  const host = hostHeader.split(':')[0];
  if (!host) return null;

  // Ignore localhost and raw IPs
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  return parts[0] || null;
}

function setShowCookie(res, show) {
  if (typeof show !== 'string' || show.length === 0) return;
  const maxAge = 60 * 60 * 24 * 365;
  res.setHeader('Set-Cookie', `show=${encodeURIComponent(show)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`);
}

function resolveShow(req) {
  const q = typeof req.query.show === 'string' && req.query.show.length > 0 ? req.query.show : null;
  const cookies = parseCookies(req);
  const c = typeof cookies.show === 'string' && cookies.show.length > 0 ? cookies.show : null;
  const s = getSubdomain(req);

  const candidate = q || c || s || DEFAULT_FOLDER;
  const show = findFolder(candidate);
  return show || DEFAULT_FOLDER;
}

function getContentTypeByExt(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.m3u8':
      return 'application/vnd.apple.mpegurl';
    case '.ts':
      return 'video/mp2t';
    default:
      return 'application/octet-stream';
  }
}

function parseSingleByteRange(rangeHeader, fileSize) {
  if (typeof rangeHeader !== 'string') return null;
  if (!rangeHeader.startsWith('bytes=')) return null;

  // Safari (and some proxies) may send multi-range headers (comma-separated).
  // We don't emit multipart/byteranges responses, but we can safely honor the
  // first range to keep playback working.
  const rawSpec = rangeHeader.slice('bytes='.length).trim();
  const spec = rawSpec.includes(',') ? rawSpec.split(',')[0].trim() : rawSpec;
  if (!spec) return null;

  const dash = spec.indexOf('-');
  if (dash === -1) return { invalid: true };

  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  // Suffix range: bytes=-500 (last 500 bytes)
  if (startStr === '') {
    const suffixLen = parseInt(endStr, 10);
    if (Number.isNaN(suffixLen) || suffixLen <= 0) return { invalid: true };
    const end = fileSize - 1;
    const start = Math.max(0, fileSize - suffixLen);
    if (start > end) return { invalid: true };
    return { start, end };
  }

  const start = parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0) return { invalid: true };
  if (start >= fileSize) return { invalid: true };

  let end = fileSize - 1;
  if (endStr !== '') {
    const parsedEnd = parseInt(endStr, 10);
    if (!Number.isNaN(parsedEnd)) end = parsedEnd;
  }

  if (end < start) end = fileSize - 1;
  end = Math.min(end, fileSize - 1);
  return { start, end };
}

// Serve media files (MP4 + HLS) with proper headers.
// iOS Safari relies on Range requests for MP4 and often performs HEAD probes.
function handleMediaRequest(req, res, next) {
  const mediaFile = req.path.slice(1);
  const ext = path.extname(mediaFile);
  const show = resolveShow(req);

  const tStart = process.hrtime.bigint();
  const sid = typeof req.query.sid === 'string' ? req.query.sid : null;

  if (!show) return next();

  // Persist explicit ?show= selections so HLS segment requests
  // (which usually don't carry ?show=) still resolve correctly.
  if (typeof req.query.show === 'string' && req.query.show.length > 0) {
    const normalized = findFolder(req.query.show);
    if (normalized) setShowCookie(res, normalized);
  }

  const filePath = path.join(ASSETS_DIR, show, mediaFile);

  if (!fs.existsSync(filePath)) return next();

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // iOS Safari specific: Log user agent for debugging
  const userAgent = req.headers['user-agent'] || '';
  const isIOS = /iPhone|iPad|iPod/.test(userAgent);
  const shouldLog = isIOS && (ext === '.mp4' || ext === '.m3u8' || ext === '.ts');
  if (shouldLog) {
    console.log(`📱 iOS media request: ${req.method} ${mediaFile}, show=${show}, sid=${sid || '-'}, range=${range || 'none'}`);
  }

  // iOS optimization: Keep connections alive longer to reduce reconnection overhead
  if (isIOS) {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=10, max=100');
  }

  let bytesSent = 0;
  const finishLog = (extra = {}) => {
    if (!shouldLog) return;
    const tEnd = process.hrtime.bigint();
    const ms = Number((tEnd - tStart) / 1000000n);
    const status = res.statusCode;
    console.log(
      `📱 iOS media response: ${req.method} ${mediaFile}, status=${status}, ms=${ms}, bytes=${bytesSent}, show=${show}, sid=${sid || '-'}, range=${range || 'none'}`,
      extra
    );
  };

  res.on('finish', () => finishLog());
  res.on('close', () => {
    // close can happen on aborts; still useful to see partial transfers
    if (!res.writableEnded) finishLog({ closedEarly: true });
  });

  // Caching / proxy behavior
  // no-transform helps prevent intermediary proxies/CDNs from changing payloads,
  // which can break iOS media pipelines.
  res.setHeader('Cache-Control', 'public, max-age=3600, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Content headers
  res.setHeader('Content-Type', getContentTypeByExt(ext));
  res.setHeader('Last-Modified', stat.mtime.toUTCString());

  if (ext === '.mp4') {
    // Ensure Safari treats it as inline media.
    res.setHeader('Content-Disposition', 'inline');
  }

  // Range support for MP4 and TS segments
  const supportsRange = ext === '.mp4' || ext === '.ts';
  if (supportsRange) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Vary', 'Range');
  }

  // HLS playlists are small text files; serve whole file.
  if (ext === '.m3u8') {
    res.setHeader('Content-Length', fileSize);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => { bytesSent += chunk.length; });
    return stream.pipe(res);
  }

  // If client asks for a range (MP4/TS), respond with 206 and correct headers
  if (supportsRange && range) {
    const parsed = parseSingleByteRange(range, fileSize);
    if (!parsed || parsed.invalid) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const { start, end } = parsed;

    const chunkSize = (end - start) + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('data', (chunk) => { bytesSent += chunk.length; });
    return stream.pipe(res);
  }

  // No range header - send full response
  res.setHeader('Content-Length', fileSize);
  if (req.method === 'HEAD') return res.end();

  const stream = fs.createReadStream(filePath);
  stream.on('data', (chunk) => { bytesSent += chunk.length; });
  return stream.pipe(res);
}

// Stage assets (MP4 for most devices, HLS for iOS)
app.get(/^\/(?:[1-6]\.mp4|[1-6]\.m3u8|[1-6]_\d+\.ts)$/, handleMediaRequest);
app.head(/^\/(?:[1-6]\.mp4|[1-6]\.m3u8|[1-6]_\d+\.ts)$/, handleMediaRequest);

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
