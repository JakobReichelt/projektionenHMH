let ws;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

// ===== STAGE MANAGER CONFIGURATION =====
// Define content for each stage/video
const stageContent = {
    video1: {
        title: '',
        text: ''
    },
    'video2-looping': {
        title: 'Willst du auch mal schießen?',
        text: 'Ja   /    Nein'
    },
    video3: {
        title: '',
        text: ''
    },
    'video4-looping': {
        title: '↑',
        text: 'schau hoch'
    },
    video5: {
        title: 'Niki De Saint Phalle schießt auf die Welt',
        text: 'Ob sie es beim Hannover Schützenfest auch gelernt hat?'
    }
};
// ===== END STAGE MANAGER CONFIGURATION =====

// Video sequence state
let currentState = 'idle';
let hasInteracted = false;
let allowNormalInteraction = true; // Flag to control if regular clicks trigger interaction
const videos = {
    video1: document.getElementById('video1'),
    video2: document.getElementById('video2'),
    video3: document.getElementById('video3'),
    video4: document.getElementById('video4'),
    video5: document.getElementById('video5')
};

function updateStageDisplay(stageName) {
    const stage = stageContent[stageName];
    const titleElement = document.getElementById('stageTitle');
    const textElement = document.getElementById('stageText');
    const stageDisplay = document.querySelector('.stage-display');
    
    if (stage) {
        // Set text content (or empty string)
        if (titleElement) titleElement.textContent = stage.title || '';
        if (textElement) textElement.textContent = stage.text || '';
        
        // Remove previous styling
        textElement.classList.remove('interactive', 'black-text');
        titleElement.classList.remove('black-text');
        stageDisplay.classList.remove('interactive');
        textElement.onclick = null;
        
        // Make video2-looping stage text clickable and send message
        if (stageName === 'video2-looping') {
            allowNormalInteraction = false; // Disable regular interactions
            stageDisplay.classList.add('interactive');
            textElement.classList.add('interactive');
            textElement.onclick = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send('2');
                    console.log('Sent: 2');
                    allowNormalInteraction = true; // Re-enable for next stage
                    handleInteraction();
                }
            };
        } else if (stageName === 'video4-looping') {
            allowNormalInteraction = true; // Enable regular interactions for 4th stage
            // Make 4th stage text black
            titleElement.classList.add('black-text');
            textElement.classList.add('black-text');
        } else {
            allowNormalInteraction = true; // Enable for other stages
        }
        
        console.log(`Stage updated: ${stageName} - "${stage.title}"`);
    }
}

function initializeVideoSequence() {
    console.log('Initializing video sequence...');
    
    // Clear initial stage display
    const titleElement = document.getElementById('stageTitle');
    const textElement = document.getElementById('stageText');
    if (titleElement) titleElement.textContent = '';
    if (textElement) textElement.textContent = '';
    
    // Play video 1
    playVideo('video1', () => {
        console.log('Video 1 finished, playing Video 2');
        playVideo('video2', null, true); // Video 2 loops
        currentState = 'video2-looping';
        updateStageDisplay('video2-looping');
        hasInteracted = false;
    });
}

function playVideo(videoId, onEnded = null, isLooping = false) {
    // Hide all videos
    Object.keys(videos).forEach(id => {
        videos[id].classList.remove('active');
        videos[id].pause();
    });
    
    const video = videos[videoId];
    video.classList.add('active');
    
    if (!isLooping) {
        video.loop = false;
    }
    
    if (onEnded) {
        video.onended = onEnded;
    }
    
    video.currentTime = 0;
    
    // Use promise-based play for better iOS compatibility
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                console.log(`${videoId} is playing`);
            })
            .catch(err => {
                console.error(`Failed to play ${videoId}:`, err);
            });
    }
}

function handleInteraction() {
    if (hasInteracted) return; // Ignore multiple interactions
    hasInteracted = true;
    console.log('User interaction detected, state:', currentState);
    
    if (currentState === 'video2-looping') {
        // Transition from video 2 to video 3
        playVideo('video3', () => {
            console.log('Video 3 finished, playing Video 4');
            playVideo('video4', null, true); // Video 4 loops
            currentState = 'video4-looping';
            updateStageDisplay('video4-looping');
            hasInteracted = false;
        });
        currentState = 'video3-playing';
        updateStageDisplay('video3');
    } else if (currentState === 'video4-looping') {
        // Transition from video 4 to video 5
        playVideo('video5', null, true); // Video 5 loops indefinitely
        currentState = 'video5-looping';
        updateStageDisplay('video5');
    }
}

