# Interactive Video Experience - Optimized Codebase

## 🎯 Project Overview

A WebSocket-based interactive video experience with multi-show support, iOS optimization, and double-buffered video playback. Built for TouchDesigner integration and optimized for mobile devices (especially iOS Safari).

## 🏗️ Architecture

### **Modular Design**
The codebase is split into logical, maintainable modules:

```
├── server-new.js                    # Main server entry point
├── src/
│   ├── server/                      # Server modules
│   │   ├── config.js               # Configuration constants
│   │   ├── utils.js                # Utility functions
│   │   ├── media-handler.js        # Media file serving
│   │   └── websocket-manager.js    # WebSocket connections
│   └── client/                      # Client modules
│       ├── config.js               # Client configuration
│       ├── cookie-utils.js         # Cookie management
│       ├── diagnostics.js          # Debug logging (VideoDiag)
│       ├── video-player.js         # Video playback logic
│       ├── websocket-client.js     # WebSocket client
│       ├── stage-content.js        # Stage 6 content
│       └── app.js                  # Main app initialization
├── public/
│   ├── index-new.html              # Optimized HTML
│   └── style-new.css               # Optimized CSS with variables
└── assets/                          # Video files by show
    ├── NIKI/
    ├── PFERDE/
    └── LEIBNIZ/
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20.11.1+
- FFmpeg (optional, for HLS conversion)

### Installation
```bash
npm install
```

### Running the Server
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

### Converting Videos
```bash
# Convert all MP4s to HLS
npm run hls

# Optimize MP4s for fast startup (iOS)
npm run mp4:faststart
```

## 📋 Features

### Core Functionality
- ✅ **Double-buffered video playback** - Seamless transitions between stages
- ✅ **Multi-show support** - Switch content via subdomain, query param, or cookie
- ✅ **iOS optimization** - Preloading, caching, HLS fallback
- ✅ **WebSocket control** - Remote stage control from TouchDesigner
- ✅ **Responsive design** - Desktop and mobile optimized
- ✅ **Debug panel** - Comprehensive logging and diagnostics

### Show Selection Priority
1. `?show=` query parameter (e.g., `?show=niki`)
2. Cookie `show` value
3. Subdomain (e.g., `niki.example.com`)
4. Default folder (NIKI preferred, or first alphabetically)

### Video Stages
1. **video1** → auto-advance to video2
2. **video2** → auto-advance to video3
3. **video3-looping** → WAIT for user tap → advance to video4
4. **video4** → auto-advance to video5
5. **video5** → 16-second black screen → advance to video6
6. **video6-looping** → LOOP + show scrollable content overlay

## 🧩 Module Documentation

### Server Modules

#### `src/server/config.js`
Centralized configuration for all server settings.

**Key exports:**
- `port` - Server port (default: 8080)
- `assetsDir` - Path to asset folders
- `stages` - Array of stage IDs
- `media.*` - Cache, timeout, chunk size settings

#### `src/server/utils.js`
Pure utility functions for common operations.

**Key functions:**
- `getAssetFolders(assetsDir)` - Get available show folders
- `resolveShow(req, availableFolders, defaultFolder)` - Determine which show to use
- `parseSingleByteRange(rangeHeader, fileSize)` - Parse HTTP Range header
- `isIOS(req)` - Detect iOS device

#### `src/server/media-handler.js`
Handles media file requests with iOS optimization.

**Features:**
- Range request support (206 Partial Content)
- ETag caching
- Aggressive cache headers for iOS reliability
- HLS playlist serving
- Performance logging

#### `src/server/websocket-manager.js`
Manages WebSocket connections and broadcasting.

**Features:**
- Connection management
- Message broadcasting to all clients
- Health check endpoint
- Broadcast API endpoint

### Client Modules

#### `src/client/config.js`
Client-side configuration and constants.

**Key exports:**
- `AppConfig.stages` - Stage flow definitions
- `AppConfig.videoPlayer.*` - Playback settings
- `AppConfig.buildVideoUrl()` - Construct video URLs with params

#### `src/client/cookie-utils.js`
Simple cookie management utilities.

**Key functions:**
- `CookieUtils.set(name, value, days)` - Set cookie
- `CookieUtils.get(name)` - Get cookie value
- `CookieUtils.getShowParameter()` - Get show from URL or cookie

#### `src/client/diagnostics.js`
Comprehensive logging system (VideoDiag).

**Features:**
- Structured logging to console and debug panel
- Video state snapshots
- Network performance probes
- Event monitoring
- iOS-specific debugging

**Usage:**
```javascript
VideoDiag.info('CATEGORY', 'message', dataObject);
VideoDiag.warn('CATEGORY', 'message', dataObject);
VideoDiag.error('CATEGORY', 'message', dataObject);
```

#### `src/client/video-player.js`
Core video playback logic with double-buffering.

**Key class: `VideoPlayer`**
- `loadAndPlay(stageId)` - Load and play a stage
- `preloadAllVideos()` - Preload video files
- `preloadNext(stageId)` - Preload next stage
- `swapVideos()` - Swap active/pending layers

**iOS optimizations:**
- Parallel buffering of first two videos
- Intelligent preloading based on buffer state
- HLS → MP4 automatic fallback
- Single video playback (avoids Safari conflicts)

#### `src/client/websocket-client.js`
WebSocket connection management.

**Key class: `WebSocketClient`**
- `connect()` - Establish connection
- `send(message)` - Send message (queued if disconnected)
- Auto-reconnection on disconnect

#### `src/client/stage-content.js`
Manages scrollable content overlay for stage 6.

**Features:**
- Content definitions for NIKI and PFERDE shows
- Dynamic HTML generation
- Show/hide overlay management

#### `src/client/app.js`
Main application initialization and coordination.

**Features:**
- Global state management
- Event listener setup
- User interaction handling
- FPS counter
- Autoplay fallback

## 🎨 CSS Architecture

### CSS Custom Properties (Variables)
All colors, spacing, and transitions are defined as CSS variables in `:root` for easy customization.

**Example:**
```css
:root {
  --color-bg: #000;
  --color-text: #fff;
  --transition-fast: 0.2s ease;
  --debug-panel-width: 400px;
}
```

### Organized Sections
- Fonts
- Reset & Base
- Video Container
- Start Overlay
- Stage 6 Content
- Debug Panel
- Responsive Design
- Scrollbar Styling

## 🔧 WebSocket API

### Client → Server Messages
- `"1"` - Video 1 started playing
- `"2"` - User tapped on video 3 (advancing to 4)

### Server → Client Messages
- `"RELOAD"` - Reload page
- `"STAGE:video1"` - Jump to stage
- `"VIDEO:video3-looping"` - Jump to stage (alternate format)

### HTTP API
- `POST /broadcast` - Broadcast message to all clients
- `GET /health` - Health check

## 📱 iOS Optimization Details

### Why iOS is Special
iOS Safari has unique constraints:
- Limited concurrent video element playback
- Strict autoplay policies
- Aggressive resource management
- Requires user gesture for playback

### Optimizations Applied
1. **Preload first two videos** on page load
2. **Parallel buffering** - video2 loads while video1 plays
3. **Intelligent buffer checking** before preloading next
4. **HLS → MP4 fallback** if HLS fails
5. **Keep-alive connections** for reliable streaming
6. **ETag caching** for faster subsequent loads
7. **Range request support** for seeking

## 🐛 Debugging

### Enable Verbose Logging
Add `?debug=1` to URL or run in console:
```javascript
window.__videoDiag.enableVerbose();
```

### Debug Panel
Click the 🔧 button (bottom-left) to show/hide the debug panel.

**Features:**
- Current stage and video info
- Connection status
- Quick stage switching buttons
- Real-time log output
- FPS counter

### Console Hooks
```javascript
// Get current video state
window.__videoDiag.snapshotActive();

