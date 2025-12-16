let ws;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

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
window.addEventListener('load', connectWebSocket);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});
