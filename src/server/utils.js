/**
 * Utility Functions
 * Helper functions used across the server
 * AI-Friendly: Pure functions with clear inputs/outputs
 */

const fs = require('fs');
const path = require('path');

/**
 * Get list of available asset folders
 * @param {string} assetsDir - Path to assets directory
 * @returns {string[]} Array of folder names
 */
function getAssetFolders(assetsDir) {
  try {
    return fs.readdirSync(assetsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Find folder case-insensitively
 * @param {string} folderName - Name to search for
 * @param {string[]} availableFolders - List of available folders
 * @returns {string|null} Matching folder name or null
 */
function findFolder(folderName, availableFolders) {
  if (!folderName) return null;
  return availableFolders.find(f => f.toLowerCase() === folderName.toLowerCase()) || null;
}

/**
 * Parse cookies from request headers
 * @param {Object} req - Express request object
 * @returns {Object} Parsed cookies
 */
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

/**
 * Extract subdomain from request
 * @param {Object} req - Express request object
 * @returns {string|null} Subdomain or null
 */
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

/**
 * Set show cookie in response
 * @param {Object} res - Express response object
 * @param {string} show - Show name
 * @param {number} maxAge - Max age in seconds
 */
function setShowCookie(res, show, maxAge) {
  if (typeof show !== 'string' || show.length === 0) return;
  res.setHeader('Set-Cookie', `show=${encodeURIComponent(show)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`);
}

/**
 * Resolve which show to use based on priority
 * Priority: query param > cookie > subdomain > default
 * @param {Object} req - Express request object
 * @param {string[]} availableFolders - Available show folders
 * @param {string} defaultFolder - Default folder
 * @returns {string|null} Show name to use
 */
function resolveShow(req, availableFolders, defaultFolder) {
  const query = req.query.show;
  const cookies = parseCookies(req);
  const cookie = cookies.show;
  const subdomain = getSubdomain(req);

  const candidate = query || cookie || subdomain || defaultFolder;
  return findFolder(candidate, availableFolders) || defaultFolder;
}

/**
 * Get content type by file extension
 * @param {string} ext - File extension (with or without dot)
 * @returns {string} MIME type
 */
function getContentTypeByExt(ext) {
  const normalized = (ext || '').toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t'
  };
  return types[normalized] || 'application/octet-stream';
}

/**
 * Parse byte range from Range header (supports single range only)
 * @param {string} rangeHeader - Range header value
 * @param {number} fileSize - Total file size
 * @returns {Object|null} {start, end} or {invalid: true} or null
 */
function parseSingleByteRange(rangeHeader, fileSize) {
  if (typeof rangeHeader !== 'string') return null;
  if (!rangeHeader.startsWith('bytes=')) return null;

  // Safari may send multi-range (comma-separated), we honor only first range
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

/**
 * Detect if request is from iOS device
 * @param {Object} req - Express request object
 * @returns {boolean} True if iOS
 */
function isIOS(req) {
  const userAgent = req.headers['user-agent'] || '';
  return /iPhone|iPad|iPod/.test(userAgent);
}

module.exports = {
  getAssetFolders,
  findFolder,
  parseCookies,
  getSubdomain,
  setShowCookie,
  resolveShow,
  getContentTypeByExt,
  parseSingleByteRange,
  isIOS
};