// Add interaction listeners
document.addEventListener('touchstart', () => {
    if (allowNormalInteraction) handleInteraction();
});
document.addEventListener('click', (e) => {
    // Only trigger on non-button clicks if interaction is allowed
    if (allowNormalInteraction && !e.target.classList.contains('main-button') && !e.target.classList.contains('debug-toggle') && !e.target.classList.contains('interactive')) {
        handleInteraction();
    }
});

// Detect if device is iOS
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

const isIOSDevice = isIOS();
console.log('Device is iOS:', isIOSDevice);

// iOS autoplay workaround - play all videos on first interaction
let iosAutoplayInitiated = false;
function initiateIOSAutoplay() {
    if (iosAutoplayInitiated) return;
    iosAutoplayInitiated = true;
    
    console.log('First user interaction detected on iOS, unlocking autoplay...');
    
    // Try to play all videos to unlock iOS autoplay restriction
    Object.values(videos).forEach(video => {
        const playPromise = video.play();
        if (playPromise) {
            playPromise
                .then(() => {
                    console.log('Video unlocked for autoplay');
                    video.pause(); // Pause after unlocking
                })
                .catch(err => console.log('Unlock attempt:', err));
        }
    });
    
    // Initialize sequence after unlock
    setTimeout(() => {
        console.log('Starting video sequence...');
        initializeVideoSequence();
    }, 300);
}

// Only add interaction listeners for iOS
if (isIOSDevice) {
    document.addEventListener('touchstart', initiateIOSAutoplay, { once: true });
    document.addEventListener('click', initiateIOSAutoplay, { once: true });
}

function toggleDebugPanel() {
    const debugPanel = document.getElementById('debugPanel');
    debugPanel.classList.toggle('show');
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to: ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus(true);
        addLog('✅ Connected to server');
        reconnectAttempts = 0;
        
        // Send initial connection message
        sendMessage({
            type: 'client_type',
            value: 'web_interface'
        });
    };

    ws.onmessage = (event) => {
        try {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                // If not JSON, treat as plain text
                data = event.data;
            }
            console.log('Received:', data);
            
            // Handle both JSON objects and plain text
            const displayText = typeof data === 'object' ? data.type : data;
            addLog(`📨 Received: ${displayText}`);
            
            // Display feedback from server
            if (typeof data === 'object' && data.type === 'connection') {
                updateFeedback('Connected to WebSocket Server');
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('❌ Connection error');
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus(false);
        addLog('⚠️ Disconnected from server');
        
        // Attempt reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Reconnecting in ${reconnectDelay}ms (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            addLog(`🔄 Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connectWebSocket, reconnectDelay);
        }
    };
}

function updateStatus(connected) {
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
        statusDiv.classList.remove('disconnected');
        statusDiv.classList.add('connected');
        statusText.textContent = 'Connected ✓';
    } else {
        statusDiv.classList.remove('connected');
        statusDiv.classList.add('disconnected');
        statusText.textContent = 'Disconnected ✗';
    }
}

function sendButton(buttonName) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Extract button number (1, 2, or 3)
        const buttonNumber = buttonName.replace('button', '');
        
        sendMessage(buttonNumber);
        updateFeedback(`Button pressed: ${buttonName}`);
        
        // Add pulse animation
        const mainButton = document.querySelector('.main-button');
        mainButton.classList.add('pulse');
        setTimeout(() => {
            mainButton.classList.remove('pulse');
        }, 600);
    } else {
        updateFeedback('⚠️ Not connected to server');
        addLog('❌ Cannot send: Not connected');
    }
}

function sendMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data.toString());
        addLog(`📤 Sent: ${data}`);
        console.log('Sent:', data);
    }
}

function updateFeedback(message) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = message;
}

function addLog(message) {
    const log = document.getElementById('messageLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// Connect on page load
window.addEventListener('load', () => {
    connectWebSocket();
    
    // For non-iOS devices, auto-start the video sequence
    if (!isIOSDevice) {
        console.log('Android/non-iOS device detected. Auto-starting video sequence...');
        setTimeout(() => {
            initializeVideoSequence();
        }, 500);
    } else {
        console.log('iOS device detected. Waiting for user interaction to start video sequence...');
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});
