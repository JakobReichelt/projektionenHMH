// ===== STATE MANAGEMENT =====
const STATE = {
  ws: null,
  currentStage: 'video1',
  hasInteracted: false,
  allowInteraction: true,
  reconnectAttempts: 0,
  iosInitiated: false,
  videos: {},
  isIOS: CONFIG.isIOS()
};

// Cache video elements on load
const initVideos = () => {
  STATE.videos = {
    video1: document.getElementById('video1'),
    video2: document.getElementById('video2'),
    video3: document.getElementById('video3'),
    video4: document.getElementById('video4'),
    video5: document.getElementById('video5')
  };
};

// ===== STAGE DISPLAY =====
const updateStageDisplay = (stageId) => {
  const stage = CONFIG.getStage(stageId);
  if (!stage) return;

  const title = document.getElementById('stageTitle');
  const text = document.getElementById('stageText');
  const display = document.querySelector('.stage-display');

  title.textContent = stage.title || '';
  text.textContent = stage.text || '';
  text.classList.remove('interactive', 'black-text');
  title.classList.remove('black-text');
  display.classList.remove('interactive');
  text.onclick = null;

  // Special handling for interactive stages
  if (stageId === 'video2-looping') {
    STATE.allowInteraction = false;
    display.classList.add('interactive');
    text.classList.add('interactive');
    text.onclick = () => {
      if (STATE.ws?.readyState === WebSocket.OPEN) {
        STATE.ws.send('2');
        STATE.currentStage = 'video2-looping';
        handleInteraction();
      }
    };
  } else if (stageId === 'video4-looping') {
    STATE.allowInteraction = true;
    title.classList.add('black-text');
    text.classList.add('black-text');
  } else {
    STATE.allowInteraction = true;
  }

  console.log(`Stage: ${stageId}`);
};

// ===== VIDEO PLAYBACK =====
const playVideo = (videoId, onEnded = null, isLooping = false) => {
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
  
  playVideo('video1', () => {
    playVideo('video2', null, true);
    STATE.currentStage = 'video2-looping';
    updateStageDisplay('video2-looping');
    STATE.hasInteracted = false;
  });
};

// ===== INTERACTION HANDLING =====
const handleInteraction = () => {
  if (STATE.hasInteracted) return;
  STATE.hasInteracted = true;

  switch (STATE.currentState) {
    case 'video2-looping':
      playVideo('video3', () => {
        playVideo('video4', null, true);
        STATE.currentState = 'video4-looping';
        updateStageDisplay('video4-looping');
        STATE.hasInteracted = false;
      });
      STATE.currentState = 'video3-playing';
      updateStageDisplay('video3');
      break;

    case 'video4-looping':
      playVideo('video5', null, true);
      STATE.currentState = 'video5-looping';
      updateStageDisplay('video5');
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

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    if (STATE.allowInteraction) {
      handleInteraction();
    } else if (STATE.currentState === 'video2-looping') {
      const text = document.getElementById('stageText');
      text.onclick?.();
    }
  } else if (e.key === 'ArrowLeft') {
    if (STATE.currentState === 'video3-playing') {
      STATE.currentState = 'video2-looping';
      STATE.hasInteracted = false;
      STATE.allowInteraction = false;
      updateStageDisplay('video2-looping');
    } else if (STATE.currentState === 'video5-looping') {
      STATE.currentState = 'video4-looping';
      STATE.hasInteracted = false;
      updateStageDisplay('video4-looping');
    }
  }
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
