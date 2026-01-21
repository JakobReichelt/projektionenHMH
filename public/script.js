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
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    [this.video1, this.video2].forEach(video => {
      video.addEventListener('ended', () => this.onVideoEnded(video));
      video.addEventListener('error', (e) => this.onVideoError(video, e));
      video.addEventListener('canplay', () => log(`✓ Video ready: ${video.dataset.stage || 'unknown'}`));
    });
  }

  async loadAndPlay(stageId) {
    const videoPath = VIDEO_PATHS[stageId];
    const config = STAGE_FLOW[stageId];
    
    if (!videoPath || !config) {
      console.error(`Invalid stage: ${stageId}`);
      return false;
    }

    log(`Loading: ${stageId}`);
    
    // Prepare pending video
    this.pending.loop = config.loop;
    this.pending.dataset.stage = stageId;
    
    // Load video if different source
    if (this.pending.src !== window.location.origin + videoPath) {
      this.pending.src = videoPath;
      this.pending.load();
    }

    // Wait for video to be ready
    await this.waitForCanPlay(this.pending);

    // Play video
    try {
      await this.pending.play();
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

    // Preload next video if applicable
    if (config.next) {
      this.preloadNext(config.next);
    }

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
    }, 500);
  }

  preloadNext(stageId) {
    const videoPath = VIDEO_PATHS[stageId];
    if (!videoPath) return;
    
    log(`Preloading: ${stageId}`);
    this.pending.src = videoPath;
    this.pending.load();
  }

  onVideoEnded(video) {
    if (video !== this.active) return;
    
    const stageId = video.dataset.stage;
    const config = STAGE_FLOW[stageId];
    
    log(`Video ended: ${stageId}`);
    
    if (config && config.next) {
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
  // First interaction - hide overlay and ensure video plays
  if (!state.hasInteracted) {
    hideStartOverlay();
    state.hasInteracted = true;
    
    // Restart video1 with user gesture
    videoPlayer.loadAndPlay('video1');
    return;
  }

  // Stage-specific interactions
  if (state.currentStage === 'video3-looping') {
    sendMessage('2'); // Notify server
    videoPlayer.loadAndPlay('video4');
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

window.addEventListener('load', () => {
  log('Initializing...');
  
  // Create video player
  videoPlayer = new VideoPlayer();
  state.activeVideo = videoPlayer.active;

  // Connect WebSocket
  connectWebSocket();

  // Try autoplay
  videoPlayer.loadAndPlay('video1').catch(() => {
    log('Autoplay failed - waiting for user interaction');
  });

  // Show overlay on iOS
  if (state.isIOS) {
    showStartOverlay();
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
