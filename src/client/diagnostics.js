/**
 * Video Diagnostics Logger
 * Comprehensive logging for video playback debugging (especially iOS)
 * AI-Friendly: Structured logging with clear categories and data
 */

const VideoDiag = (() => {
  const sessionId = Math.random().toString(16).slice(2, 8);
  const startTime = performance.now();
  let sequence = 0;

  const config = window.AppConfig;
  const debugEnabled = config.debug.enabledByQuery;

  // Check if verbose logging is enabled
  function isEnabled() {
    try {
      return debugEnabled || window.localStorage.getItem('videoDebug') === '1';
    } catch {
      return debugEnabled;
    }
  }

  // Enable/disable verbose logging
  function setEnabled(enabled) {
    try {
      window.localStorage.setItem('videoDebug', enabled ? '1' : '0');
    } catch {}
    emit('log', 'CFG', `videoDebug=${enabled ? '1' : '0'}`);
  }

  // Get elapsed time since start
  function getElapsedMs() {
    return performance.now() - startTime;
  }

  // Format TimeRanges object for logging
  function formatTimeRanges(timeRanges) {
    try {
      if (!timeRanges || !timeRanges.length) return '[]';
      const ranges = [];
      for (let i = 0; i < timeRanges.length; i++) {
        ranges.push(`[${timeRanges.start(i).toFixed(2)}..${timeRanges.end(i).toFixed(2)}]`);
      }
      return `[${ranges.join(' ')}]`;
    } catch {
      return '[?]';
    }
  }

  // Capture video element state snapshot
  function snapshotVideo(video) {
    if (!video) return null;
    
    const error = video.error;
    const quality = typeof video.getVideoPlaybackQuality === 'function' 
      ? video.getVideoPlaybackQuality() 
      : null;

    return {
      stage: video.dataset?.stage || null,
      src: video.currentSrc || null,
      preload: video.preload,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : null,
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
      buffered: formatTimeRanges(video.buffered),
      error: error ? { code: error.code, message: error.message } : null,
      frameStats: quality ? {
        total: quality.totalVideoFrames,
        dropped: quality.droppedVideoFrames
      } : null
    };
  }

  // Write to debug panel
  function writeToPanel(line) {
    const logEl = document.getElementById('messageLog');
    if (!logEl) return;

    // Limit log entries
    while (logEl.children.length > config.debug.maxLogEntries) {
      logEl.removeChild(logEl.firstChild);
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = line;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Format data for panel display (compact)
  function formatDataForPanel(category, message, data) {
    if (!data || typeof data !== 'object') return '';

    // Network probe results
    if (category === 'NET' && message.startsWith('probe_range')) {
      const { status, headerMs, totalMs, throughputKiBps, contentRange, acceptRanges } = data;
      return ` {status:${status} hdr:${headerMs}ms total:${totalMs}ms KiBps:${throughputKiBps} CR:${contentRange} AR:${acceptRanges}}`;
    }

    // Media/video state
    if (category === 'WAIT' || category === 'MEDIA') {
      if ('readyState' in data || 'networkState' in data) {
        const rs = data.readyState ?? '-';
        const ns = data.networkState ?? '-';
        const t = typeof data.currentTime === 'number' ? data.currentTime.toFixed(2) : '-';
        const buf = data.buffered ?? '-';
        const err = data.error?.code ? ` err:${data.error.code}` : '';
        return ` {rs:${rs} ns:${ns} t:${t} buf:${buf}${err}}`;
      }
    }

    // Generic compact JSON
    try {
      const json = JSON.stringify(data, (key, value) => {
        if (['currentSrc', 'srcAttr', 'userAgent', 'metadata', 'snapshot'].includes(key)) {
          return undefined;
        }
        if (typeof value === 'string' && value.length > 180) {
          return `${value.slice(0, 180)}…`;
        }
        return value;
      });
      return json && json.length <= 220 ? ` ${json}` : ` ${json.slice(0, 220)}…`;
    } catch {
      return '';
    }
  }

  // Main emit function - log to console and panel
  function emit(level, category, message, data) {
    sequence++;
    const ms = getElapsedMs().toFixed(0);
    const prefix = `[VD ${sessionId} #${String(sequence).padStart(4, '0')} +${ms}ms ${category}]`;

    // Console logging
    try {
      if (data !== undefined && data !== null) {
        (console[level] || console.log)(prefix, message, data);
      } else {
        (console[level] || console.log)(`${prefix} ${message}`);
      }
    } catch {}

    // Panel logging
    try {
      const wallTime = new Date().toLocaleTimeString();
      const dataSuffix = formatDataForPanel(category, message, data);
      writeToPanel(`[${wallTime}] ${prefix} ${message}${dataSuffix}`);
    } catch {}
  }

  // Attach event listeners to video element
  function attachVideo(video, label) {
    if (!video || video.__vdAttached) return;
    
    video.__vdAttached = true;
    video.__vd = {
      lastSrcSetAt: null,
      lastStage: null,
      firstFrameLogged: false
    };

    // Event listener creator
    const addListener = (eventName, level = 'log', includeSnapshot = true) => {
      video.addEventListener(eventName, () => {
        const stage = video.dataset?.stage || null;
        video.__vd.lastStage = stage;

        const sinceSrc = typeof video.__vd.lastSrcSetAt === 'number'
          ? ` +${(getElapsedMs() - video.__vd.lastSrcSetAt).toFixed(0)}ms_since_src`
          : '';

        const msg = `${label}:${stage || '-'} event=${eventName}${sinceSrc}`;

        // Only log noisy events when debug is enabled
        const noisy = ['timeupdate', 'progress'].includes(eventName);
        if (noisy && !isEnabled()) return;

        const snapshot = includeSnapshot ? snapshotVideo(video) : null;
        emit(level, 'MEDIA', msg, snapshot);
      }, { passive: true });
    };

    // Core lifecycle events
    ['loadstart', 'loadedmetadata', 'loadeddata', 'durationchange', 'canplay', 
     'canplaythrough', 'play', 'playing', 'pause', 'ended', 'seeking', 'seeked']
      .forEach(e => addListener(e));

    // Warning events
    ['waiting', 'stalled', 'suspend', 'abort', 'emptied']
      .forEach(e => addListener(e, 'warn'));

    // Error events
    addListener('error', 'error');

    // Noisy but useful events
    ['progress', 'timeupdate']
      .forEach(e => addListener(e));

    // First frame detection
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFirstFrame = () => {
        if (video.__vd.firstFrameLogged) return;
        video.__vd.firstFrameLogged = true;
        video.requestVideoFrameCallback((now, metadata) => {
          emit('log', 'PERF', `${label}:${video.dataset?.stage || '-'} first_frame`, {
            now, metadata, snapshot: snapshotVideo(video)
          });
        });
      };
      video.addEventListener('playing', onFirstFrame, { once: true, passive: true });
    }

    emit('log', 'MEDIA', `${label} attached`, snapshotVideo(video));
  }

  // Mark when src is set on video
  function markSrcSet(video, stageId, url) {
    if (!video) return;
    video.__vd = video.__vd || { lastSrcSetAt: null, lastStage: null, firstFrameLogged: false };
    video.__vd.lastSrcSetAt = getElapsedMs();
    video.__vd.lastStage = stageId;
    video.__vd.firstFrameLogged = false;
    emit('log', 'MEDIA', `src_set ${stageId}`, { url, snapshot: snapshotVideo(video) });
  }

  // Network probe for iOS debugging
  const probeCache = new Set();
  async function netProbeRange(url, label) {
    if (!debugEnabled || !url || probeCache.has(url)) return;
    probeCache.add(url);

    const tStart = performance.now();
    let resp;
    
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-524287' }, // 512KB probe
        cache: 'no-store'
      });
    } catch (e) {
      emit('warn', 'NET', `probe_failed ${label}`, { url, error: e.message });
      return;
    }

    const tHeaders = performance.now();
    let bytes = 0;
    try {
      const buf = await resp.arrayBuffer();
      bytes = buf.byteLength;
    } catch {}
    const tDone = performance.now();

    const headerMs = (tHeaders - tStart).toFixed(0);
    const totalMs = (tDone - tStart).toFixed(0);
    const throughputKiBps = totalMs > 0 ? ((bytes / 1024) / (totalMs / 1000)).toFixed(1) : null;

    emit('log', 'NET', `probe_range ${label}`, {
      url,
      status: resp.status,
      ok: resp.ok,
      headerMs: Number(headerMs),
      totalMs: Number(totalMs),
      bytes,
      throughputKiBps: throughputKiBps ? Number(throughputKiBps) : null,
      contentType: resp.headers.get('content-type'),
      acceptRanges: resp.headers.get('accept-ranges'),
      contentRange: resp.headers.get('content-range')
    });

    // Warn if not proper range response
    if (resp.status !== 206 || !resp.headers.get('content-range')) {
      emit('warn', 'NET', `probe_range_warning ${label}`, {
        status: resp.status,
        acceptRanges: resp.headers.get('accept-ranges'),
        contentRange: resp.headers.get('content-range')
      });
    }
  }

  // Monitor video waiting state
  function startWaitMonitor(video, label) {
    if (!debugEnabled || !video) return () => {};
    
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      emit('log', 'WAIT', `${label}:${video.dataset?.stage || '-'} waiting_tick`, snapshotVideo(video));
      if (ticks >= 15) clearInterval(id);
    }, 1000);
    
    return () => clearInterval(id);
  }

  // Get environment info
  function getEnvironment() {
    const ua = navigator.userAgent;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    return {
      userAgent: ua,
      isIOS: config.isIOS(),
      isSafari: /^((?!chrome|android).)*safari/i.test(ua),
      online: navigator.onLine,
      connection: conn ? {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData
      } : null,
      debugEnabled: isEnabled()
    };
  }

  // Global error handlers
  window.addEventListener('error', e => {
    emit('error', 'JS', 'window.error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error ? {
        name: e.error.name,
        message: e.error.message,
        stack: e.error.stack
      } : null
    });
  });

  window.addEventListener('unhandledrejection', e => {
    emit('error', 'JS', 'unhandledrejection', {
      reason: e.reason && typeof e.reason === 'object'
        ? { name: e.reason.name, message: e.reason.message, stack: e.reason.stack }
        : e.reason
    });
  });

  // Network status
  window.addEventListener('online', () => emit('log', 'NET', 'navigator online'));
  window.addEventListener('offline', () => emit('warn', 'NET', 'navigator offline'));

  // Visibility changes
  document.addEventListener('visibilitychange', () => {
    emit('log', 'LIFECYCLE', `visibility=${document.visibilityState}`);
  });

  // Page lifecycle
  window.addEventListener('pagehide', e => emit('warn', 'LIFECYCLE', 'pagehide', { persisted: e.persisted }));
  window.addEventListener('pageshow', e => emit('log', 'LIFECYCLE', 'pageshow', { persisted: e.persisted }));

  // Public API
  return {
    sessionId,
    enabled: isEnabled,
    setEnabled,
    shouldForceHls: () => config.debug.forceHLS,
    env: getEnvironment,
    emit,
    info: (cat, msg, data) => emit('log', cat, msg, data),
    warn: (cat, msg, data) => emit('warn', cat, msg, data),
    error: (cat, msg, data) => emit('error', cat, msg, data),
    attachVideo,
    markSrcSet,
    snapshotVideo,
    netProbeRange,
    startWaitMonitor
  };
})();

window.VideoDiag = VideoDiag;
