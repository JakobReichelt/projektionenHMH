// ===== STATE MANAGEMENT =====
const STATE = {
  ws: null,
  currentStage: 'video1',
  hasInteracted: false,
  allowInteraction: true,
  reconnectAttempts: 0,
  iosInitiated: false,
  videos: {},
  isIOS: CONFIG.isIOS(),
  activeVideoId: null,
  debug: {
    uiFps: null,
    rafId: null,
    videoFps: null,
    dropsPerSec: null,
    videoMonitorToken: 0,
    lastDecodedFrames: null,
    lastDroppedFrames: null,
    lastFrameSampleTs: null
  }
};

const MAX_LOG_ENTRIES = 200;

// Cache video elements on load
const initVideos = () => {
  STATE.videos = {
    video1: document.getElementById('video1'),
    video2: document.getElementById('video2'),
    video3: document.getElementById('video3'),
    video4: document.getElementById('video4'),
    video5: document.getElementById('video5'),
    video6: document.getElementById('video6')
  };
};

// ===== STAGE DISPLAY =====
const updateStageDisplay = (stageId) => {
  const stage = CONFIG.getStage(stageId);
  const title = document.getElementById('stageTitle');
  const text = document.getElementById('stageText');
  const display = document.querySelector('.stage-display');

  title.textContent = stage?.title || '';
  text.textContent = stage?.text || '';
  text.classList.remove('interactive', 'black-text');
  title.classList.remove('black-text');
  display.classList.remove('interactive');
  text.onclick = null;

  // Special handling for interactive stages
  if (stageId === 'video3-looping') {
    STATE.allowInteraction = true;
    display.classList.add('interactive');
    text.classList.add('interactive');
    text.onclick = () => {
      handleInteraction();
    };
  } else if (stageId === 'video6-looping') {
    STATE.allowInteraction = false;
    title.classList.add('black-text');
    text.classList.add('black-text');
  } else {
    STATE.allowInteraction = true;
  }

  console.log(`Stage: ${stageId}`);
  updateDebugMetrics();
};

// ===== VIDEO PLAYBACK =====
const ensureVideoSourceLoaded = (videoId) => {
  const video = STATE.videos[videoId];
  if (!video) return false;

  const source = video.querySelector('source');
  if (!source) return false;

  const hasSrc = !!source.getAttribute('src');
  const dataSrc = source.getAttribute('data-src');
  if (!hasSrc && dataSrc) {
    source.setAttribute('src', dataSrc);
    video.load();
  }

  return true;
};

const preloadVideoSource = (videoId) => {
  try {
    ensureVideoSourceLoaded(videoId);
    const video = STATE.videos[videoId];
    if (!video) return;
    // Encourage buffering for the *next* clip without pulling everything.
    video.preload = 'auto';
    if (STATE.activeVideoId !== videoId) {
      // Avoid interrupting currently playing video.
      video.load();
    }
  } catch {
    // no-op
  }
};

const waitForVideoReady = (video, minReadyState = 3, timeoutMs = 4000) => {
  if (!video) return Promise.resolve(false);
  if (video.readyState >= minReadyState) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const startedAt = performance.now();

    const done = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const check = () => {
      if (video.readyState >= minReadyState) {
        done(true);
      }
    };

    const onError = () => done(false);
    const onCanPlay = () => check();
    const onLoadedData = () => check();
    const onProgress = () => check();

    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      video.removeEventListener('error', onError);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('progress', onProgress);
    };

    video.addEventListener('error', onError);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('progress', onProgress);

    const intervalId = setInterval(() => {
      check();
      if (performance.now() - startedAt > timeoutMs) {
        done(video.readyState >= minReadyState);
      }
    }, 150);

    const timeoutId = setTimeout(() => {
      done(video.readyState >= minReadyState);
    }, timeoutMs);
  });
};

