# Quick Reference - Optimized Codebase

## 📁 File Structure

```
Websocket Server/
├── server-new.js              ← Main server (use this)
├── package-new.json           ← Dependencies
├── README-new.md              ← Full documentation
├── MIGRATION.md               ← Migration guide
│
├── src/
│   ├── server/                ← Server modules
│   │   ├── config.js         ← Server configuration
│   │   ├── utils.js          ← Utility functions
│   │   ├── media-handler.js  ← Media file serving
│   │   └── websocket-manager.js ← WebSocket logic
│   │
│   └── client/                ← Client modules
│       ├── config.js         ← Client configuration
│       ├── cookie-utils.js   ← Cookie management
│       ├── diagnostics.js    ← Debug logging
│       ├── video-player.js   ← Video playback
│       ├── websocket-client.js ← WebSocket client
│       ├── stage-content.js  ← Stage 6 content
│       └── app.js            ← Main initialization
│
└── public/
    ├── index-new.html         ← Main HTML (use this)
    └── style-new.css          ← Styles (use this)
```

## 🚀 Common Commands

```bash
# Start server
npm start

# Development (auto-reload)
npm run dev

# Convert videos to HLS
npm run hls

# Optimize MP4s for iOS
npm run mp4:faststart
```

## 🎯 URL Parameters

| Parameter | Example | Effect |
|-----------|---------|--------|
| `?show=niki` | `/?show=niki` | Load NIKI show |
| `?show=pferde` | `/?show=pferde` | Load PFERDE show |
| `?show=` | `/?show=` | Clear show cookie |
| `?debug=1` | `/?debug=1` | Enable verbose logging |
| `?hls=1` | `/?hls=1` | Force HLS on iOS (experimental) |

## 🎬 Video Stages

| Stage | Behavior | Next |
|-------|----------|------|
| video1 | Auto-play | → video2 |
| video2 | Auto-play | → video3-looping |
| video3-looping | **LOOP** - wait for tap | → video4 |
| video4 | Auto-play | → video5 |
| video5 | 16s black screen | → video6-looping |
| video6-looping | **LOOP** + show content | - |

## 🔧 Configuration Files

### Server Config
**File:** `src/server/config.js`

```javascript
module.exports = {
  port: 8080,
  media: {
    cacheMaxAge: 604800,      // 7 days
    keepAliveTimeout: 65000,  // 65 seconds
    chunkSize: 65536          // 64KB
  }
};
```

### Client Config
**File:** `src/client/config.js`

```javascript
const AppConfig = {
  videoPlayer: {
    transitionDuration: 600,   // 0.6s
    preloadDelay: 1000,       // 1s
    minBufferNonLooping: 3,   // 3s
    waitTimeout: 8000         // 8s
  }
};
```

### CSS Variables
**File:** `public/style-new.css`

```css
:root {
  --color-bg: #000;
  --color-text: #fff;
  --spacing-md: 1rem;
  --transition-fast: 0.2s ease;
  --video-transition: 0.5s ease-in-out;
}
```

## 🔍 Debugging

### Enable Debug Mode
```javascript
// In URL
?debug=1

// In console
window.__videoDiag.enableVerbose();
```

### Inspect Video State
```javascript
// Current active video
window.__videoDiag.snapshotActive();

// Specific layer
window.__videoDiag.snapshot(1);  // layer 1
window.__videoDiag.snapshot(2);  // layer 2

// Environment
window.__videoDiag.env();
```

### Manual Stage Control
```javascript
// Jump to any stage
window.switchToStage('video1');
window.switchToStage('video3-looping');
window.switchToStage('video6-looping');
```

## 📡 WebSocket Messages

### Client → Server
```javascript
// Video 1 started
wsClient.send('1');

// User tapped video 3
wsClient.send('2');
```

### Server → Client
```javascript
// Jump to stage
STAGE:video1
VIDEO:video4

// Reload page
RELOAD
```

## 🎨 Customize Appearance

### Change Colors
Edit `public/style-new.css`:
```css
:root {
  --color-bg: #1a1a1a;        /* Dark gray instead of black */
  --color-text: #f0f0f0;      /* Off-white */
  --color-success: #00ff00;   /* Bright green */
}
```

### Change Transitions
```css
:root {
  --video-transition: 0.3s ease;  /* Faster transitions */
  --transition-fast: 0.1s ease;   /* Snappier UI */
}
```

### Change Debug Panel Size
```css
:root {
  --debug-panel-width: 500px;     /* Wider panel */
  --debug-panel-height: 600px;    /* Taller panel */
}
```

## 🔧 Modify Stage Flow

**File:** `src/client/config.js`

```javascript
const AppConfig = {
  stages: {
    'video1': { 
      next: 'video2',          // Auto-advance to video2
      loop: false,             // Don't loop
      number: 1                // Maps to /1.mp4
    },
    'video3-looping': { 
      next: null,              // null = wait for user
      loop: true,              // Loop until user taps
      number: 3 
    },
    'video5': { 
      next: 'video6-looping',
      loop: false,
      number: 5,
      blackScreen: 16000       // 16 seconds black
    }
  }
};
```

## 📱 iOS-Specific Settings

**File:** `src/client/config.js`

```javascript
const AppConfig = {
  videoPlayer: {
    minBufferLooping: 1,        // Min buffer for looping videos
    minBufferNonLooping: 3,     // Min buffer before preloading
    waitTimeout: 8000,          // iOS wait timeout
  }
};
```

**File:** `src/server/config.js`

```javascript
module.exports = {
  media: {
    keepAliveTimeout: 65000,    // iOS prefers 60s+
    chunkSize: 65536            // 64KB optimal for mobile
  }
};
```

## 🆘 Quick Fixes

### Videos won't play
1. Check browser console for errors
2. Enable `?debug=1`
3. Run `npm run mp4:faststart`
4. Verify files in `assets/SHOW/1.mp4` etc

### WebSocket won't connect
1. Check server is running (`npm start`)
2. Check firewall
3. Verify port 8080 is accessible
4. Check browser console for errors

### Wrong show loads
1. Clear cookies (or use `?show=`)
2. Check folder names in `assets/`
3. Verify show parameter spelling
4. Check server logs

### CSS not updating
1. Hard refresh (Ctrl+Shift+R)
2. Clear browser cache
3. Check file path in HTML
4. Verify CSS syntax (no missing braces)

## 📊 Performance Targets

| Metric | Target | How to Check |
|--------|--------|--------------|
| FPS | 60 | Debug panel |
| First video load | < 3s | Network tab |
| Stage transition | < 1s | Visual + logs |
| Memory usage | < 200MB | Performance tab |
| WebSocket latency | < 100ms | Network tab |

## 🔗 Useful Links

- **Full Docs:** [README-new.md](README-new.md)
- **Migration:** [MIGRATION.md](MIGRATION.md)
- **FFmpeg:** https://ffmpeg.org/download.html
- **Node.js:** https://nodejs.org/

## 💡 Tips

1. **Always use `?debug=1`** when developing
2. **Check debug panel** before reporting issues
3. **Test on iOS** - it's the trickiest platform
4. **Use `npm run mp4:faststart`** for best iOS performance
5. **Version control** - commit before major changes

---

**Need help?** Check [README-new.md](README-new.md) for detailed documentation.
