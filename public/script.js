// ===== CONFIGURATION =====
const VIDEO_ASSETS = {
    'video1': '/1.mp4',
    'video2': '/2.mp4',
    'video3': '/3.mp4',
    'video3-looping': '/3.mp4',
    'video4': '/4.mp4',
    'video5': '/5.mp4',
    'video6': '/6.mp4',
    'video6-looping': '/6.mp4'
};

const STATE = {
    ws: null,
    currentStageId: 'video1',
    hasInteracted: false, // Used for the "tap to start" on iOS
    interactionRequiredForStage3: true, // Specific logic for stage 3
    isIOS: CONFIG.isIOS(),
    isIPhone: CONFIG.isIPhone(),
    debug: {
        uiFps: 0,
        rafId: null,
        drops: 0
    }
};

// ===== VIDEO MANAGER (DOUBLE BUFFERING) =====
class VideoManager {
    constructor() {
        this.layer1 = document.getElementById('video-layer-1');
        this.layer2 = document.getElementById('video-layer-2');
        this.activeLayer = this.layer1; // Currently visible
        this.inactiveLayer = this.layer2; // Hidden / Preloading
        
        this.activeStageId = null;
        this.transitioning = false;

        this.initLayers();
    }

    initLayers() {
        [this.layer1, this.layer2].forEach(v => {
            v.onended = () => this.handleVideoEnded(v);
            v.onerror = (e) => this.handleVideoError(v, e);
            // Debug events
            v.onwaiting = () => addLog(`Video Waiting/Buffering: ${v.id}`);
            v.onplaying = () => addLog(`Video Playing: ${v.id}`);
        });
    }

    getActiveVideo() {
        return this.activeLayer;
    }

    // Preload a video into the inactive layer
    preload(stageId) {
        const url = VIDEO_ASSETS[stageId];
        if (!url) return;
        
        // If inactive layer has this url, do nothing or ensure it's loaded
        const currentSrc = this.inactiveLayer.getAttribute('src');
        if (currentSrc !== url) {
            this.inactiveLayer.src = url;
            this.inactiveLayer.load();
        }
    }

    // Transition to a new video
    async play(stageId, isLooping = false, options = {}) {
        const { forceRestart = false } = options;
        const url = VIDEO_ASSETS[stageId];
        if (!url) {
            console.error(`No asset found for stage: ${stageId}`);
            return;
        }

        console.log(`[VideoManager] Request play: ${stageId} (${url}) Loop: ${isLooping}`);

        // Case 1: Same URL is already playing on active layer
        const activeSrc = this.activeLayer.getAttribute('src');
        // Check simply by filename endsWith because src might be absolute
        const isActiveUrlMatch = activeSrc && activeSrc.endsWith(url);

        if (isActiveUrlMatch && !forceRestart) {
            // Just update loop status and ensure playing
            this.activeLayer.loop = isLooping;
            if (this.activeLayer.paused) {
                try { await this.activeLayer.play(); } catch(e) { console.error("Resume failed", e); }
            }
            this.activeStageId = stageId;
            updateStageDisplay(stageId);
            return;
        }

        // Case 2: Transition needed
        this.transitioning = true;
        const nextLayer = this.inactiveLayer;
        const prevLayer = this.activeLayer;

        // Prepare next layer
        nextLayer.loop = isLooping;
        if (!nextLayer.getAttribute('src') || !nextLayer.getAttribute('src').endsWith(url)) {
            console.log(`[VideoManager] Setting src ${url} on inactive layer`);
            nextLayer.src = url;
            nextLayer.load();
        }

        // Wait for ready and Play
        try {
            await nextLayer.play();
        } catch (err) {
            console.error(`[VideoManager] Play failed for ${stageId}:`, err);
            addLog(`❌ Play failed: ${stageId} - ${err.name}`);
            
            // On mobile, if this fails (NotAllowedError), we stick to current layer
            // OR we show the interaction overlay if we are stuck.
            if (err.name === 'NotAllowedError') {
                 document.getElementById('startOverlay').classList.remove('hidden');
            }
            this.transitioning = false;
            return;
        }

        // Swap layers
        nextLayer.classList.add('active');
        prevLayer.classList.remove('active');

        // Update state
        this.activeLayer = nextLayer;
        this.inactiveLayer = prevLayer;
        this.activeStageId = stageId;
        this.transitioning = false;

        // Cleanup old layer after short delay to allow transition
        setTimeout(() => {
            if (this.inactiveLayer === prevLayer) { // Ensure ownership hasn't changed
                prevLayer.pause();
                prevLayer.currentTime = 0;
                // Only clear if it actually has a src to avoid "Invalid URI" errors
                if (prevLayer.hasAttribute('src')) {
                    prevLayer.removeAttribute('src');
                    prevLayer.load();
                }
            }
        }, 600); // slightly longer than CSS transition

        updateStageDisplay(stageId);
        
        // Preload next logical stage
        // We know the flow: 1->2->3->4->5->6
        const map = {
            'video1': 'video2',
            'video2': 'video3', // 3 is used for 3-looping
            'video3-looping': 'video4',
            'video4': 'video5',
            'video5': 'video6' // 6 is used for 6-looping
        };
        const nextId = map[stageId];
        if (nextId) this.preload(nextId);
    }

