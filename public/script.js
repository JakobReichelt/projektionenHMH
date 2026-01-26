// ============================================
// CONFIGURATION & STATE
// ============================================

// Cookie utilities
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
}

// Get show parameter from URL or cookie
function getShowParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlShow = urlParams.get('show');
  
  // If ?show= is in URL, store it in cookie
  if (urlShow !== null) {
    if (urlShow === '') {
      // ?show= (empty) clears the cookie
      setCookie('show', '', -1);
      return null;
    } else {
      setCookie('show', urlShow);
      return urlShow;
    }
  }
  
  // Otherwise, use cookie value
  const cookieShow = getCookie('show');
  return cookieShow || null;
}

// Build video paths with show parameter
function getVideoPaths() {
  const showParam = getShowParameter();
  const baseParams = 'v=2';
  const showQuery = showParam ? `&show=${encodeURIComponent(showParam)}` : '';

  // Use native HLS on iOS Safari to improve loading/startup behavior.
  // Other browsers keep using MP4 (unless you later add hls.js).
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const ext = isIOS ? 'm3u8' : 'mp4';
  
  console.log('Building video paths with show parameter:', showParam, 'ext:', ext);
  
  return {
    'video1': `/1.${ext}?${baseParams}${showQuery}`,
    'video2': `/2.${ext}?${baseParams}${showQuery}`,
    'video3-looping': `/3.${ext}?${baseParams}${showQuery}`,
    'video4': `/4.${ext}?${baseParams}${showQuery}`,
    'video5': `/5.${ext}?${baseParams}${showQuery}`,
    'video6-looping': `/6.${ext}?${baseParams}${showQuery}`
  };
}

