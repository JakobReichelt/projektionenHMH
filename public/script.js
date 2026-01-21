// ============================================
// CONFIGURATION & STATE
// ============================================

const VIDEO_PATHS = {
  'video1': '/1.mp4',
  'video2': '/2.mp4',
  'video3-looping': '/3.mp4',
  'video4': '/4.mp4',
  'video5': '/5.mp4',
  'video6-looping': '/6.mp4'
};

const STAGE_FLOW = {
  'video1': { next: 'video2', loop: false },
  'video2': { next: 'video3-looping', loop: false },
  'video3-looping': { next: null, loop: true }, // User interaction required
  'video4': { next: 'video5', loop: false },
  'video5': { next: 'video6-looping', loop: false },
  'video6-looping': { next: null, loop: true }
};

const state = {
  ws: null,
  currentStage: 'video1',
  hasInteracted: false,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  activeVideo: null,
  pendingVideo: null
};

// ============================================
// VIDEO MANAGER
// ============================================

class VideoPlayer {
  constructor() {
    this.video1 = document.getElementById('video-layer-1');
    this.video2 = document.getElementById('video-layer-2');
    this.active = this.video1;
    this.pending = this.video2;
    this.videoCache = new Map(); // Cache actual loaded video blobs
    this.isPreloading = false;
    this.hasStartedPlayback = false;
    
    // Ensure videos start hidden
    this.video1.classList.remove('active');
    this.video2.classList.remove('active');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    [this.video1, this.video2].forEach(video => {
      video.addEventListener('ended', () => this.onVideoEnded(video));
      video.addEventListener('error', (e) => this.onVideoError(video, e));
      video.addEventListener('canplaythrough', () => {
        const stage = video.dataset.stage;
        if (stage) log(`✓ Video buffered: ${stage}`);
      }, { once: true });
    });
  }

