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
  loop6TimeoutId: null
};

// Cache video elements on load
const initVideos = () => {
  STATE.videos = {
    video1: document.getElementById('video1'),
    video2: document.getElementById('video2'),
    video3: document.getElementById('video3'),
    video4: document.getElementById('video4'),
    video5: document.getElementById('video5'),
    video6: document.getElementById('video6'),
    video7: document.getElementById('video7')
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
};

// ===== VIDEO PLAYBACK =====
const playVideo = (videoId, onEnded = null, isLooping = false) => {
  if (STATE.loop6TimeoutId) {
    clearTimeout(STATE.loop6TimeoutId);
    STATE.loop6TimeoutId = null;
  }

  Object.values(STATE.videos).forEach(v => {
    v.classList.remove('active');
    v.pause();
  });

  const video = STATE.videos[videoId];
  video.classList.add('active');
  video.loop = isLooping;
  video.onended = onEnded;
  video.currentTime = 0;

  (video.play() || Promise.resolve())
    .catch(err => console.error(`Failed to play ${videoId}:`, err));
};

const initializeVideoSequence = () => {
  document.getElementById('stageTitle').textContent = '';
  document.getElementById('stageText').textContent = '';

  // 1 -> 2 -> loop 3 (wait interaction) -> 4 -> 5 -> loop 6 for 3s -> 7
  playVideo('video1', () => {
    STATE.currentStage = 'video2';
    updateStageDisplay('video2');

    playVideo('video2', () => {
      playVideo('video3', null, true);
      STATE.currentStage = 'video3-looping';
      updateStageDisplay('video3-looping');
      STATE.hasInteracted = false;
    }, false);
  }, false);
};

const startTimedLoop6Then7 = (ms) => {
  playVideo('video6', null, true);
  STATE.currentStage = 'video6-looping';
  updateStageDisplay('video6-looping');
  STATE.allowInteraction = false;

  STATE.loop6TimeoutId = setTimeout(() => {
    STATE.loop6TimeoutId = null;
    STATE.currentStage = 'video7';
    updateStageDisplay('video7');
    playVideo('video7', null, false);
  }, ms);
};

// ===== INTERACTION HANDLING =====
const handleInteraction = () => {
  if (STATE.hasInteracted) return;
  STATE.hasInteracted = true;

  switch (STATE.currentStage) {
    case 'video3-looping':
      if (STATE.ws?.readyState === WebSocket.OPEN) {
        STATE.ws.send('2');
      }

      // Interaction during looping 3 triggers 4 -> 5 -> loop 6 for 3s -> 7
      STATE.currentStage = 'video4';
      updateStageDisplay('video4');
      playVideo('video4', () => {
        STATE.currentStage = 'video5';
        updateStageDisplay('video5');
        playVideo('video5', () => startTimedLoop6Then7(3000), false);
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
  log.scrollTop = log.scrollHeight;
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
  
  if (!STATE.isIOS) {
    setTimeout(initializeVideoSequence, 500);
  }
});

window.addEventListener('beforeunload', () => STATE.ws?.close());
