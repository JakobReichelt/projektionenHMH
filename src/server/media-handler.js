/**
 * Media Request Handler
 * Handles MP4 and HLS media file requests with iOS optimization
 * AI-Friendly: Single responsibility - serve media files with proper headers
 */

const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const config = require('./config');

/**
 * Create media request handler middleware
 * @param {string[]} availableFolders - List of available show folders
 * @param {string} defaultFolder - Default folder to use
 * @returns {Function} Express middleware function
 */
function createMediaHandler(availableFolders, defaultFolder) {
  return (req, res, next) => {
    const mediaFile = req.path.slice(1); // Remove leading slash
    const ext = path.extname(mediaFile);
    const show = utils.resolveShow(req, availableFolders, defaultFolder);

    if (!show) return next();

    // Persist explicit ?show= selections via cookie
    if (typeof req.query.show === 'string' && req.query.show.length > 0) {
      const normalized = utils.findFolder(req.query.show, availableFolders);
      if (normalized) {
        utils.setShowCookie(res, normalized, config.cookie.maxAge);
      }
    }

    const filePath = path.join(config.assetsDir, show, mediaFile);

    // Check if file exists
    if (!fs.existsSync(filePath)) return next();

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const isIOSDevice = utils.isIOS(req);

    // Performance tracking for iOS
    const tStart = process.hrtime.bigint();
    const sid = req.query.sid || null;
    let bytesSent = 0;

    // Log iOS media requests for debugging
    const shouldLog = isIOSDevice && (ext === '.mp4' || ext === '.m3u8' || ext === '.ts');
    if (shouldLog) {
      console.log(`📱 iOS ${req.method} ${mediaFile}, show=${show}, sid=${sid || '-'}, range=${range || 'none'}`);
    }

    // Finish logging
    const finishLog = (extra = {}) => {
      if (!shouldLog) return;
      const tEnd = process.hrtime.bigint();
      const ms = Number((tEnd - tStart) / 1000000n);
      console.log(
        `📱 iOS response: ${req.method} ${mediaFile}, status=${res.statusCode}, ms=${ms}, bytes=${bytesSent}, show=${show}`,
        extra
      );
    };

    res.on('finish', finishLog);
    res.on('close', () => {
      if (!res.writableEnded) finishLog({ closedEarly: true });
    });

    // Set caching headers (aggressive for iOS reliability)
    const { cacheMaxAge } = config.media;
    res.setHeader('Cache-Control', `public, max-age=${cacheMaxAge}, immutable, no-transform`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // ETag for cache validation
    const etag = `"${stat.size}-${stat.mtime.getTime()}"`;
    res.setHeader('ETag', etag);
    
    // Handle conditional requests (304 Not Modified)
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    // Content headers
    res.setHeader('Content-Type', utils.getContentTypeByExt(ext));
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    
    // CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // iOS optimization: Keep connections alive longer
    if (isIOSDevice) {
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=10, max=100');
    }

    // MP4 specific headers
    if (ext === '.mp4') {
      res.setHeader('Content-Disposition', 'inline');
    }

    // Range support for MP4 and TS segments
    const supportsRange = ext === '.mp4' || ext === '.ts';
    if (supportsRange) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Vary', 'Range');
    }

    // HLS playlists - serve whole file
    if (ext === '.m3u8') {
      res.setHeader('Content-Length', fileSize);
      if (req.method === 'HEAD') return res.end();
      
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => { bytesSent += chunk.length; });
      stream.on('error', err => {
        console.error(`Stream error for ${mediaFile}:`, err);
        if (!res.headersSent) res.status(500).end();
      });
      return stream.pipe(res);
    }

    // Handle range requests for MP4/TS
    if (supportsRange && range) {
      const parsed = utils.parseSingleByteRange(range, fileSize);
      
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

      // Optimal chunk size for iOS (64KB)
      const stream = fs.createReadStream(filePath, { 
        start, 
        end, 
        highWaterMark: config.media.chunkSize 
      });
      stream.on('data', chunk => { bytesSent += chunk.length; });
      stream.on('error', err => {
        console.error(`Stream error for ${mediaFile}:`, err);
        if (!res.headersSent) res.status(500).end();
      });
      return stream.pipe(res);
    }

    // No range header - send full response
    res.setHeader('Content-Length', fileSize);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath, { 
      highWaterMark: config.media.chunkSize 
    });
    stream.on('data', chunk => { bytesSent += chunk.length; });
    stream.on('error', err => {
      console.error(`Stream error for ${mediaFile}:`, err);
      if (!res.headersSent) res.status(500).end();
    });
    return stream.pipe(res);
  };
}

module.exports = { createMediaHandler };
