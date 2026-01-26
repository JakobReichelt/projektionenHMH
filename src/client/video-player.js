/**
 * Video Player Module
 * Manages double-buffered video playback with iOS optimization
 * AI-Friendly: Clear state management and transitions
 */

class VideoPlayer {
  constructor() {
    this.config = window.AppConfig;
    this.diag = window.VideoDiag;
    
    // Video elements
    this.video1 = document.getElementById('video-layer-1');
    this.video2 = document.getElementById('video-layer-2');
    this.active = this.video1;
    this.pending = this.video2;
    
    // State
    this.videoCache = new Map();
    this.isPreloading = false;
    this.hasStartedPlayback = false;
    this.hlsFallbackStages = new Set();
    this.disableHls = false;
    
    // Ensure videos start hidden
    this.video1.classList.remove('active');
    this.video2.classList.remove('active');
    
    this.setupEventListeners();
  }

  /**
   * Check if video has sufficient buffer
   */
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

  /**
   * Setup event listeners for both video elements
   */
  setupEventListeners() {
    const pairs = [
      { video: this.video1, label: 'layer1' },
      { video: this.video2, label: 'layer2' }
    ];

    pairs.forEach(({ video, label }) => {
      this.diag.attachVideo(video, label);

      video.addEventListener('ended', () => this.onVideoEnded(video));
      video.addEventListener('error', e => this.onVideoError(video, e));
      video.addEventListener('canplaythrough', () => {
        const stage = video.dataset.stage;
        if (stage) this.log(`✓ Video buffered: ${stage}`);
      });
    });
  }

  /**
   * Preload all videos in sequence
   */
  async preloadAllVideos() {
    if (this.isPreloading) return;
    this.isPreloading = true;
    
    this.log('🔄 Preloading videos...');
    
    const showParam = window.CookieUtils.getShowParameter();
    const ext = this.config.getVideoExtension();
    const videoOrder = ['video1', 'video2', 'video3-looping', 'video4', 'video5', 'video6-looping'];
    
    if (this.config.isIOS()) {
      // iOS: Preload first two videos for immediate playback
      this.log('iOS detected - preloading first two videos');
      
      // Preload video1 on active element
      const video1Path = this.config.buildVideoUrl(1, ext, showParam, this.diag.sessionId);
      this.videoCache.set('video1', video1Path);
      this.video1.dataset.stage = 'video1';
      this.video1.src = video1Path;
      this.video1.preload = 'auto';
      this.video1.load();
      this.log('✓ iOS: Preloaded video1 on active element');

      // Preload video2 on pending element (parallel buffering)
      const video2Path = this.config.buildVideoUrl(2, ext, showParam, this.diag.sessionId);
      this.videoCache.set('video2', video2Path);
      this.video2.dataset.stage = 'video2';
      this.video2.src = video2Path;
      this.video2.preload = 'auto';
      this.video2.load();
      this.log('✓ iOS: Preloaded video2 on pending element');
      
      // Register remaining videos
      for (let i = 2; i < videoOrder.length; i++) {
        const stageId = videoOrder[i];
        const stageNum = this.config.stages[stageId].number;
        const videoPath = this.config.buildVideoUrl(stageNum, ext, showParam, this.diag.sessionId);
        this.videoCache.set(stageId, videoPath);
        this.log(`✓ Registered: ${stageId}`);
      }
    } else {
      // Desktop/Android: Lightweight preload
      for (const stageId of videoOrder) {
        const stageNum = this.config.stages[stageId].number;
        const videoPath = this.config.buildVideoUrl(stageNum, ext, showParam, this.diag.sessionId);
        this.videoCache.set(stageId, videoPath);
        
        // Trigger browser cache with HEAD request
        fetch(videoPath, { method: 'HEAD' }).catch(() => {});
        this.log(`✓ Registered: ${stageId}`);
      }
    }
    
    this.log('✅ Preload setup complete');
    this.isPreloading = false;
  }