const transitionToVideo = async (videoId, onEnded = null, isLooping = false, options = {}) => {
  const {
    minReadyState = 3,
    timeoutMs = 4000,
    logWait = true
  } = options;

  const prevId = STATE.activeVideoId;
  const prevVideo = prevId ? STATE.videos[prevId] : null;

  // Freeze current frame while the next clip buffers.
  if (prevVideo && prevId !== videoId) {
    prevVideo.pause();
  }

  ensureVideoSourceLoaded(videoId);
  const nextVideo = STATE.videos[videoId];
  if (!nextVideo) return;

  nextVideo.preload = 'auto';
  nextVideo.loop = isLooping;
  nextVideo.onended = onEnded;
  try {
    nextVideo.currentTime = 0;
  } catch {
    // ignore
  }

  if (logWait) addLog(`⏳ Preparing: ${videoId}`);
  const ready = await waitForVideoReady(nextVideo, minReadyState, timeoutMs);
  if (!ready) addLog(`⚠️ Not buffered yet: ${videoId} (ready=${nextVideo.readyState})`);

  // Show the new video only once it has enough buffered data to render.
  Object.values(STATE.videos).forEach(v => {
    if (v !== prevVideo) v.classList.remove('active');
  });
  nextVideo.classList.add('active');

  STATE.activeVideoId = videoId;
  startVideoFpsMonitor();
  updateDebugMetrics();

  try {
    await (nextVideo.play() || Promise.resolve());
  } catch (err) {
    console.error(`Failed to play ${videoId}:`, err);
    addLog(`❌ Play failed: ${videoId}`);
  }

  // Once the new video is active, fully hide/pause others.
  Object.values(STATE.videos).forEach(v => {
    if (v !== nextVideo) {
      v.classList.remove('active');
      v.pause();
    }
  });
};

const playVideo = (videoId, onEnded = null, isLooping = false) => {
  // Legacy hard switch. Prefer transitionToVideo() for clean buffered transitions.
  transitionToVideo(videoId, onEnded, isLooping, { minReadyState: 2, timeoutMs: 1500, logWait: false });
};

const initializeVideoSequence = () => {
  document.getElementById('stageTitle').textContent = '';
  document.getElementById('stageText').textContent = '';

  // Warm up first and next video only.
  preloadVideoSource('video1');
  preloadVideoSource('video2');

  // 1 -> 2 -> loop 3 (wait interaction) -> 4 -> 5 -> loop 6 (end)
  transitionToVideo('video1', () => {
    STATE.currentStage = 'video2';
    updateStageDisplay('video2');

    preloadVideoSource('video3');

    transitionToVideo('video2', () => {
      preloadVideoSource('video4');
      transitionToVideo('video3', null, true);
      STATE.currentStage = 'video3-looping';
      updateStageDisplay('video3-looping');
      STATE.hasInteracted = false;
    }, false);
  }, false);
};

const startLoop6 = () => {
  preloadVideoSource('video6');
  transitionToVideo('video6', null, true);
  STATE.currentStage = 'video6-looping';
  updateStageDisplay('video6-looping');
  STATE.allowInteraction = false;
};

// ===== INTERACTION HANDLING =====
const handleInteraction = () => {
  if (STATE.isIOS && !STATE.iosInitiated) {
    STATE.iosInitiated = true;
    initializeVideoSequence();
    return;
  }

  if (STATE.hasInteracted) return;
  STATE.hasInteracted = true;

  switch (STATE.currentStage) {
    case 'video3-looping':
      if (STATE.ws?.readyState === WebSocket.OPEN) {
        STATE.ws.send('2');
      }

      // Interaction during looping 3 triggers 4 -> 5 -> loop 6 (end)
      STATE.currentStage = 'video4';
      updateStageDisplay('video4');
      preloadVideoSource('video5');
      transitionToVideo('video4', () => {
        STATE.currentStage = 'video5';
        updateStageDisplay('video5');
        transitionToVideo('video5', () => startLoop6(), false, { minReadyState: 3, timeoutMs: 6000 });
      }, false);
      break;
  }
};