const VIDEO_PATHS = getVideoPaths();
console.log('Video paths initialized:', VIDEO_PATHS);

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
  pendingVideo: null,
  messageQueue: [] // Queue messages to send when WS connects
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
      });
      
      // iOS debug logging
      if (state.isIOS) {
        video.addEventListener('loadstart', () => {
          log(`📱 iOS loadstart: ${video.dataset.stage || 'unknown'}`);
        });
        video.addEventListener('loadedmetadata', () => {
          log(`📱 iOS loadedmetadata: ${video.dataset.stage || 'unknown'} (duration: ${video.duration}s)`);
        });
        video.addEventListener('loadeddata', () => {
          log(`📱 iOS loadeddata: ${video.dataset.stage || 'unknown'} (readyState: ${video.readyState})`);
        });
        video.addEventListener('canplay', () => {
          log(`📱 iOS canplay: ${video.dataset.stage || 'unknown'} (readyState: ${video.readyState})`);
        });
        video.addEventListener('waiting', () => {
          log(`📱 iOS waiting/buffering: ${video.dataset.stage || 'unknown'}`);
        });
        video.addEventListener('stalled', () => {
          log(`📱 iOS stalled: ${video.dataset.stage || 'unknown'} (networkState: ${video.networkState})`);
        });
        video.addEventListener('playing', () => {
          log(`📱 iOS playing: ${video.dataset.stage || 'unknown'}`);
        });
        video.addEventListener('progress', () => {
          const buffered = video.buffered.length > 0 ? video.buffered.end(0).toFixed(1) : 0;
          log(`📱 iOS progress: ${video.dataset.stage || 'unknown'} buffered: ${buffered}s`);
        });
      }
    });
  }

  // Preload videos - using browser cache for all devices
  async preloadAllVideos() {
    if (this.isPreloading) return;
    this.isPreloading = true;
    
    log(`🔄 Preloading videos...`);
    
    const videoOrder = ['video1', 'video2', 'video3-looping', 'video4', 'video5', 'video6-looping'];
    
    // iOS-specific aggressive preloading for first video to reduce initial load time
    if (state.isIOS) {
      log('iOS detected - preloading first video');
      const firstVideoPath = VIDEO_PATHS['video1'];
      this.videoCache.set('video1', firstVideoPath);
      
      // On iOS, set the first video on the ACTIVE element (video1)
      // so it's ready when user taps to start
      this.video1.dataset.stage = 'video1';
      this.video1.src = firstVideoPath;
      this.video1.preload = 'auto'; // Use 'auto' for better buffering
      this.video1.load();
      log(`✓ iOS: Preloaded video1 on active element`);
      
      // ALSO preload video2 on the pending element since video1 is very short
      const secondVideoPath = VIDEO_PATHS['video2'];
      this.videoCache.set('video2', secondVideoPath);
      this.video2.dataset.stage = 'video2';
      this.video2.src = secondVideoPath;
      this.video2.preload = 'auto';
      this.video2.load();
      log(`✓ iOS: Preloaded video2 on pending element`);
      
      // Register remaining videos
      for (let i = 2; i < videoOrder.length; i++) {
        const videoId = videoOrder[i];
        const videoPath = VIDEO_PATHS[videoId];
        this.videoCache.set(videoId, videoPath);
        log(`✓ Registered: ${videoId}`);
      }
    } else {
      // Desktop/Android: Use lightweight preload strategy
      for (const videoId of videoOrder) {
        const videoPath = VIDEO_PATHS[videoId];
        
        // Register direct path
        this.videoCache.set(videoId, videoPath);
        
        // Trigger browser cache with HEAD request
        // This helps with connection setup and initial headers caching
        fetch(videoPath, { method: 'HEAD' }).catch(() => {});
        log(`✓ Registered: ${videoId}`);
      }
    }
    
    log('✅ Preload setup complete');
    this.isPreloading = false;
  }

  async loadAndPlay(stageId) {
    const config = STAGE_FLOW[stageId];
    
    if (!config) {
      console.error(`Invalid stage: ${stageId}`);
      return false;
    }
    
    // Prevent duplicate stage transitions (only if playback has started)
    if (state.currentStage === stageId && this.hasStartedPlayback) {
      log(`⚠️ Already in stage ${stageId} - ignoring duplicate transition`);
      return false;
    }

    // Special handling for video5 - show black screen for 16 seconds
    if (stageId === 'video5') {
      log(`▶️ Playing: ${stageId} (black screen for 16 seconds)`);
      
      // Hide current video to create black screen effect
      this.active.classList.remove('active');
      
      // Update state
      state.currentStage = stageId;
      updateDebugInfo();
      
      // Wait 16 seconds, then advance to video6-looping
      setTimeout(() => {
        log(`⏭️ Black screen complete - advancing to: video6-looping`);
        this.loadAndPlay('video6-looping');
      }, 16000);
      
      return true;
    }

    log(`▶️ Transitioning from ${state.currentStage} to ${stageId}`);
    
    // Get cached video URL (blob or fallback path)
    const cachedUrl = this.videoCache.get(stageId);
    const isCached = cachedUrl && cachedUrl.startsWith('blob:');
    
    log(`Cache status: ${isCached ? '✓ Using cached blob' : '⚠️ Loading from network'}`);
    
    const videoUrl = cachedUrl || VIDEO_PATHS[stageId];
    
    // iOS SPECIAL CASE: For video1, use the active element which was already preloaded
    // This avoids reloading and uses the already-buffered video
    let targetVideo = this.pending;
    
    if (state.isIOS && stageId === 'video1' && !this.hasStartedPlayback) {
      // On iOS, video1 was preloaded on this.active (video1 element)
      // Check if it's already loaded there
      const activeSrc = new URL(this.active.src || '', window.location.href).href;
      const targetSrc = new URL(videoUrl, window.location.href).href;
      
      if (activeSrc === targetSrc && this.active.readyState >= 1) {
        log(`📱 iOS: Using pre-loaded video1 from active element (readyState: ${this.active.readyState})`);
        targetVideo = this.active;
        // Don't swap videos for this case
      }
    }
    
    // Prepare target video
    targetVideo.loop = config.loop;
    targetVideo.dataset.stage = stageId;
    targetVideo.preload = 'auto';
    
    // Check if we need to load a new source
    const currentSrc = targetVideo.src;
    const targetSrc = new URL(videoUrl, window.location.href).href;

    if (currentSrc !== targetSrc) {
      targetVideo.src = videoUrl;
      targetVideo.load();
      
      if (state.isIOS) {
        log(`📱 iOS: Video src set for ${stageId}, readyState: ${targetVideo.readyState}, networkState: ${targetVideo.networkState}`);
      }
    } else {
      if (state.isIOS) {
        log(`📱 iOS: Reusing already-loaded src for ${stageId}, readyState: ${targetVideo.readyState}`);
      }
      // On iOS Safari, a <video> can report the same src but have readyState 0
      // (e.g. resource evicted). In that case, force a reload.
      if (state.isIOS && targetVideo.readyState === 0) {
        try {
          targetVideo.load();
        } catch {}
      } else {
        targetVideo.currentTime = 0;
      }
    }

    // iOS Safari is fragile with multiple <video> elements playing at once.
    // When using our double-buffer strategy, ensure only one is playing on iOS.
    if (state.isIOS && this.active && this.active !== targetVideo && !this.active.paused) {
      try {
        this.active.pause();
      } catch {}
    }

    // CRITICAL: On iOS, we must call play() promptly after setting src.
    // iOS Safari may not buffer until play() is called.
    const playPromise = targetVideo.play();
    
    if (state.isIOS) {
      log(`📱 iOS: play() called for ${stageId}, waiting for playback...`);
    }

    // Wait for video to be ready (this will resolve quickly if buffered)
    await this.waitForCanPlay(targetVideo);

    // Now wait for the play promise to complete
    try {
      await playPromise;
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

    // Swap active/pending (only if we used pending)
    if (targetVideo === this.pending) {
      this.swapVideos();
    } else {
      // Using active directly (iOS video1 case) - just make sure it's visible
      targetVideo.classList.add('active');
      // Update active reference to targetVideo
      this.active = targetVideo;
    }
    
    // Update state AFTER successful playback
    state.currentStage = stageId;
    state.activeVideo = targetVideo;
    updateDebugInfo();
    
    log(`✓ Now in stage: ${stageId}`);

    // Show stage 6 content overlay when video6-looping starts
    if (stageId === 'video6-looping') {
      showStage6Content();
    } else {
      hideStage6Content();
    }

    // Preload next video after a short delay to allow swap to finish
    this.preloadNext(stageId);

    return true;
  }

  preloadNext(currentStageId) {
    const config = STAGE_FLOW[currentStageId];
    // Determine next stage
    let nextStage = config ? config.next : null;
    
    // Special speculative preloading for video3
    if (currentStageId === 'video3-looping') {
        nextStage = 'video4';
    }

    if (!nextStage) return;

    log(`⏳ Scheduled preload for: ${nextStage}`);
    
    // Wait for swap transition (600ms) to complete before touching pending video
    setTimeout(() => {
       const nextUrl = this.videoCache.get(nextStage) || VIDEO_PATHS[nextStage];
       
       // Verify we are still in the same stage (user hasn't jumped)
       if (state.currentStage !== currentStageId) return;

       // Use this.pending which is now free (the hidden video layer)
       // This allows the browser to buffer the next video while current one plays
       log(`⬇️ Buffering next: ${nextStage}`);
       
       // Set dataset.stage for debug logging
       this.pending.dataset.stage = nextStage;
       this.pending.src = nextUrl;
       this.pending.preload = 'auto';
       this.pending.load();
       
       if (state.isIOS) {
         log(`📱 iOS: Started buffering ${nextStage}`);
       }
    }, 1000);
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

  waitForCanPlayThrough(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 4) {
        log(`📱 iOS: Already at readyState 4 (canplaythrough)`);
        resolve();
      } else {
        log(`📱 iOS: Waiting for canplaythrough, current readyState: ${video.readyState}`);
        // iOS: Wait for canplaythrough with short timeout
        const timeout = setTimeout(() => {
          log(`⚠️ iOS: canplaythrough timeout (readyState: ${video.readyState}, networkState: ${video.networkState})`);
          resolve();
        }, 2000);
        
        video.addEventListener('canplaythrough', () => {
          log(`📱 iOS: canplaythrough received`);
          clearTimeout(timeout);
          resolve();
        }, { once: true });
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
      this.pending.loop = false; // Reset loop attribute
      this.pending.removeAttribute('loop'); // Remove HTML attribute as well
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
    const mediaError = video?.error;
    const code = mediaError?.code;
    const message = mediaError?.message;
    log(`❌ Error loading video: ${video.dataset.stage || 'unknown'} (code: ${code ?? '-'}${message ? `, msg: ${message}` : ''})`);
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
    
    // Send any queued messages
    while (state.messageQueue.length > 0) {
      const msg = state.messageQueue.shift();
      state.ws.send(msg);
      log(`→ ${msg} (from queue)`);
    }
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
  } else {
    log(`⚠️ WebSocket not ready - queuing message: '${msg}'`);
    state.messageQueue.push(msg);
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
    videoPlayer.loadAndPlay('video4').catch(err => {
      console.error('Failed to switch to video4:', err);
      log(`❌ Failed to switch to video4: ${err.message}`);
    });
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

window.switchToStage = (stageId) => {
  log(`🔄 Manual stage switch to: ${stageId}`);
  if (videoPlayer) {
    videoPlayer.loadAndPlay(stageId);
  } else {
    log('⚠️ Video player not initialized yet');
  }
};

document.getElementById('clearLogBtn')?.addEventListener('click', () => {
  const logEl = document.getElementById('messageLog');
  if (logEl) logEl.innerHTML = '';
});

// ============================================
// EVENT LISTENERS
// ============================================

let lastInteractionTime = 0;
const INTERACTION_DEBOUNCE = 300; // ms

function debouncedInteraction(e) {
  const now = Date.now();
  if (now - lastInteractionTime < INTERACTION_DEBOUNCE) {
    log('⚠️ Interaction debounced (too fast)');
    return;
  }
  lastInteractionTime = now;
  handleInteraction();
}

// Use touchend instead of touchstart to prevent double-firing with click
let touchHandled = false;

document.addEventListener('touchend', (e) => {
  if (e.target.closest('.debug-panel, .debug-toggle')) return;
  e.preventDefault(); // Prevent click event from firing
  touchHandled = true;
  debouncedInteraction(e);
  
  // Reset flag after a delay
  setTimeout(() => { touchHandled = false; }, 500);
}, { passive: false });

document.addEventListener('click', (e) => {
  if (e.target.closest('.debug-panel, .debug-toggle')) return;
  if (touchHandled) return; // Skip if touch already handled this
  debouncedInteraction(e);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    debouncedInteraction(e);
  }
});

// ============================================
// STAGE 6 CONTENT OVERLAY
// ============================================

// Content templates for different shows
const STAGE6_CONTENT = {
  NIKI: {
    topImage: '/assets/NIKI/Rectangle4.png',
    title: 'Niki de Saint Phalle',
    intro: [
      'Farben, Kurven, Lebensfreude – und mittendrin Hannover. Kaum eine Künstlerin hat das Stadtbild so spielerisch geprägt wie Niki de Saint Phalle.',
      '„I have a very special feeling for Hannover." Dieses Gefühl ist bis heute spürbar. Besonders die berühmten Nanas am Leineufer sind längst mehr als Kunst: Sie gehören zur Stadt wie das Leben selbst.'
    ],
    sections: [
      {
        title: 'Nanas',
        image: '/assets/NIKI/nanas3.png',
        text: 'Die Nanas am Leineufer sind Nikis wohl bekanntestes Geschenk an Hannover. Als sie 1974 aufgestellt wurden, waren sie heftig umstritten – zu bunt, zu groß, zu provokant.<br><br>Heute sind sie unübersehbar und unverzichtbar. Sie stehen für Lebensfreude, Selbstbewusstsein und den Mut, Raum einzunehmen – genau das, wofür Niki de Saint Phalle lebte.'
      },
      {
        title: 'Sprengel',
        image: '/assets/NIKI/nanas2.png',
        text: 'Hannover und Niki de Saint Phalle verbindet auch das Sprengel Museum. Durch ihre Schenkungen wurde es zu einem der wichtigsten Orte für ihr Werk weltweit.<br><br>Ausstellungen wie „Love you for Infinity" zeigen bis heute, wie aktuell ihre Themen sind: Liebe, Freiheit, Körper und Politik – direkt, verspielt und kompromisslos.'
      },
      {
        title: 'Niki-Grotte',
        image: '/assets/NIKI/nanas1.png',
        text: 'Mitten in den Herrenhäuser Gärten öffnet sich eine kleine Fantasiewelt: die Niki-Grotte. Spiegel, Mosaike und Farben machen sie zu einem begehbaren Kunstwerk voller Überraschungen.<br><br>Sie zeigt, woran Niki glaubte: Kunst darf verzaubern, neugierig machen – und einfach Freude bereiten.',
        hasCircle: true
      },
      {
        title: 'Niki-<br>Promenade',
        image: '/assets/NIKI/nanas4.png',
        text: 'Auch im Alltag ist Niki in Hannover präsent. Die Niki-de-Saint-Phalle-Promenade am Kröpcke trägt ihren Namen – ganz selbstverständlich, mitten in der Stadt.<br><br>Viele gehen täglich darüber hinweg, ohne groß darüber nachzudenken. Und genau das passt perfekt zu Niki: Kunst, die da ist, lebt und begleitet.'
      }
    ],
    bottomImage: '/assets/NIKI/Rectangle1.png',
    logo: '/assets/NIKI/museum-logo.png',
    circleImage: '/assets/NIKI/ellipse.svg'
  },
  PFERDE: {
    topImage: '/assets/PFERDE/Rectangle4.png',
    title: 'Stadt und Ross',
    intro: [
      'Pferde gehören zu Hannovers Geschichte wie Straßen, Plätze und Parks. Sie waren Arbeitspartner, Statussymbol und Wirtschaftsfaktor – und haben die Stadt über Jahrhunderte mitgeformt.',
      'Diese Nähe ist bis heute spürbar. Ob im Stadtbild, im Sport oder ganz konkret auf den Straßen: Die Geschichte der Pferde prägt noch immer das heutige Erleben von Hannover.'
    ],
    sections: [
      {
        title: 'Hanno-<br>veraner',
        image: '/assets/PFERDE/pferde1.png',
        text: 'Der Hannoveraner ist eine der bekanntesten Pferderassen der Welt – und trägt den Namen der Stadt gleich mit. Ursprünglich als kräftiges Arbeitspferd gezüchtet, entwickelte er sich zu einem eleganten und leistungsstarken Sportpferd.<br><br>Bis heute steht der Hannoveraner für Qualität, Verlässlichkeit und internationale Klasse – und macht Hannover weltweit in Ställen und Turnieren sichtbar.'
      },
      {
        title: 'Symbolik',
        image: '/assets/PFERDE/pferde2.png',
        text: 'Das weiße Sachsenross im niedersächsischen Wappen ist eines der bekanntesten Pferdesymbole Deutschlands. Es steht für Stärke, Geschichte und regionale Identität – auch in Hannover.<br><br>Bis heute taucht das Pferd in Logos und Namen auf, etwa bei Continental oder dem Conti-Campus. Ein Zeichen dafür, wie selbstverständlich das Pferd Teil der visuellen Sprache der Stadt geblieben ist.'
      },
      {
        title: 'TiHo',
        image: '/assets/PFERDE/pferde3.png',
        text: 'Die Tierärztliche Hochschule Hannover wurde im 18. Jahrhundert gegründet, als Pferde für Militär, Landwirtschaft und Transport unverzichtbar waren. Ihre Gesundheit war ein zentrales öffentliches Interesse.<br><br>Die Hochschule steht bis heute für diesen Ursprung: wissenschaftliches Wissen, das aus der engen Verbindung zwischen Stadt, Tier und Gesellschaft entstanden ist.',
        hasCircle: true
      },
      {
        title: 'Pferde-<br>Bilder',
        image: '/assets/PFERDE/pferde4.png',
        text: 'Pferde sind in Hannovers Kunstgeschichte fest verankert. Das Reiterstandbild von König Ernst August vor dem Hauptbahnhof ist seit über 150 Jahren Wahrzeichen, Treffpunkt und Symbol für Hannovers Vergangenheit als Residenzstadt.<br><br>Auch am Leineufer taucht das Pferd in der Kunst auf: Die Skulptur „Mann und Pferd" zeigt die stille Nähe zwischen Mensch und Tier – reduziert, ruhig und eng mit der Geschichte der Stadt verbunden.'
      }
    ],
    bottomImage: '/assets/NIKI/Rectangle1.png',
    logo: '/assets/NIKI/museum-logo.png',
    circleImage: '/assets/NIKI/ellipse.svg'
  }
};

function loadStage6Content() {
  const showParam = getShowParameter();
  const showKey = showParam ? showParam.toUpperCase() : 'NIKI';
  const content = STAGE6_CONTENT[showKey] || STAGE6_CONTENT.NIKI;
  
  const container = document.getElementById('stage6Content');
  if (!container) return;
  
  // Add data attribute to identify which show is loaded
  container.setAttribute('data-show', showKey);
  
  let html = `
    <!-- Top Portrait Image -->
    <div class="top-portrait-section">
      <img src="${content.topImage}" alt="" class="top-portrait-img">
    </div>
    
    <!-- Main Title -->
    <h1 class="main-title">${content.title}</h1>
    
    <!-- Intro Text -->
    <div class="intro-text">
      ${content.intro.map(p => `<p>${p}</p>`).join('\n      ')}
    </div>
  `;
  
  // Add sections
  content.sections.forEach((section, index) => {
    const sectionClass = ['nanas', 'sprengel', 'grotte', 'promenade'][index] || 'section';
    
    html += `
    <!-- ${section.title.replace('<br>', ' ')} Section -->
    <h2 class="section-title">${section.title}</h2>
    <div class="${sectionClass}-image-section">
      <img src="${section.image}" alt="" class="section-img">
    </div>
    `;
    
    if (section.hasCircle) {
      html += `
    <!-- Circle Button -->
    <div class="circle-button">
      <img src="${content.circleImage}" alt="" class="circle-svg">
    </div>
    `;
    }
    
    html += `
    <p class="section-text">
      ${section.text}
    </p>
    `;
  });
  
  // Add bottom section
  html += `
    <!-- Bottom Section -->
    <div class="bottom-image-section">
      <img src="${content.bottomImage}" alt="" class="bottom-img">
    </div>
    <div class="bottom-white-bar"></div>
    
    <!-- Museum Logo -->
    <div class="museum-logo-section">
      <img src="${content.logo}" alt="" class="museum-logo">
    </div>
  `;
  
  container.innerHTML = html;
  log(`✓ Stage 6 content loaded for: ${showKey}`);
}

function showStage6Content() {
  loadStage6Content();
  const overlay = document.getElementById('stage6Overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    log('✓ Stage 6 content visible');
  }
}

function hideStage6Content() {
  const overlay = document.getElementById('stage6Overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

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
