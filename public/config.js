/**
 * Application Configuration
 * Defines stages and video flow for the interactive experience
 */

const CONFIG = {
  // Stage definitions with titles and text content
  stages: [
    { id: 'video1', title: '', text: '' },
    { id: 'video2', title: '', text: '' },
    { id: 'video3-looping', title: '', text: '' },
    { id: 'video4', title: '', text: '' },
    { id: 'video5', title: '', text: '' },
    { id: 'video6-looping', title: '', text: '' }
  ],

  // WebSocket reconnection settings
  reconnect: {
    maxAttempts: 5,
    delayMs: 3000
  }
};