// Interaction listeners
document.addEventListener('touchstart', () => {
  if (STATE.allowInteraction) handleInteraction();
});

document.addEventListener('click', (e) => {
  const isButton = e.target.classList.contains('main-button') || 
                   e.target.classList.contains('debug-toggle') || 
                   e.target.classList.contains('interactive');
  if (STATE.allowInteraction && !isButton) handleInteraction();
});

// ===== DEBUG PANEL =====
const toggleDebugPanel = () => {
  document.getElementById('debugPanel').classList.toggle('show');
};

const addLog = (message) => {
  const log = document.getElementById('messageLog');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.appendChild(entry);

  while (log.children.length > MAX_LOG_ENTRIES) {
    log.removeChild(log.firstElementChild);
  }

  log.scrollTop = log.scrollHeight;
};

const clearLog = () => {
  const log = document.getElementById('messageLog');
  log.innerHTML = '';
  addLog('Log cleared');
};

const getActiveVideo = () => {
  const video = STATE.activeVideoId ? STATE.videos[STATE.activeVideoId] : null;
  return video || null;
};

const formatVideoState = (video) => {
  if (!video) return '-';

  const ready = video.readyState;
  const net = video.networkState;
  // readyState: 0..4, networkState: 0..3
  return `ready=${ready} net=${net} t=${video.currentTime.toFixed(1)}`;
};

const getFrameStats = (video) => {
  if (!video) return '-';
  try {
    if (typeof video.getVideoPlaybackQuality === 'function') {
      const q = video.getVideoPlaybackQuality();
      const dropped = q.droppedVideoFrames ?? q.droppedVideoFrameCount;
      const total = q.totalVideoFrames ?? q.totalVideoFrameCount;
      if (typeof total === 'number') {
        return `dropped=${dropped ?? '?'} total=${total}`;
      }
    }

    // WebKit counters (Safari)
    const decoded = video.webkitDecodedFrameCount;
    const dropped = video.webkitDroppedFrameCount;
    if (typeof decoded === 'number') {
      return `dropped=${dropped ?? '?'} decoded=${decoded}`;
    }
  } catch {
    // ignore
  }
  return '-';
};

const getFrameCounters = (video) => {
  if (!video) return null;
  try {
    if (typeof video.getVideoPlaybackQuality === 'function') {
      const q = video.getVideoPlaybackQuality();
      const dropped = q.droppedVideoFrames ?? q.droppedVideoFrameCount;
      const total = q.totalVideoFrames ?? q.totalVideoFrameCount;
      if (typeof total === 'number') {
        return { decoded: total, dropped: typeof dropped === 'number' ? dropped : null };
      }
    }

    const decoded = video.webkitDecodedFrameCount;
    const dropped = video.webkitDroppedFrameCount;
    if (typeof decoded === 'number') {
      return { decoded, dropped: typeof dropped === 'number' ? dropped : null };
    }
  } catch {
    // ignore
  }
  return null;
};

const updateDebugMetrics = () => {
  const stageEl = document.getElementById('debugStage');
  const videoEl = document.getElementById('debugVideo');
  const uiFpsEl = document.getElementById('debugUiFps');
  const videoFpsEl = document.getElementById('debugVideoFps');
  const dropsEl = document.getElementById('debugDropsPerSec');
  const statesEl = document.getElementById('debugStates');
  const framesEl = document.getElementById('debugFrames');

  if (!stageEl || !videoEl || !uiFpsEl || !videoFpsEl || !dropsEl || !statesEl || !framesEl) return;

  const activeVideo = getActiveVideo();

  stageEl.textContent = STATE.currentStage || '-';
  videoEl.textContent = STATE.activeVideoId || '-';
  uiFpsEl.textContent = STATE.debug.uiFps ? `${STATE.debug.uiFps.toFixed(0)}` : '-';
  videoFpsEl.textContent = STATE.debug.videoFps ? `${STATE.debug.videoFps.toFixed(1)}` : '-';
  dropsEl.textContent = typeof STATE.debug.dropsPerSec === 'number' ? `${STATE.debug.dropsPerSec.toFixed(1)}` : '-';
  statesEl.textContent = formatVideoState(activeVideo);
  framesEl.textContent = getFrameStats(activeVideo);
};

