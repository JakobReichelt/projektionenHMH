/**
 * WebSocket Client Module
 * Handles WebSocket connection and messaging
 * AI-Friendly: Simple connection management with reconnection
 */

class WebSocketClient {
  constructor(reconnectDelay = 3000) {
    this.ws = null;
    this.reconnectDelay = reconnectDelay;
    this.messageQueue = [];
    this.diag = window.VideoDiag;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.log(`Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      this.log('❌ Connection failed');
      setTimeout(() => this.connect(), this.reconnectDelay);
      return;
    }

    this.ws.onopen = () => this.onOpen();
    this.ws.onclose = () => this.onClose();
    this.ws.onerror = error => this.onError(error);
    this.ws.onmessage = event => this.onMessage(event);
  }

  /**
   * Handle connection opened
   */
  onOpen() {
    this.log('✓ Connected');
    this.updateConnectionStatus(true);
    
    // Send queued messages
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.ws.send(msg);
      this.log(`→ ${msg} (from queue)`);
    }
  }

  /**
   * Handle connection closed
   */
  onClose() {
    this.log('Disconnected');
    this.updateConnectionStatus(false);
    setTimeout(() => this.connect(), this.reconnectDelay);
  }

  /**
   * Handle connection error
   */
  onError(error) {
    console.error('WebSocket error:', error);
  }

  /**
   * Handle incoming message
   */
  onMessage(event) {
    const msg = event.data.trim();
    this.log(`← ${msg}`);

    // Ignore ping/connected messages
    if (msg === 'PING' || msg === 'CONNECTED') return;
    
    // Handle reload command
    if (msg === 'RELOAD') {
      window.location.reload();
      return;
    }

    // Handle stage commands
    if (msg.startsWith('STAGE:') || msg.startsWith('VIDEO:')) {
      const stageId = msg.split(':')[1];
      if (window.videoPlayer) {
        window.videoPlayer.loadAndPlay(stageId);
      }
    }
  }

  /**
   * Send message to server
   */
  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
      this.log(`→ ${msg}`);
    } else {
      this.log(`⚠️ WebSocket not ready - queuing: '${msg}'`);
      this.messageQueue.push(msg);
    }
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(connected) {
    const status = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    
    if (!status || !statusText) return;
    
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

  /**
   * Log helper
   */
  log(message) {
    this.diag.emit('log', 'APP', message);
  }
}

window.WebSocketClient = WebSocketClient;
