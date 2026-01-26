/**
 * Client Configuration
 * Centralized configuration for the interactive video experience
 * AI-Friendly: All settings in one place for easy modification
 */

const AppConfig = {
  // Stage definitions with video flow
  stages: {
    'video1': { next: 'video2', loop: false, number: 1 },
    'video2': { next: 'video3-looping', loop: false, number: 2 },
    'video3-looping': { next: null, loop: true, number: 3 }, // Requires user interaction
    'video4': { next: 'video5', loop: false, number: 4 },
    'video5': { next: 'video6-looping', loop: false, number: 5, blackScreen: 16000 }, // 16s black
    'video6-looping': { next: null, loop: true, number: 6 } // Final looping stage
  },

  // WebSocket settings
  websocket: {
    reconnectDelay: 3000,
    queueMessages: true
  },

  // Video player settings
  videoPlayer: {
    transitionDuration: 600, // CSS transition duration in ms
    preloadDelay: 1000, // Delay before preloading next video
    minBufferLooping: 1, // Minimum buffer for looping stages (seconds)
    minBufferNonLooping: 3, // Minimum buffer for non-looping stages (seconds)
    waitTimeout: 8000, // iOS wait timeout
    waitTimeoutNonIOS: 5000, // Non-iOS wait timeout
    chunkSize: 65536 // 64KB optimal for mobile
  },

  // iOS detection
  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent),

  // Debug settings
  debug: {
    enabledByQuery: (() => {
      try {
        return new URLSearchParams(window.location.search).get('debug') === '1';
      } catch {
        return false;
      }
    })(),
    forceHLS: (() => {
      try {
        return new URLSearchParams(window.location.search).get('hls') === '1';
      } catch {
        return false;
      }
    })(),
    maxLogEntries: 200,
    panelRefreshInterval: 1000
  },

  // Cookie settings
  cookie: {
    name: 'show',
    maxAgeDays: 365
  },

  // Video format selection
  getVideoExtension: function() {
    const isIOS = this.isIOS();
    // Use HLS on iOS only if forced via ?hls=1
    // Default to MP4 for reliability
    return (isIOS && this.debug.forceHLS) ? 'm3u8' : 'mp4';
  },

  // Build video URL
  buildVideoUrl: function(stageNumber, ext, showParam, sessionId) {
    const baseParams = 'v=2';
    const showQuery = showParam ? `&show=${encodeURIComponent(showParam)}` : '';
    const sidQuery = this.debug.enabledByQuery && sessionId ? `&sid=${encodeURIComponent(sessionId)}` : '';
    return `/${stageNumber}.${ext}?${baseParams}${showQuery}${sidQuery}`;
  }
};

// Make globally available
window.AppConfig = AppConfig;