const startFpsMonitor = () => {
  let last = performance.now();
  let frames = 0;
  let lastReport = last;

  const tick = (now) => {
    frames += 1;
    const elapsed = now - lastReport;
    if (elapsed >= 1000) {
      STATE.debug.uiFps = (frames * 1000) / elapsed;
      frames = 0;
      lastReport = now;
      updateDebugMetrics();
    }
    last = now;
    STATE.debug.rafId = requestAnimationFrame(tick);
  };

  if (STATE.debug.rafId) cancelAnimationFrame(STATE.debug.rafId);
  STATE.debug.rafId = requestAnimationFrame(tick);
};

const startVideoFpsMonitor = () => {
  const video = getActiveVideo();
  STATE.debug.videoMonitorToken += 1;
  const token = STATE.debug.videoMonitorToken;

  STATE.debug.videoFps = null;
  STATE.debug.dropsPerSec = null;
  STATE.debug.lastDecodedFrames = null;
  STATE.debug.lastDroppedFrames = null;
  STATE.debug.lastFrameSampleTs = null;

  if (!video) {
    updateDebugMetrics();
    return;
  }

  // Best signal: actual video frame delivery
  if (typeof video.requestVideoFrameCallback === 'function') {
    let count = 0;
    let droppedAtStart = null;
    let totalAtStart = null;
    let windowStart = performance.now();

    const onFrame = () => {
      if (token !== STATE.debug.videoMonitorToken) return;

      count += 1;
      const now = performance.now();
      const elapsed = now - windowStart;

      // For drops/sec, sample counters occasionally
      const counters = getFrameCounters(video);
      if (counters && droppedAtStart === null && typeof counters.dropped === 'number') {
        droppedAtStart = counters.dropped;
        totalAtStart = counters.decoded;
      }

      if (elapsed >= 1000) {
        STATE.debug.videoFps = (count * 1000) / elapsed;
        count = 0;
        windowStart = now;

        if (counters && typeof counters.dropped === 'number' && droppedAtStart !== null) {
          const droppedDelta = counters.dropped - droppedAtStart;
          const totalDelta = counters.decoded - (totalAtStart ?? counters.decoded);
          // If totals reset between videos, clamp
          const safeDroppedDelta = Number.isFinite(droppedDelta) ? Math.max(0, droppedDelta) : 0;
          const safeTotalDelta = Number.isFinite(totalDelta) ? Math.max(0, totalDelta) : 0;
          STATE.debug.dropsPerSec = safeDroppedDelta;
          droppedAtStart = counters.dropped;
          totalAtStart = counters.decoded;
          // If a browser doesn't drop but stutters, videoFps will reflect it.
          void safeTotalDelta;
        }

        updateDebugMetrics();
      }

      video.requestVideoFrameCallback(onFrame);
    };

    video.requestVideoFrameCallback(onFrame);
    return;
  }

  // Fallback: poll decoded-frame counters and compute deltas per second
  const poll = () => {
    if (token !== STATE.debug.videoMonitorToken) return;

    const now = performance.now();
    const counters = getFrameCounters(video);
    if (counters) {
      const lastTs = STATE.debug.lastFrameSampleTs;
      const lastDecoded = STATE.debug.lastDecodedFrames;
      const lastDropped = STATE.debug.lastDroppedFrames;

      if (typeof lastTs === 'number' && typeof lastDecoded === 'number') {
        const dt = (now - lastTs) / 1000;
        if (dt > 0) {
          const decodedDelta = Math.max(0, counters.decoded - lastDecoded);
          STATE.debug.videoFps = decodedDelta / dt;

          if (typeof counters.dropped === 'number' && typeof lastDropped === 'number') {
            const droppedDelta = Math.max(0, counters.dropped - lastDropped);
            STATE.debug.dropsPerSec = droppedDelta / dt;
          }
          updateDebugMetrics();
        }
      }

      STATE.debug.lastFrameSampleTs = now;
      STATE.debug.lastDecodedFrames = counters.decoded;
      STATE.debug.lastDroppedFrames = typeof counters.dropped === 'number' ? counters.dropped : null;
    }

    setTimeout(poll, 1000);
  };

  poll();
};