    handleVideoEnded(video) {
        if (video !== this.activeLayer) return;
        
        console.log(`[VideoManager] Ended: ${this.activeStageId}`);
        const current = this.activeStageId;
        
        if (current === 'video1') {
            this.play('video2', false);
        } else if (current === 'video2') {
            // 2 -> 3 loop
            this.play('video3-looping', true);
        } else if (current === 'video4') {
            this.play('video5', false);
        } else if (current === 'video5') {
            this.play('video6-looping', true);
        }
    }

    handleVideoError(video, error) {
        console.error("Video Error:", error);
        addLog(`⚠️ Video Error: ${video.id}`);
    }
}

const videoManager = new VideoManager();

// ===== UI UPDATES =====
const updateStageDisplay = (stageId) => {
    STATE.currentStageId = stageId;
    const stage = CONFIG.getStage(stageId);
    
    // Safety check if stage config exists
    const titleText = stage ? stage.title : '';
    const bodyText = stage ? stage.text : '';

    const titleEl = document.getElementById('stageTitle');
    const textEl = document.getElementById('stageText');
    const displayEl = document.querySelector('.stage-display');

    if (titleEl) titleEl.textContent = titleText;
    if (textEl) textEl.textContent = bodyText;

    // Reset classes
    if (textEl) {
        textEl.classList.remove('interactive', 'black-text');
        textEl.onclick = null;
    }
    if (titleEl) titleEl.classList.remove('black-text');
    if (displayEl) displayEl.classList.remove('interactive');

    // Specific Stage Styles
    STATE.interactionRequiredForStage3 = false; // Reset unless set
    STATE.allowInteraction = true;

    if (stageId === 'video3-looping') {
        STATE.interactionRequiredForStage3 = true;
        if (displayEl) displayEl.classList.add('interactive');
        if (textEl) {
            textEl.classList.add('interactive');
            textEl.onclick = handleInteraction;
        }
    } else if (stageId === 'video6-looping') {
        STATE.allowInteraction = false;
        if (titleEl) titleEl.classList.add('black-text');
        if (textEl) textEl.classList.add('black-text');
    }

    // Debug
    updateDebugMetrics();
};

