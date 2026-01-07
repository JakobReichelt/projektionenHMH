/**
 * Shared configuration for all client-side scripts
 */
const CONFIG = {
  // Stage content configuration
  stages: [
    { id: 'video1', title: '', text: '' },
    { id: 'video2', title: '', text: '' },
    { id: 'video3-looping', title: 'Willst du auch mal schießen?', text: 'Ja   /    Nein' },
    { id: 'video4', title: '↑', text: 'schau hoch' },
    { id: 'video5', title: 'Niki De Saint Phalle schießt auf die Welt', text: 'Ob sie es beim Hannover Schützenfest auch gelernt hat?' },
    { id: 'video6-looping', title: '', text: '' },
    { id: 'video7', title: '', text: '' }
  ],

  // WebSocket configuration
  reconnect: {
    maxAttempts: 5,
    delayMs: 3000
  },

  // Device detection
  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,

  // Get stage by ID
  getStage: (stageId) => CONFIG.stages.find(s => s.id === stageId),

  // Get stage index
  getStageIndex: (stageId) => CONFIG.stages.findIndex(s => s.id === stageId),

  // Get next stage
  getNextStage: (currentId) => {
    const idx = CONFIG.getStageIndex(currentId);
    return idx < CONFIG.stages.length - 1 ? CONFIG.stages[idx + 1] : null;
  },

  // Get previous stage
  getPrevStage: (currentId) => {
    const idx = CONFIG.getStageIndex(currentId);
    return idx > 0 ? CONFIG.stages[idx - 1] : null;
  }
};