// Get environment info
window.__videoDiag.env();

// Get specific video layer
window.__videoDiag.snapshot(1); // layer 1
window.__videoDiag.snapshot(2); // layer 2
```

## 🎬 Video Format Recommendations

### MP4 (Recommended for all platforms)
- Use H.264 codec for maximum compatibility
- Run `npm run mp4:faststart` to optimize for streaming
- Ensures `moov` atom is at the beginning of file

### HLS (Optional for iOS)
- Use `npm run hls` to convert MP4 to HLS
- Generates `.m3u8` playlist and `.ts` segments
- Currently disabled by default (use `?hls=1` to enable)

## 🔄 Migration from Old Code

To migrate from old codebase to new:

1. **Replace files:**
   - `server.js` → `server-new.js`
   - `public/index.html` → `public/index-new.html`
   - `public/style.css` → `public/style-new.css`
   - `public/script.js` → Use modular `src/client/*.js`

2. **Update package.json** start script:
   ```json
   "start": "node server-new.js"
   ```

3. **Test all functionality:**
   - Video playback
   - Stage transitions
   - User interactions
   - WebSocket connection
   - Show selection

4. **Rename files** once verified:
   ```bash
   mv server.js server-old.js
   mv server-new.js server.js
   # etc.
   ```

## 📝 AI-Friendly Design Principles

### 1. **Modularity**
Each module has a single, clear responsibility.

### 2. **Pure Functions**
Utility functions have no side effects - same input = same output.

### 3. **Clear Naming**
Function and variable names describe what they do, not how.

### 4. **Comprehensive Comments**
Every module starts with a comment explaining its purpose.

### 5. **Configuration Centralization**
All magic numbers and settings are in config files.

### 6. **Type Consistency**
Functions document their parameter types and return values in JSDoc style.

## 🆘 Troubleshooting

### Videos don't play on iOS
- Check browser console for errors
- Enable `?debug=1` and watch log
- Verify files exist in `assets/<SHOW>/`
- Run `npm run mp4:faststart` to optimize MP4s
- Check network tab for 206 responses (range requests)

### WebSocket disconnects frequently
- Check server logs
- Verify firewall/proxy settings
- Increase `keepAliveTimeout` in config

### Stage transitions freeze
- Check browser console for errors
- Look for `waiting` events in debug panel
- Verify buffer status before transitions
- Check network speed/latency

### Show selection not working
- Verify folder name matches (case-insensitive)
- Check cookie value in DevTools
- Verify assets exist in correct folder
- Check server logs for resolved show

## 📄 License

ISC

## 👤 Author

Hannover Multimedia Campaign

---

**Built with ❤️ for seamless, optimized video experiences.**
