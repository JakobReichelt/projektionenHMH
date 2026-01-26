/**
 * Server Configuration
 * Centralized configuration for the WebSocket server
 * AI-Friendly: All configuration in one place for easy modification
 */

const path = require('path');

module.exports = {
  // Server settings
  port: process.env.PORT || 8080,
  assetsDir: path.join(__dirname, '..', '..', 'assets'),
  publicDir: path.join(__dirname, '..', '..', 'public'),
  
  // WebSocket settings
  websocket: {
    heartbeatInterval: 30000, // 30 seconds
    reconnectDelay: 3000 // 3 seconds
  },
  
  // Video stages configuration
  stages: ['video1', 'video2', 'video3-looping', 'video4', 'video5', 'video6-looping'],
  
  // Media serving settings
  media: {
    cacheMaxAge: 60 * 60 * 24 * 7, // 7 days
    keepAliveTimeout: 65000, // 65 seconds (longer than iOS default)
    headersTimeout: 66000, // Slightly longer than keepAlive
    maxHeadersCount: 100,
    chunkSize: 65536 // 64KB - optimal for mobile
  },
  
  // Cookie settings
  cookie: {
    name: 'show',
    maxAge: 60 * 60 * 24 * 365 // 1 year
  },
  
  // Default show (used when no subdomain/query/cookie)
  // Priority: NIKI preferred, or first alphabetically
  getDefaultShow: (availableFolders) => {
    return availableFolders.find(f => f.toLowerCase() === 'niki') 
           || availableFolders.sort()[0] 
           || null;
  }
};
