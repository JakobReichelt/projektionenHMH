// ============================================
// CONFIGURATION & STATE
// ============================================

// ============================================
// DEVTOOLS DIAGNOSTICS LOGGER
// ============================================

const VideoDiag = (() => {
  const sessionId = Math.random().toString(16).slice(2, 8);
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let seq = 0;

  const enabledByQuery = (() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      return false;
    }
  })();

  const shouldForceHls = (() => {
    try {
      return new URLSearchParams(window.location.search).get('hls') === '1';
    } catch {
      return false;
    }
  })();

  const isEnabled = () => {
    try {
      return enabledByQuery || window.localStorage.getItem('videoDebug') === '1';
    } catch {
      return enabledByQuery;
    }
  };

  const pad = (n, w = 4) => String(n).padStart(w, '0');
  const nowMs = () => {
    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return t - t0;
  };

  const fmtRanges = (timeRanges) => {
    try {
      if (!timeRanges || typeof timeRanges.length !== 'number' || timeRanges.length === 0) return '[]';
      const out = [];
      for (let i = 0; i < timeRanges.length; i++) {
        out.push(`[${timeRanges.start(i).toFixed(2)}..${timeRanges.end(i).toFixed(2)}]`);
      }
      return `[${out.join(' ')}]`;
    } catch {
      return '[?]';
    }
  };

  const snapshotVideo = (video) => {
    if (!video) return null;
    const err = video.error;
    const playbackQuality = (typeof video.getVideoPlaybackQuality === 'function') ? video.getVideoPlaybackQuality() : null;
    return {
      stage: video.dataset?.stage || null,
      currentSrc: video.currentSrc || null,
      srcAttr: video.getAttribute ? video.getAttribute('src') : null,
      preload: video.preload,
      muted: video.muted,
      playsInline: video.playsInline,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : null,
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
      buffered: fmtRanges(video.buffered),
      seekable: fmtRanges(video.seekable),
      played: fmtRanges(video.played),
      error: err ? { code: err.code, message: err.message } : null,
      frameStats: playbackQuality ? {
        totalVideoFrames: playbackQuality.totalVideoFrames,
        droppedVideoFrames: playbackQuality.droppedVideoFrames
      } : null
    };
  };

  const writeToPanel = (line) => {
    const logEl = document.getElementById('messageLog');
    if (!logEl) return;

    while (logEl.children.length > 200) {
      logEl.removeChild(logEl.firstChild);
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = line;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const safeStringifyForPanel = (obj) => {
    try {
      const json = JSON.stringify(obj, (key, value) => {
        // Drop very large/noisy fields that don't help in the on-screen log.
        if (key === 'currentSrc' || key === 'srcAttr' || key === 'userAgent') return undefined;
        if (key === 'metadata') return undefined;
        if (key === 'snapshot') return undefined;
        if (typeof value === 'string' && value.length > 180) return `${value.slice(0, 180)}…`;
        return value;
      });
      if (!json) return '';
      return json.length > 220 ? `${json.slice(0, 220)}…` : json;
    } catch {
      return '';
    }
  };

  const panelDataSuffix = (category, message, data) => {
    if (!data || typeof data !== 'object') return '';

    // Make the debug panel actually actionable without needing the console object view.
    if (category === 'NET' && typeof message === 'string' && message.startsWith('probe_range')) {
      const status = data.status ?? '-';
      const hdr = data.headerMs ?? '-';
      const total = data.totalMs ?? '-';
      const tput = data.throughputKiBps ?? '-';
      const cr = data.contentRange ?? '-';
      const ar = data.acceptRanges ?? '-';
      const ct = data.contentType ?? '-';
      return ` {status:${status} hdr:${hdr}ms total:${total}ms KiBps:${tput} CR:${cr} AR:${ar} CT:${ct}}`;
    }

    if (category === 'WAIT' || category === 'MEDIA') {
      // snapshotVideo() shape
      if ('readyState' in data || 'networkState' in data) {
        const rs = data.readyState ?? '-';
        const ns = data.networkState ?? '-';
        const t = (typeof data.currentTime === 'number') ? data.currentTime.toFixed(2) : (data.currentTime ?? '-');
        const buf = data.buffered ?? '-';
        const err = data.error?.code ? ` err:${data.error.code}` : '';
        return ` {rs:${rs} ns:${ns} t:${t} buf:${buf}${err}}`;
      }
    }

    const json = safeStringifyForPanel(data);
    return json ? ` ${json}` : '';
  };

  const emit = (level, category, message, data) => {
    const n = ++seq;
    const ms = nowMs();
    const prefix = `[VD ${sessionId} #${pad(n)} +${ms.toFixed(0)}ms ${category}]`;

    const hasData = typeof data !== 'undefined' && data !== null;

    // Always log a readable line in DevTools. Attach structured data when available.
    try {
      if (hasData) {
        (console[level] || console.log)(prefix, message, data);
      } else {
        (console[level] || console.log)(`${prefix} ${message}`);
      }
    } catch {
      // ignore console failures
    }

    // Mirror into the on-page debug panel (string-only, keep it compact)
    try {
      const wallTime = new Date().toLocaleTimeString();
      const suffix = panelDataSuffix(category, message, data);
      writeToPanel(`[${wallTime}] ${prefix} ${message}${suffix}`);
    } catch {
      // ignore DOM failures
    }
  };

  const attachVideo = (video, label) => {
    if (!video) return;
    if (video.__vdAttached) return;
    video.__vdAttached = true;
    video.__vd = video.__vd || { lastSrcSetAt: null, lastStage: null, firstFrameLogged: false };

    const ev = (type, level = 'log', extra = null) => {
      video.addEventListener(type, () => {
        const stage = video.dataset?.stage || null;
        video.__vd.lastStage = stage;

        const sinceSrc = (typeof video.__vd.lastSrcSetAt === 'number')
          ? ` +${(nowMs() - video.__vd.lastSrcSetAt).toFixed(0)}ms_since_src`
          : '';

        const snap = snapshotVideo(video);
        const msg = `${label}:${stage || '-'} event=${type}${sinceSrc}`;

        // Only spam very chatty events when debug is enabled
        const noisy = type === 'timeupdate' || type === 'progress';
        if (noisy && !isEnabled()) return;

        emit(level, 'MEDIA', msg, extra ? { ...snap, ...extra } : snap);
      }, { passive: true });
    };

    // Core lifecycle
    ev('loadstart');
    ev('loadedmetadata');
    ev('loadeddata');
    ev('durationchange');
    ev('canplay');
    ev('canplaythrough');
    ev('play');
    ev('playing');
    ev('pause');
    ev('ended');
    ev('seeking');
    ev('seeked');
    ev('waiting', 'warn');
    ev('stalled', 'warn');
    ev('suspend', 'warn');
    ev('abort', 'warn');
    ev('emptied', 'warn');
    ev('error', 'error');

    // Noisy, but extremely useful for iOS HLS/MP4 buffering diagnosis
    ev('progress');
    ev('timeupdate');

    // First-frame detection (where supported)
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFirstFrame = () => {
        if (video.__vd.firstFrameLogged) return;
        video.__vd.firstFrameLogged = true;
        video.requestVideoFrameCallback((now, metadata) => {
          emit('log', 'PERF', `${label}:${video.dataset?.stage || '-'} first_frame`, {
            now,
            metadata,
            snapshot: snapshotVideo(video)
          });
        });
      };
      video.addEventListener('playing', onFirstFrame, { once: true, passive: true });
    }

    emit('log', 'MEDIA', `${label} attached`, snapshotVideo(video));
  };

  const probeCache = new Set();

  const netProbeRange = async (url, label) => {
    // Only run probes when explicitly debugging.
    if (!enabledByQuery) return;
    if (!url || typeof url !== 'string') return;
    if (probeCache.has(url)) return;
    probeCache.add(url);

    const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let resp;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          // Small-ish chunk to estimate throughput without downloading full file
          Range: 'bytes=0-524287'
        },
        cache: 'no-store'
      });
    } catch (e) {
      emit('warn', 'NET', `probe_failed ${label}`, { url, error: e && e.message ? e.message : String(e) });
      return;
    }

    const tHeaders = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let bytes = 0;
    try {
      const buf = await resp.arrayBuffer();
      bytes = buf.byteLength;
    } catch {
      // ignore
    }
    const tDone = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const headerMs = tHeaders - tStart;
    const totalMs = tDone - tStart;
    const kbps = totalMs > 0 ? (bytes / 1024) / (totalMs / 1000) : null;

    emit('log', 'NET', `probe_range ${label}`, {
      url,
      status: resp.status,
      ok: resp.ok,
      headerMs: Number(headerMs.toFixed(0)),
      totalMs: Number(totalMs.toFixed(0)),
      bytes,
      throughputKiBps: kbps ? Number(kbps.toFixed(1)) : null,
      contentType: resp.headers.get('content-type'),
      acceptRanges: resp.headers.get('accept-ranges'),
      contentRange: resp.headers.get('content-range'),
      contentLength: resp.headers.get('content-length')
    });

    // iOS Safari often stalls if MP4 doesn't respond with 206 + Content-Range.
    const contentRange = resp.headers.get('content-range');
    if (resp.status !== 206 || !contentRange) {
      emit('warn', 'NET', `probe_range_warning ${label}`, {
        url,
        status: resp.status,
        acceptRanges: resp.headers.get('accept-ranges'),
        contentRange,
        contentType: resp.headers.get('content-type')
      });
    }
  };

  const startWaitMonitor = (video, label) => {
    if (!enabledByQuery) return () => {};
    if (!video) return () => {};
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      emit('log', 'WAIT', `${label}:${video.dataset?.stage || '-'} waiting_tick`, snapshotVideo(video));
      if (ticks >= 15) {
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  };

  const markSrcSet = (video, stageId, url) => {
    if (!video) return;
    video.__vd = video.__vd || { lastSrcSetAt: null, lastStage: null, firstFrameLogged: false };
    video.__vd.lastSrcSetAt = nowMs();
    video.__vd.lastStage = stageId;
    video.__vd.firstFrameLogged = false;
    emit('log', 'MEDIA', `src_set ${stageId}`, { url, snapshot: snapshotVideo(video) });
  };

  const env = () => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      userAgent: ua,
      isIOS,
      isSafari,
      online: navigator.onLine,
      connection: conn ? {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData
      } : null,
      debugEnabled: isEnabled()
    };
  };

  // Global error hooks (helpful on iOS where failures can be silent)
  window.addEventListener('error', (e) => {
    emit('error', 'JS', 'window.error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error ? { name: e.error.name, message: e.error.message, stack: e.error.stack } : null
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    emit('error', 'JS', 'unhandledrejection', {
      reason: e.reason && typeof e.reason === 'object'
        ? { name: e.reason.name, message: e.reason.message, stack: e.reason.stack }
        : e.reason
    });
  });

  window.addEventListener('online', () => emit('log', 'NET', 'navigator online'));
  window.addEventListener('offline', () => emit('warn', 'NET', 'navigator offline'));
  document.addEventListener('visibilitychange', () => {
    emit('log', 'LIFECYCLE', `visibility=${document.visibilityState}`);
  });
  window.addEventListener('pagehide', (e) => emit('warn', 'LIFECYCLE', 'pagehide', { persisted: e.persisted }));
  window.addEventListener('pageshow', (e) => emit('log', 'LIFECYCLE', 'pageshow', { persisted: e.persisted }));

  return {
    sessionId,
    enabled: isEnabled,
    shouldForceHls: () => shouldForceHls,
    setEnabled: (v) => {
      try {
        window.localStorage.setItem('videoDebug', v ? '1' : '0');
      } catch {}
      emit('log', 'CFG', `videoDebug=${v ? '1' : '0'}`);
    },
    env,
    emit,
    info: (category, message, data) => emit('log', category, message, data),
    warn: (category, message, data) => emit('warn', category, message, data),
    error: (category, message, data) => emit('error', category, message, data),
    attachVideo,
    markSrcSet,
    snapshotVideo,
    netProbeRange,
    startWaitMonitor
  };
})();

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
function buildStageUrl(stageNumber, ext) {
  const showParam = getShowParameter();
  const baseParams = 'v=2';
  const showQuery = showParam ? `&show=${encodeURIComponent(showParam)}` : '';
  const sidQuery = (() => {
    try {
      return (new URLSearchParams(window.location.search).get('debug') === '1') ? `&sid=${encodeURIComponent(VideoDiag.sessionId)}` : '';
    } catch {
      return '';
    }
  })();
  return `/${stageNumber}.${ext}?${baseParams}${showQuery}${sidQuery}`;
}