// ===== WEBSOCKET =====
const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    addLog(`Connecting to ${wsUrl}...`);
    
    try {
        STATE.ws = new WebSocket(wsUrl);
    } catch (e) {
        addLog('Connection failed');
        setTimeout(connectWebSocket, 3000);
        return;
    }

    STATE.ws.onopen = () => {
        addLog('Connected to server');
        updateConnectionStatus(true);
        // Send initial state request or identify
        STATE.ws.send('1'); 
    };

    STATE.ws.onclose = () => {
        addLog('Disconnected');
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
    };

    STATE.ws.onerror = (err) => {
        console.error("WS Error", err);
    };

    STATE.ws.onmessage = (event) => {
        const msg = event.data.toString().trim();
        addLog(`RX: ${msg}`);

        if (msg === 'PING') return;
        if (msg === 'RELOAD') {
            window.location.reload();
            return;
        }
        
        // Handle STAGE:x format if it comes up, though old script didn't use it heavily.
        if (msg.startsWith('STAGE:')) {
            const stageId = msg.split(':')[1];
            videoManager.play(stageId);
        } else if (msg.startsWith('VIDEO:')) {
           const vidId = msg.split(':')[1];
           videoManager.play(vidId);
        }
    };
};

const updateConnectionStatus = (isConnected) => {
    const el = document.getElementById('status');
    const text = document.getElementById('statusText');
    if (isConnected) {
        el.classList.add('connected');
        el.classList.remove('disconnected');
        text.textContent = 'Connected';
    } else {
        el.classList.add('disconnected');
        el.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
};

// ===== INTERACTION HANDLING =====
const handleInteraction = () => {
    // Hide overlay on first interaction
    const overlay = document.getElementById('startOverlay');
    if (!overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
        STATE.hasInteracted = true;
        
        // On iOS/Android, verify we can play video1
        if (STATE.currentStageId === 'video1') {
            videoManager.play('video1', false, { forceRestart: true }); 
        }
        return;
    }

    // Check interaction logic
    // Interaction is only allowed during Video 3 looping?
    if (STATE.currentStageId === 'video3-looping') {
         // Notify server we are advancing
         if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
             STATE.ws.send('2'); // Sends '2' to server
         }
         // Advance to video 4
         videoManager.play('video4', false);
    }
};

// Listeners
document.addEventListener('click', (e) => {
    if (e.target.closest('.debug-panel') || e.target.closest('.debug-toggle')) return;
    handleInteraction();
});
document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.debug-panel') || e.target.closest('.debug-toggle')) return;
    handleInteraction();
}, {passive: true});
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') handleInteraction();
});

// ===== DEBUG & UTILS =====
window.toggleDebugPanel = () => { // Exposed to HTML onclick
    document.getElementById('debugPanel').classList.toggle('show');
};

document.getElementById('clearLogBtn')?.addEventListener('click', () => {
    const log = document.getElementById('messageLog');
    if(log) log.innerHTML = '';
});

const addLog = (msg) => {
    const log = document.getElementById('messageLog');
    if (!log) return;
    // Debounce huge logs
    if (log.children.length > 50) log.removeChild(log.firstChild);
    
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
};

const updateDebugMetrics = () => {
    const stageEl = document.getElementById('debugStage');
    const videoEl = document.getElementById('debugVideo');
    if (stageEl) stageEl.textContent = STATE.currentStageId;
    if (videoEl) videoEl.textContent = videoManager.activeStageId;
    
    // Video stats
    const v = videoManager.getActiveVideo();
    const stEl = document.getElementById('debugStates');
    if (stEl && v) {
        stEl.textContent = `Ready: ${v.readyState} Net: ${v.networkState} Time: ${v.currentTime.toFixed(1)}`;
    }
};

// Start Loop
window.addEventListener('input', () => {}); // IOs unlock hack sometimes
window.addEventListener('load', () => {
    connectWebSocket();
    
    // Try auto-play immediately
    videoManager.play('video1', false).catch(() => {
        // If it fails, overlay is needed
        console.log("Autoplay failed, waiting for user gesture");
    });

    if (STATE.isIPhone || STATE.isIOS) {
        // Always show overlay on iOS to ensure audio/video rights even if muted
        document.getElementById('startOverlay').classList.remove('hidden');
    }

    // debug loop
    const fpsEl = document.getElementById('debugUiFps');
    let last = performance.now();
    let frames = 0;
    const tick = (now) => {
        frames++;
        if (now - last >= 1000) {
            if (fpsEl) fpsEl.textContent = frames;
            frames = 0;
            last = now;
            updateDebugMetrics();
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
});