  /**
   * Load and play a specific stage
   */
  async loadAndPlay(stageId) {
    const stageConfig = this.config.stages[stageId];
    
    if (!stageConfig) {
      console.error(`Invalid stage: ${stageId}`);
      return false;
    }
    
    // Prevent duplicate transitions
    if (window.appState.currentStage === stageId && this.hasStartedPlayback) {
      this.log(`⚠️ Already in stage ${stageId} - ignoring duplicate`);
      return false;
    }

    // Special handling for video5 (black screen)
    if (stageId === 'video5') {
      return this.handleBlackScreen(stageConfig);
    }

    this.log(`▶️ Transitioning from ${window.appState.currentStage} to ${stageId}`);
    
    const videoUrl = this.videoCache.get(stageId) || this.buildFallbackUrl(stageId);
    let targetVideo = this.pending;
    
    // iOS optimization: Use pre-loaded video1 on first play
    if (this.config.isIOS() && stageId === 'video1' && !this.hasStartedPlayback) {
      const activeSrc = new URL(this.active.src || '', window.location.href).href;
      const targetSrc = new URL(videoUrl, window.location.href).href;
      
      if (activeSrc === targetSrc && this.active.readyState >= 1) {
        this.log(`📱 iOS: Using pre-loaded video1 from active element`);
        targetVideo = this.active;
      }
    }
    
    // Prepare target video
    targetVideo.loop = stageConfig.loop;
    targetVideo.dataset.stage = stageId;
    targetVideo.preload = 'auto';
    
    // Set source if different
    const currentSrc = targetVideo.src;
    const targetSrc = new URL(videoUrl, window.location.href).href;

    if (currentSrc !== targetSrc) {
      this.diag.markSrcSet(targetVideo, stageId, videoUrl);

      // Network probe for iOS debugging
      if (this.config.isIOS() && videoUrl.includes('.mp4')) {
        this.diag.netProbeRange(videoUrl, stageId).catch(() => {});
      }

      targetVideo.src = videoUrl;
      targetVideo.load();
    } else {
      // Reuse existing source
      if (this.config.isIOS() && targetVideo.readyState === 0) {
        try { targetVideo.load(); } catch {}
      } else {
        targetVideo.currentTime = 0;
      }
    }

    // iOS: Pause other video to avoid conflicts
    if (this.config.isIOS() && this.active && this.active !== targetVideo && !this.active.paused) {
      try { this.active.pause(); } catch {}
    }

    // Start playback
    const stopWaitMonitor = this.diag.startWaitMonitor(
      targetVideo, 
      targetVideo === this.video1 ? 'layer1' : 'layer2'
    );
    
    const playPromise = targetVideo.play();
    
    // Wait for video to be ready
    await this.waitForCanPlay(targetVideo);

    try {
      await playPromise;
      stopWaitMonitor();
      this.hasStartedPlayback = true;
      
      // Send "1" to server when video1 starts
      if (stageId === 'video1' && window.wsClient) {
        window.wsClient.send('1');
      }
    } catch (error) {
      stopWaitMonitor();
      if (error.name === 'NotAllowedError') {
        this.log('⚠️ Autoplay blocked - showing interaction prompt');
        window.showStartOverlay();
        return false;
      }
      throw error;
    }

    // Swap videos
    if (targetVideo === this.pending) {
      this.swapVideos();
    } else {
      targetVideo.classList.add('active');
      this.active = targetVideo;
    }
    
    // Update state
    window.appState.currentStage = stageId;
    window.appState.activeVideo = targetVideo;
    window.updateDebugInfo();
    
    this.log(`✓ Now in stage: ${stageId}`);

    // Show/hide stage 6 content
    if (stageId === 'video6-looping') {
      window.showStage6Content();
    } else {
      window.hideStage6Content();
    }

    // Preload next video
    this.preloadNext(stageId);

    return true;
  }

  /**
   * Handle black screen stage (video5)
   */
  handleBlackScreen(stageConfig) {
    this.log(`▶️ Playing: video5 (black screen for ${stageConfig.blackScreen}ms)`);
    
    // Hide current video
    this.active.classList.remove('active');
    
    // Update state
    window.appState.currentStage = 'video5';
    window.updateDebugInfo();
    
    // Advance after delay
    setTimeout(() => {
      this.log('⏭️ Black screen complete - advancing to: video6-looping');
      this.loadAndPlay('video6-looping');
    }, stageConfig.blackScreen);
    
    return true;
  }

  /**
   * Preload next video in sequence
   */
  preloadNext(currentStageId) {
    const currentConfig = this.config.stages[currentStageId];
    let nextStage = currentConfig?.next;
    
    // Speculative preloading for video3
    if (currentStageId === 'video3-looping') {
      nextStage = 'video4';
    }

    if (!nextStage) return;

    this.log(`⏳ Scheduled preload for: ${nextStage}`);
    
    setTimeout(() => {
      const nextUrl = this.videoCache.get(nextStage) || this.buildFallbackUrl(nextStage);
      
      // Verify we're still in the same stage
      if (window.appState.currentStage !== currentStageId) return;

      // iOS: Check buffer before preloading
      if (this.config.isIOS()) {
        const isLooping = !!currentConfig.loop;
        const minBuffer = isLooping 
          ? this.config.videoPlayer.minBufferLooping 
          : this.config.videoPlayer.minBufferNonLooping;
        
        const okToPreload = isLooping || this.hasSufficientBuffer(this.active, minBuffer);

        if (!okToPreload) {
          this.log(`⬇️ iOS: Low buffer - partial preload: ${nextStage}`);
          try {
            this.pending.dataset.stage = nextStage;
            this.pending.preload = 'metadata';
            this.pending.loop = !!this.config.stages[nextStage]?.loop;
            this.pending.src = nextUrl;
            this.pending.load();
          } catch {}
          return;
        }

        this.log(`⬇️ iOS: Buffering next: ${nextStage}`);
        try {
          this.pending.dataset.stage = nextStage;
          this.pending.preload = 'auto';
          this.pending.loop = !!this.config.stages[nextStage]?.loop;
          this.pending.src = nextUrl;
          this.pending.load();
        } catch {}
        return;
      }

      // Non-iOS: Simple preload
      this.log(`⬇️ Buffering next: ${nextStage}`);
      this.pending.dataset.stage = nextStage;
      this.pending.src = nextUrl;
      this.pending.preload = 'auto';
      this.pending.load();
    }, this.config.videoPlayer.preloadDelay);
  }