function getVideoPaths() {
  // Use native HLS on iOS Safari to improve loading/startup behavior.
  // Other browsers keep using MP4 (unless you later add hls.js).
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  // Bigger perspective: HLS is currently failing with MEDIA_ERR_SRC_NOT_SUPPORTED (code 4)
  // in production. Default iOS to MP4 for reliability, and allow forcing HLS with ?hls=1.
  const ext = (isIOS && VideoDiag.shouldForceHls()) ? 'm3u8' : 'mp4';

  VideoDiag.info('CFG', 'Building video paths', { ext, isIOS });
  
  return {
    'video1': buildStageUrl(1, ext),
    'video2': buildStageUrl(2, ext),
    'video3-looping': buildStageUrl(3, ext),
    'video4': buildStageUrl(4, ext),
    'video5': buildStageUrl(5, ext),
    'video6-looping': buildStageUrl(6, ext)
  };
}

const VIDEO_PATHS = getVideoPaths();
VideoDiag.info('CFG', 'Video paths initialized', VIDEO_PATHS);

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
  messageQueue: [], // Queue messages to send when WS connects
  hlsFallbackStages: new Set(), // stages that have fallen back from HLS to MP4
  disableHls: false // if true, prefer MP4 for all stages (iOS only)
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

  hasSufficientBuffer(video, minSeconds = 6) {
    try {
      if (!video || typeof video.currentTime !== 'number' || !video.buffered) return false;
      const t = video.currentTime;
      for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);
        if (t >= start && t <= end) {
          return (end - t) >= minSeconds;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  setupEventListeners() {
    const pairs = [
      { video: this.video1, label: 'layer1' },
      { video: this.video2, label: 'layer2' }
    ];

    pairs.forEach(({ video, label }) => {
      VideoDiag.attachVideo(video, label);

      video.addEventListener('ended', () => this.onVideoEnded(video));
      video.addEventListener('error', (e) => this.onVideoError(video, e));
      video.addEventListener('canplaythrough', () => {
        const stage = video.dataset.stage;
        if (stage) log(`✓ Video buffered: ${stage}`);
      });
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

      // IMPORTANT (iOS/Safari): Do NOT preload multiple videos in parallel.
      // If HLS is missing and we fall back to MP4, parallel downloads can easily
      // stall playback for tens of seconds on iPhone.
      // We'll buffer the next stage later via preloadNext().
      const secondVideoPath = VIDEO_PATHS['video2'];
      this.videoCache.set('video2', secondVideoPath);
      log(`✓ iOS: Registered video2 (deferred preload)`);
      
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
      VideoDiag.markSrcSet(targetVideo, stageId, videoUrl);

      // When debugging iOS stalls, probe server range performance.
      // This tells us if the bottleneck is server delivery/TTFB.
      if (state.isIOS && typeof videoUrl === 'string' && videoUrl.includes('.mp4')) {
        VideoDiag.netProbeRange(videoUrl, stageId).catch(() => {});
      }

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
    const stopWaitMonitor = VideoDiag.startWaitMonitor(targetVideo, targetVideo === this.video1 ? 'layer1' : 'layer2');
    const playPromise = targetVideo.play();
    
    if (state.isIOS) {
      log(`📱 iOS: play() called for ${stageId}, waiting for playback...`);
    }

    // Wait for video to be ready (this will resolve quickly if buffered)
    await this.waitForCanPlay(targetVideo);

    // Now wait for the play promise to complete
    try {
      await playPromise;
      stopWaitMonitor();
      this.hasStartedPlayback = true; // Mark that playback has started
      
      // Send "1" to server when video 1 starts playing
      if (stageId === 'video1') {
        sendMessage('1');
      }
    } catch (error) {
      stopWaitMonitor();
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

       // iOS: Prefer *actual* buffering of the next stage to avoid cold-start loads.
       // Guard it to reduce the risk of starving the currently playing video.
       if (state.isIOS) {
         const isLoopingStage = !!(STAGE_FLOW[currentStageId] && STAGE_FLOW[currentStageId].loop);
         const minBuffer = isLoopingStage ? 2 : 8;
         const okToPreload = isLoopingStage || this.hasSufficientBuffer(this.active, minBuffer);

         if (!okToPreload) {
           log(`⬇️ iOS: Not enough buffer to preload next yet (HEAD only): ${nextStage}`);
           try {
             fetch(nextUrl, { method: 'HEAD' }).catch(() => {});
           } catch {}
           return;
         }

         // Preload into the hidden layer (pending) without playing.
         // This keeps only one <video> playing, but allows the browser to fetch ahead.
         log(`⬇️ iOS: Buffering next: ${nextStage}`);
         try {
           this.pending.dataset.stage = nextStage;
           this.pending.preload = 'auto';
           this.pending.loop = !!(STAGE_FLOW[nextStage] && STAGE_FLOW[nextStage].loop);
           this.pending.src = nextUrl;
           this.pending.load();
         } catch {}
         return;
       }

       // Non-iOS: Use this.pending which is now free (the hidden video layer)
       // This allows the browser to buffer the next video while current one plays
       log(`⬇️ Buffering next: ${nextStage}`);

       // Set dataset.stage for debug logging
       this.pending.dataset.stage = nextStage;
       this.pending.src = nextUrl;
       this.pending.preload = 'auto';
       this.pending.load();
    }, 1000);
  }

  waitForCanPlay(video) {
    return new Promise((resolve) => {
      let timeout = null;

      const done = (reason) => {
        try {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('loadeddata', onLoadedData);
          video.removeEventListener('playing', onPlaying);
        } catch {}
        if (timeout) clearTimeout(timeout);
        if (state.isIOS && reason) {
          VideoDiag.info('PERF', `waitForCanPlay resolved (${reason})`, VideoDiag.snapshotVideo(video));
        }
        resolve();
      };

      const onCanPlay = () => done('canplay');
      const onLoadedData = () => {
        // iOS sometimes never emits canplay, but loadeddata indicates usable frames.
        if (state.isIOS) return done('loadeddata');
      };
      const onPlaying = () => done('playing');

      if (video.readyState >= 3) return done('readyState>=3');
      if (state.isIOS && video.readyState >= 2) return done('readyState>=2');

      video.addEventListener('canplay', onCanPlay, { once: true, passive: true });
      video.addEventListener('loadeddata', onLoadedData, { once: true, passive: true });
      video.addEventListener('playing', onPlaying, { once: true, passive: true });

      const timeoutMs = state.isIOS ? 8000 : 5000;
      timeout = setTimeout(() => done('timeout'), timeoutMs);
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

    const stageId = video.dataset.stage || 'unknown';
    log(`❌ Error loading video: ${stageId} (code: ${code ?? '-'}${message ? `, msg: ${message}` : ''})`);

    // iOS Safari: If HLS fails (often code 4 = SRC_NOT_SUPPORTED), automatically retry with MP4.
    // This covers cases where HLS files aren't present on the server yet, playlist points to
    // wrong segment URLs, or the HLS stream copy produced an incompatible TS.
    if (state.isIOS && code === 4 && typeof video.src === 'string' && video.src.includes('.m3u8')) {
      // If HLS is failing at all, disable it globally to avoid repeated failures/extra latency.
      if (!state.disableHls) {
        state.disableHls = true;
        log('📱 iOS: HLS failed - disabling HLS globally and switching all stages to MP4');
        const map = [
          { id: 'video1', num: 1 },
          { id: 'video2', num: 2 },
          { id: 'video3-looping', num: 3 },
          { id: 'video4', num: 4 },
          { id: 'video5', num: 5 },
          { id: 'video6-looping', num: 6 }
        ];
        for (const { id, num } of map) {
          const mp4Url = buildStageUrl(num, 'mp4');
          this.videoCache.set(id, mp4Url);
        }
      }

      if (!state.hlsFallbackStages.has(stageId)) {
        state.hlsFallbackStages.add(stageId);

        const stageNumber = parseInt(stageId.replace(/\D+/g, ''), 10);
        if (!Number.isNaN(stageNumber) && stageNumber >= 1 && stageNumber <= 6) {
          const mp4Url = buildStageUrl(stageNumber, 'mp4');
          log(`↩️ iOS: HLS failed for ${stageId} - retrying MP4`);

          // Update cache so future transitions use MP4 for this stage.
          this.videoCache.set(stageId, mp4Url);

          try {
            video.src = mp4Url;
            video.load();
          } catch {}
        }
      }
    }
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
  // Backwards-compatible helper used across the codebase.
  // Mirrors to both DevTools console and the on-page debug panel.
  VideoDiag.emit('log', 'APP', message);
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
let lastPointerUpTime = 0;

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
// Simplest, scroll-safe input model:
// - Prefer Pointer Events (covers mouse + touch) without preventDefault()
// - Fall back to click

function shouldIgnoreGlobalInteractionTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  if (target.closest('.debug-panel, .debug-toggle')) return true;

  // When the Stage 6 overlay is visible, allow normal scrolling and tapping
  // inside it without advancing stages.
  const overlay = document.getElementById('stage6Overlay');
  const stage6Visible = overlay && !overlay.classList.contains('hidden');
  if (stage6Visible && target.closest('#stage6Overlay')) return true;

  // Don't steal gestures from interactive controls.
  if (target.closest('a, button, input, textarea, select, label')) return true;

  return false;
}

document.addEventListener('pointerup', (e) => {
  if (shouldIgnoreGlobalInteractionTarget(e.target)) return;
  lastPointerUpTime = Date.now();
  debouncedInteraction(e);
}, { passive: true });

document.addEventListener('click', (e) => {
  if (shouldIgnoreGlobalInteractionTarget(e.target)) return;
  // If pointer events are supported, a click may follow pointerup.
  if (lastPointerUpTime && Date.now() - lastPointerUpTime < 600) return;
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
    document.body.classList.add('stage6-open');
    // Ensure we start at the top of the long content.
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
    log('✓ Stage 6 content visible');
  }
}

function hideStage6Content() {
  const overlay = document.getElementById('stage6Overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  document.body.classList.remove('stage6-open');
}

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('load', async () => {
  log('Initializing...');
  VideoDiag.info('ENV', 'Client environment', VideoDiag.env());
  
  // Create video player
  videoPlayer = new VideoPlayer();
  state.activeVideo = videoPlayer.active;

  // Helpful runtime hooks for debugging on iOS via remote DevTools
  window.__videoDiag = {
    env: VideoDiag.env,
    snapshotActive: () => VideoDiag.snapshotVideo(state.activeVideo),
    snapshot: (which = 1) => {
      const el = which === 2 ? document.getElementById('video-layer-2') : document.getElementById('video-layer-1');
      return VideoDiag.snapshotVideo(el);
    },
    enableVerbose: () => VideoDiag.setEnabled(true),
    disableVerbose: () => VideoDiag.setEnabled(false)
  };

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