  // Preload videos - smart strategy based on device
  async preloadAllVideos() {
    if (this.isPreloading) return;
    this.isPreloading = true;
    
    const isMobile = state.isIOS || /Android/i.test(navigator.userAgent);
    
    log(`🔄 Preloading videos (${isMobile ? 'mobile mode' : 'desktop mode'})...`);
    
    const videoOrder = ['video1', 'video2', 'video3-looping', 'video4', 'video5', 'video6-looping'];
    
    // On mobile: Don't use blob caching (causes memory issues and slow loading)
    // Instead, rely on browser's HTTP cache with preload hints
    if (isMobile) {
      log('📱 Mobile - using lightweight preload strategy');
      
      for (const videoId of videoOrder) {
        const videoPath = VIDEO_PATHS[videoId];
        
        // Just mark with direct path - let browser handle caching
        this.videoCache.set(videoId, videoPath);
        
        // Trigger browser cache with HEAD request (lightweight)
        fetch(videoPath, { method: 'HEAD' }).catch(() => {});
        log(`✓ Registered: ${videoId}`);
      }
      
      log('✅ Mobile preload complete');
      this.isPreloading = false;
      return;
    }
    
    // Desktop: Use blob caching for instant playback
    for (const videoId of videoOrder) {
      const videoPath = VIDEO_PATHS[videoId];
      
      try {
        log(`⬇️ Fetching: ${videoId}...`);
        const response = await fetch(videoPath);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        this.videoCache.set(videoId, blobUrl);
        log(`✓ Cached: ${videoId} (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
      } catch (error) {
        console.error(`Failed to preload ${videoId}:`, error);
        log(`❌ Failed: ${videoId}`);
        this.videoCache.set(videoId, videoPath);
      }
    }
    
    log('✅ All videos cached in memory');
    this.isPreloading = false;
  }

  async loadAndPlay(stageId) {
    const config = STAGE_FLOW[stageId];
    
    if (!config) {
      console.error(`Invalid stage: ${stageId}`);
      return false;
    }

    log(`▶️ Playing: ${stageId}`);
    
    // Get cached video URL (blob or fallback path)
    const cachedUrl = this.videoCache.get(stageId);
    const isCached = cachedUrl && cachedUrl.startsWith('blob:');
    
    log(`Cache status: ${isCached ? '✓ Using cached blob' : '⚠️ Loading from network'}`);
    
    const videoUrl = cachedUrl || VIDEO_PATHS[stageId];
    
    // Prepare pending video
    this.pending.loop = config.loop;
    this.pending.dataset.stage = stageId;
    this.pending.preload = 'auto';
    
    // Use cached blob URL for instant playback
    if (this.pending.src !== videoUrl) {
      this.pending.src = videoUrl;
      this.pending.load();
    } else {
      this.pending.currentTime = 0;
    }

    // Wait for video to be ready
    await this.waitForCanPlay(this.pending);

    // Play video
    try {
      await this.pending.play();
      this.hasStartedPlayback = true; // Mark that playback has started
      
      // Send "1" to server when video 1 starts playing
      if (stageId === 'video1') {
        sendMessage('1');
      }
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        log('⚠️ Autoplay blocked - showing interaction prompt');
        showStartOverlay();
        return false;
      }
      throw error;
    }

    // Swap active/pending
    this.swapVideos();
    
    // Update state
    state.currentStage = stageId;
    state.activeVideo = this.active;
    updateDebugInfo();

    return true;
  }

  waitForCanPlay(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 3) {
        resolve();
      } else {
        video.addEventListener('canplay', resolve, { once: true });
      }
    });
  }

  swapVideos() {
    // Ensure pending is ready to become active
    this.pending.classList.remove('active');
    
    // Fade out old, fade in new
    this.active.classList.remove('active');
    this.pending.classList.add('active');

    // Swap references
    const temp = this.active;
    this.active = this.pending;
    this.pending = temp;

    // Clean up old video after transition
    setTimeout(() => {
      this.pending.pause();
      this.pending.currentTime = 0;
      this.pending.classList.remove('active'); // Ensure it's hidden
    }, 600);
  }

  onVideoEnded(video) {
    if (video !== this.active) return;
    
    const stageId = video.dataset.stage;
    const config = STAGE_FLOW[stageId];
    
    log(`📹 Video ended: ${stageId}, loop: ${config?.loop}`);
    
    // Don't advance if this is a looping video - it should loop automatically
    if (config && config.loop) {
      log(`🔄 Video ${stageId} is looping - not advancing`);
      return;
    }
    
    // Only advance to next stage if there is one and it's not looping
    if (config && config.next) {
      log(`⏭️ Advancing to: ${config.next}`);
      this.loadAndPlay(config.next);
    }
  }

  onVideoError(video, error) {
    console.error('Video error:', error);
    log(`❌ Error loading video: ${video.dataset.stage || 'unknown'}`);
  }
}

let videoPlayer;

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  log(`Connecting to ${wsUrl}...`);

  try {
    state.ws = new WebSocket(wsUrl);
  } catch (error) {
    log('❌ Connection failed');
    setTimeout(connectWebSocket, 3000);
    return;
  }

  state.ws.onopen = () => {
    log('✓ Connected');
    updateConnectionStatus(true);
  };

  state.ws.onclose = () => {
    log('Disconnected');
    updateConnectionStatus(false);
    setTimeout(connectWebSocket, 3000);
  };

  state.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  state.ws.onmessage = (event) => {
    const msg = event.data.trim();
    log(`← ${msg}`);

    if (msg === 'PING' || msg === 'CONNECTED') return;
    
    if (msg === 'RELOAD') {
      window.location.reload();
      return;
    }

    // Handle stage commands
    if (msg.startsWith('STAGE:') || msg.startsWith('VIDEO:')) {
      const stageId = msg.split(':')[1];
      videoPlayer.loadAndPlay(stageId);
    }
  };
}

function sendMessage(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(msg);
    log(`→ ${msg}`);
  }
}

// ============================================
// USER INTERACTION
// ============================================

function handleInteraction() {
  const overlay = document.getElementById('startOverlay');
  const overlayVisible = !overlay.classList.contains('hidden');
  
  log(`Interaction - overlayVisible: ${overlayVisible}, hasInteracted: ${state.hasInteracted}, currentStage: ${state.currentStage}`);
  
  // Only handle overlay dismissal if overlay is actually visible
  if (overlayVisible) {
    hideStartOverlay();
    state.hasInteracted = true;
    
    log('✋ iOS/Autoplay blocked - dismissing overlay');
    
    // Only start video1 if it hasn't started playing yet
    if (!videoPlayer.hasStartedPlayback) {
      log('▶️ Starting video1 after user gesture');
      videoPlayer.loadAndPlay('video1').catch(err => {
        console.error('Failed to start video1:', err);
        log(`❌ Failed to start: ${err.message}`);
      });
    } else {
      // Video is already loaded, just resume if paused
      const active = videoPlayer.active;
      if (active.paused) {
        log('▶️ Resuming paused video');
        active.play().catch(err => {
          console.error('Resume failed:', err);
        });
      }
    }
    
    return;
  }

  // Stage-specific interactions (only when overlay is not visible)
  if (state.currentStage === 'video3-looping') {
    log('✋ Video 3 interaction - switching to video 4');
    sendMessage('2'); // Notify server
    videoPlayer.loadAndPlay('video4');
  } else {
    log(`ℹ️ Interaction ignored - not in interactive stage (current: ${state.currentStage})`);
  }
}

function showStartOverlay() {
  document.getElementById('startOverlay').classList.remove('hidden');
}

function hideStartOverlay() {
  document.getElementById('startOverlay').classList.add('hidden');
}

// ============================================
// UI & DEBUG
// ============================================

function updateConnectionStatus(connected) {
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  
  if (connected) {
    status.classList.add('connected');
    status.classList.remove('disconnected');
    statusText.textContent = 'Connected';
  } else {
    status.classList.remove('connected');
    status.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
  }
}

function updateDebugInfo() {
  const stageEl = document.getElementById('debugStage');
  const videoEl = document.getElementById('debugVideo');
  const statesEl = document.getElementById('debugStates');

  if (stageEl) stageEl.textContent = state.currentStage;
  if (videoEl) videoEl.textContent = state.activeVideo?.dataset.stage || '-';
  
  if (statesEl && state.activeVideo) {
    const v = state.activeVideo;
    statesEl.textContent = `Ready:${v.readyState} Net:${v.networkState} Time:${v.currentTime.toFixed(1)}s`;
  }
}

function log(message) {
  const logEl = document.getElementById('messageLog');
  if (!logEl) return;

  // Limit log entries
  while (logEl.children.length > 100) {
    logEl.removeChild(logEl.firstChild);
  }

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

window.toggleDebugPanel = () => {
  document.getElementById('debugPanel').classList.toggle('show');
};

document.getElementById('clearLogBtn')?.addEventListener('click', () => {
  const logEl = document.getElementById('messageLog');
  if (logEl) logEl.innerHTML = '';
});

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('click', (e) => {
  if (e.target.closest('.debug-panel, .debug-toggle')) return;
  handleInteraction();
});

document.addEventListener('touchstart', (e) => {
  if (e.target.closest('.debug-panel, .debug-toggle')) return;
  handleInteraction();
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    handleInteraction();
  }
});

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('load', async () => {
  log('Initializing...');
  
  // Create video player
  videoPlayer = new VideoPlayer();
  state.activeVideo = videoPlayer.active;

  // Connect WebSocket
  connectWebSocket();

  // Start preloading in background (non-blocking)
  videoPlayer.preloadAllVideos().catch(err => {
    console.error('Preload error:', err);
  });

  // Only show overlay on iOS devices
  if (state.isIOS) {
    showStartOverlay();
    log('iOS detected - tap to start');
  } else {
    // Desktop: Try autoplay immediately
    log('Desktop - attempting autoplay');
    videoPlayer.loadAndPlay('video1').catch(() => {
      log('Autoplay blocked - showing overlay');
      showStartOverlay();
    });
  }

  // Debug FPS counter
  let frames = 0;
  let lastTime = performance.now();
  
  function updateFPS(now) {
    frames++;
    if (now - lastTime >= 1000) {
      const fpsEl = document.getElementById('debugUiFps');
      if (fpsEl) fpsEl.textContent = frames;
      frames = 0;
      lastTime = now;
      updateDebugInfo();
    }
    requestAnimationFrame(updateFPS);
  }
  
  requestAnimationFrame(updateFPS);
  
  log('✓ Ready');
});