  /**
   * Wait for video to be playable
   */
  waitForCanPlay(video) {
    return new Promise(resolve => {
      let timeout = null;

      const done = reason => {
        try {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('loadeddata', onLoadedData);
          video.removeEventListener('playing', onPlaying);
        } catch {}
        if (timeout) clearTimeout(timeout);
        if (this.config.isIOS() && reason) {
          this.diag.info('PERF', `waitForCanPlay resolved (${reason})`, this.diag.snapshotVideo(video));
        }
        resolve();
      };

      const onCanPlay = () => done('canplay');
      const onLoadedData = () => {
        if (this.config.isIOS()) done('loadeddata');
      };
      const onPlaying = () => done('playing');

      if (video.readyState >= 3) return done('readyState>=3');
      if (this.config.isIOS() && video.readyState >= 2) return done('readyState>=2');

      video.addEventListener('canplay', onCanPlay, { once: true, passive: true });
      video.addEventListener('loadeddata', onLoadedData, { once: true, passive: true });
      video.addEventListener('playing', onPlaying, { once: true, passive: true });

      const timeoutMs = this.config.isIOS() 
        ? this.config.videoPlayer.waitTimeout 
        : this.config.videoPlayer.waitTimeoutNonIOS;
      timeout = setTimeout(() => done('timeout'), timeoutMs);
    });
  }

  /**
   * Swap active and pending videos
   */
  swapVideos() {
    this.pending.classList.remove('active');
    this.active.classList.remove('active');
    this.pending.classList.add('active');

    // Swap references
    const temp = this.active;
    this.active = this.pending;
    this.pending = temp;

    // Clean up old video
    setTimeout(() => {
      this.pending.pause();
      this.pending.currentTime = 0;
      this.pending.loop = false;
      this.pending.removeAttribute('loop');
      this.pending.classList.remove('active');
    }, this.config.videoPlayer.transitionDuration);
  }

  /**
   * Handle video ended event
   */
  onVideoEnded(video) {
    if (video !== this.active) return;
    
    const stageId = video.dataset.stage;
    const stageConfig = this.config.stages[stageId];
    
    this.log(`📹 Video ended: ${stageId}, loop: ${stageConfig?.loop}`);
    
    // Don't advance if looping
    if (stageConfig?.loop) {
      this.log(`🔄 Video ${stageId} is looping`);
      return;
    }
    
    // Advance to next stage
    if (stageConfig?.next) {
      this.log(`⏭️ Advancing to: ${stageConfig.next}`);
      this.loadAndPlay(stageConfig.next);
    }
  }

  /**
   * Handle video error
   */
  onVideoError(video, error) {
    console.error('Video error:', error);
    const mediaError = video?.error;
    const code = mediaError?.code;
    const message = mediaError?.message;
    const stageId = video.dataset.stage || 'unknown';

    this.log(`❌ Error loading video: ${stageId} (code: ${code ?? '-'})`);

    // iOS HLS fallback to MP4
    if (this.config.isIOS() && code === 4 && video.src.includes('.m3u8')) {
      this.handleHLSFallback(video, stageId);
    }
  }

  /**
   * Handle HLS fallback to MP4 on iOS
   */
  handleHLSFallback(video, stageId) {
    // Disable HLS globally on first failure
    if (!this.disableHls) {
      this.disableHls = true;
      this.log('📱 iOS: HLS failed - switching to MP4 globally');
      
      // Update all video URLs to MP4
      const showParam = window.CookieUtils.getShowParameter();
      Object.keys(this.config.stages).forEach(id => {
        const num = this.config.stages[id].number;
        const mp4Url = this.config.buildVideoUrl(num, 'mp4', showParam, this.diag.sessionId);
        this.videoCache.set(id, mp4Url);
      });
    }

    // Retry current stage with MP4
    if (!this.hlsFallbackStages.has(stageId)) {
      this.hlsFallbackStages.add(stageId);
      
      const stageNumber = this.config.stages[stageId]?.number;
      if (stageNumber) {
        const showParam = window.CookieUtils.getShowParameter();
        const mp4Url = this.config.buildVideoUrl(stageNumber, 'mp4', showParam, this.diag.sessionId);
        this.log(`↩️ iOS: Retrying ${stageId} with MP4`);
        
        this.videoCache.set(stageId, mp4Url);
        try {
          video.src = mp4Url;
          video.load();
        } catch {}
      }
    }
  }

  /**
   * Build fallback URL for a stage
   */
  buildFallbackUrl(stageId) {
    const stageNum = this.config.stages[stageId]?.number;
    if (!stageNum) return '';
    
    const showParam = window.CookieUtils.getShowParameter();
    const ext = this.config.getVideoExtension();
    return this.config.buildVideoUrl(stageNum, ext, showParam, this.diag.sessionId);
  }

  /**
   * Log helper
   */
  log(message) {
    this.diag.emit('log', 'APP', message);
  }
}

window.VideoPlayer = VideoPlayer;
