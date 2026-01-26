/**
 * Main Application Module
 * Initializes and coordinates all app components
 * AI-Friendly: Clear initialization sequence and global state
 */

// Global application state
window.appState = {
  currentStage: 'video1',
  hasInteracted: false,
  isIOS: window.AppConfig.isIOS(),
  activeVideo: null
};

// Global instances
window.videoPlayer = null;
window.wsClient = null;

/**
 * Show start overlay for user interaction
 */
window.showStartOverlay = function() {
  document.getElementById('startOverlay')?.classList.remove('hidden');
};

/**
 * Hide start overlay
 */
window.hideStartOverlay = function() {
  document.getElementById('startOverlay')?.classList.add('hidden');
};

/**
 * Show stage 6 content
 */
window.showStage6Content = function() {
  window.StageContent.show();
};

/**
 * Hide stage 6 content
 */
window.hideStage6Content = function() {
  window.StageContent.hide();
};

/**
 * Update debug panel info
 */
window.updateDebugInfo = function() {
  const stageEl = document.getElementById('debugStage');
  const videoEl = document.getElementById('debugVideo');
  const statesEl = document.getElementById('debugStates');

  if (stageEl) stageEl.textContent = window.appState.currentStage;
  if (videoEl) videoEl.textContent = window.appState.activeVideo?.dataset.stage || '-';
  
  if (statesEl && window.appState.activeVideo) {
    const v = window.appState.activeVideo;
    statesEl.textContent = `Ready:${v.readyState} Net:${v.networkState} Time:${v.currentTime.toFixed(1)}s`;
  }
};

/**
 * Toggle debug panel visibility
 */
window.toggleDebugPanel = function() {
  document.getElementById('debugPanel')?.classList.toggle('show');
};

/**
 * Manually switch to a stage (debug function)
 */
window.switchToStage = function(stageId) {
  window.VideoDiag.info('APP', `Manual stage switch to: ${stageId}`);
  if (window.videoPlayer) {
    window.videoPlayer.loadAndPlay(stageId);
  } else {
    window.VideoDiag.warn('APP', 'Video player not initialized yet');
  }
};

/**
 * Handle user interaction (tap/click/space/enter)
 */
function handleInteraction() {
  const overlay = document.getElementById('startOverlay');
  const overlayVisible = !overlay?.classList.contains('hidden');
  
  window.VideoDiag.info('APP', `Interaction - overlay:${overlayVisible}, hasInteracted:${window.appState.hasInteracted}, stage:${window.appState.currentStage}`);
  
  // Handle overlay dismissal
  if (overlayVisible) {
    window.hideStartOverlay();
    window.appState.hasInteracted = true;
    
    window.VideoDiag.info('APP', 'Dismissing overlay');
    
    // Start video1 if not started
    if (!window.videoPlayer.hasStartedPlayback) {
      window.VideoDiag.info('APP', 'Starting video1 after user gesture');
      window.videoPlayer.loadAndPlay('video1').catch(err => {
        console.error('Failed to start video1:', err);
      });
    } else {
      // Resume if paused
      const active = window.videoPlayer.active;
      if (active.paused) {
        window.VideoDiag.info('APP', 'Resuming paused video');
        active.play().catch(err => console.error('Resume failed:', err));
      }
    }
    return;
  }

  // Stage-specific interactions
  if (window.appState.currentStage === 'video3-looping') {
    window.VideoDiag.info('APP', 'Video 3 interaction - switching to video 4');
    if (window.wsClient) window.wsClient.send('2');
    window.videoPlayer.loadAndPlay('video4').catch(err => {
      console.error('Failed to switch to video4:', err);
    });
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  let lastInteractionTime = 0;
  let lastPointerUpTime = 0;
  const DEBOUNCE_MS = 300;

  function debouncedInteraction(e) {
    const now = Date.now();
    if (now - lastInteractionTime < DEBOUNCE_MS) {
      window.VideoDiag.warn('APP', 'Interaction debounced');
      return;
    }
    lastInteractionTime = now;
    handleInteraction();
  }

  function shouldIgnoreTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    if (target.closest('.debug-panel, .debug-toggle')) return true;

    // Allow interaction inside stage 6 overlay
    const overlay = document.getElementById('stage6Overlay');
    const stage6Visible = overlay && !overlay.classList.contains('hidden');
    if (stage6Visible && target.closest('#stage6Overlay')) return true;

    // Don't steal from interactive elements
    if (target.closest('a, button, input, textarea, select, label')) return true;

    return false;
  }

  // Pointer events (preferred for mouse + touch)
  document.addEventListener('pointerup', e => {
    if (shouldIgnoreTarget(e.target)) return;
    lastPointerUpTime = Date.now();
    debouncedInteraction(e);
  }, { passive: true });

  // Click events (fallback)
  document.addEventListener('click', e => {
    if (shouldIgnoreTarget(e.target)) return;
    // Avoid double-firing after pointerup
    if (lastPointerUpTime && Date.now() - lastPointerUpTime < 600) return;
    debouncedInteraction(e);
  });

  // Keyboard events
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      debouncedInteraction(e);
    }
  });

  // Clear log button
  document.getElementById('clearLogBtn')?.addEventListener('click', () => {
    const logEl = document.getElementById('messageLog');
    if (logEl) logEl.innerHTML = '';
  });
}

/**
 * Setup debug FPS counter
 */
function setupFPSCounter() {
  let frames = 0;
  let lastTime = performance.now();
  
  function updateFPS(now) {
    frames++;
    if (now - lastTime >= 1000) {
      const fpsEl = document.getElementById('debugUiFps');
      if (fpsEl) fpsEl.textContent = frames;
      frames = 0;
      lastTime = now;
      window.updateDebugInfo();
    }
    requestAnimationFrame(updateFPS);
  }
  
  requestAnimationFrame(updateFPS);
}

/**
 * Main initialization
 */
window.addEventListener('load', async () => {
  window.VideoDiag.info('APP', 'Initializing...');
  window.VideoDiag.info('ENV', 'Client environment', window.VideoDiag.env());
  
  // Create video player
  window.videoPlayer = new window.VideoPlayer();
  window.appState.activeVideo = window.videoPlayer.active;

  // Setup debugging hooks
  window.__videoDiag = {
    env: window.VideoDiag.env,
    snapshotActive: () => window.VideoDiag.snapshotVideo(window.appState.activeVideo),
    snapshot: (which = 1) => {
      const el = which === 2 
        ? document.getElementById('video-layer-2') 
        : document.getElementById('video-layer-1');
      return window.VideoDiag.snapshotVideo(el);
    },
    enableVerbose: () => window.VideoDiag.setEnabled(true),
    disableVerbose: () => window.VideoDiag.setEnabled(false)
  };

  // Connect WebSocket
  window.wsClient = new window.WebSocketClient(window.AppConfig.websocket.reconnectDelay);
  window.wsClient.connect();

  // Start preloading
  window.videoPlayer.preloadAllVideos().catch(err => {
    console.error('Preload error:', err);
  });

  // Setup event listeners
  setupEventListeners();
  
  // Setup FPS counter
  setupFPSCounter();

  // Handle autoplay/user interaction
  if (window.appState.isIOS) {
    window.showStartOverlay();
    window.VideoDiag.info('APP', 'iOS detected - tap to start');
  } else {
    window.VideoDiag.info('APP', 'Desktop - attempting autoplay');
    window.videoPlayer.loadAndPlay('video1').catch(() => {
      window.VideoDiag.warn('APP', 'Autoplay blocked - showing overlay');
      window.showStartOverlay();
    });
  }

  window.VideoDiag.info('APP', '✓ Ready');
});