const updateStatus = (connected) => {
  const status = document.getElementById('status');
  const text = document.getElementById('statusText');
  
  if (connected) {
    status.classList.remove('disconnected');
    status.classList.add('connected');
    text.textContent = 'Connected ✓';
  } else {
    status.classList.remove('connected');
    status.classList.add('disconnected');
    text.textContent = 'Disconnected ✗';
  }
};

const updateFeedback = (message) => {
  document.getElementById('feedback').textContent = message;
};

// ===== WEBSOCKET MANAGEMENT =====
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  STATE.ws = new WebSocket(`${protocol}//${window.location.host}`);

  STATE.ws.onopen = () => {
    updateStatus(true);
    addLog('✅ Connected');
    STATE.reconnectAttempts = 0;
    // Send 1 when site loads
    STATE.ws.send('1');
  };

  STATE.ws.onmessage = (e) => {
    try {
      const data = (() => {
        try { return JSON.parse(e.data); }
        catch { return e.data; }
      })();
      addLog(`📨 ${typeof data === 'object' ? data.type : data}`);
    } catch (err) {
      console.error('Message error:', err);
    }
  };

  STATE.ws.onerror = () => addLog('❌ Connection error');

  STATE.ws.onclose = () => {
    updateStatus(false);
    addLog('⚠️ Disconnected');
    
    if (STATE.reconnectAttempts < CONFIG.reconnect.maxAttempts) {
      STATE.reconnectAttempts++;
      addLog(`🔄 Reconnecting... (${STATE.reconnectAttempts}/${CONFIG.reconnect.maxAttempts})`);
      setTimeout(connectWebSocket, CONFIG.reconnect.delayMs);
    }
  };
};

const sendMessage = (data) => {
  if (STATE.ws?.readyState === WebSocket.OPEN) {
    STATE.ws.send(data.toString());
    addLog(`📤 Sent: ${data}`);
  }
};

const sendButton = (buttonName) => {
  if (STATE.ws?.readyState === WebSocket.OPEN) {
    const num = buttonName.replace('button', '');
    sendMessage(num);
    updateFeedback(`Button: ${buttonName}`);
    
    const btn = document.querySelector('.main-button');
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 600);
  } else {
    updateFeedback('⚠️ Not connected');
  }
};

// ===== INITIALIZATION =====
window.addEventListener('load', () => {
  initVideos();
  connectWebSocket();

  document.getElementById('clearLogBtn')?.addEventListener('click', clearLog);
  startFpsMonitor();

  // Useful playback events (helps diagnose buffering)
  Object.entries(STATE.videos).forEach(([id, video]) => {
    video.addEventListener('waiting', () => addLog(`⏳ Buffering: ${id}`));
    video.addEventListener('playing', () => addLog(`▶️ Playing: ${id}`));
    video.addEventListener('stalled', () => addLog(`⚠️ Stalled: ${id}`));
  });
  
  if (!STATE.isIOS) {
    setTimeout(initializeVideoSequence, 500);
  }
});

window.addEventListener('beforeunload', () => STATE.ws?.close());
