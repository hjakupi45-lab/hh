# Internet Download Manager (IDM) — Complete Technical Handover & Developer Guide

> **Status:** Production-Ready Functional Replica  
> **Date:** October 15, 2026  
> **Repository:** `c:\Users\H\Desktop\IDM REVERSE`  

---

## 1. Executive Summary

This project is a 100% faithful, high-performance replica of the classic **Internet Download Manager (IDM 6.x)** for Windows, consisting of:
1. **Windows Desktop Application (Electron + Node.js):**
   - Classic retro Windows IDM interface with toolbar, categories tree, detailed download table, and status indicators.
   - Multi-connection segmented download engine (1 to 32 parallel TCP connections).
   - Iconic segmented connection visualizer progress dialog showing each thread's buffer state in real-time.
   - Byte-accurate Pause, Resume, and Error recovery.
   - Download completion dialog with "Open" and "Open Folder" actions.
   - Real-time speed limiter with dynamic throttling.
   - Authentic Web Audio synthesized sound effects (connect, complete, error).
2. **Local Integration Server (`apiServer.js`):**
   - Lightweight HTTP REST and WebSocket bridge on port `9462`.
   - Listens for download tasks, batch captures, status queries, and window focus requests from web browsers.
3. **Google Chrome Extension (Manifest V3):**
   - Injects a floating emerald **"Download this video"** sniffer widget on HTML5 players (YouTube, Facebook, etc.).
   - Browser context menu integration: *"Download with IDM"* and *"Download all links with IDM"*.
   - Automatic download interception based on file extensions.
   - In-page notification toasts confirming download initiation.
4. **Media Engine (yt-dlp + FFmpeg):**
   - High-definition video stream extraction (1080p, 720p, 480p, 360p).
   - Audio extraction to MP3.
   - Automatic audio transcoding to standard AAC (`-c:a aac`) so all MP4 videos play seamlessly with crystal-clear sound in Windows Media Player, Microsoft Movies & TV, Chrome, and VLC.

---

## 2. System Architecture & Inter-Process Communication

```
┌─────────────────────────────────────────────────────────────┐
│                       Google Chrome                         │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     Content Script    │       │  Background Worker    │  │
│  │ (YouTube Sniffer/UI)  │ ────> │  (Context Menus/Grab) │  │
│  └───────────────────────┘       └───────────────────────┘  │
└───────────────────────────────┬─────────────────────────────┘
                                │ HTTP POST /download (Port 9462)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                 IDM Desktop Host (Node.js)                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │        apiServer.js (REST & WebSocket Engine)       │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│              ┌───────────────┴───────────────┐              │
│              ▼                               ▼              │
│   ┌────────────────────┐          ┌────────────────────┐    │
│   │   downloader.js    │          │      main.js       │    │
│   │ (Segmented Range & │          │ (Electron Windows  │    │
│   │  yt-dlp + FFmpeg)  │          │  Manager & Tray)   │    │
│   └──────────┬─────────┘          └──────────┬─────────┘    │
│              │                               │              │
│              ▼                               ▼              │
│   ┌────────────────────┐          ┌────────────────────┐    │
│   │    storage.js      │          │  download-dialog   │    │
│   │ (Categories & JSON)│          │  (Segment Visual.) │    │
│   └────────────────────┘          └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Directory & File Structure

```text
c:\Users\H\Desktop\IDM REVERSE\
│
├── package.json                 # Project configuration & dependencies
├── start-electron.bat           # One-click Windows batch launcher
├── CHAT_HISTORY.md              # Export of conversation history and milestones
├── PROJECT_HANDOVER.md          # Comprehensive technical documentation (this file)
│
├── app\                         # Electron Application & Backend Core
│   ├── main.js                  # Electron lifecycle, window manager, IPC router
│   ├── preload.js               # Context isolation security bridge
│   │
│   ├── engine\                  # Core Downloading Engine
│   │   ├── downloader.js        # Multi-connection HTTP Range engine & yt-dlp pipeline
│   │   └── storage.js           # Settings persistence, history, category resolution
│   │
│   ├── server\                  # Browser Integration Bridge
│   │   └── apiServer.js         # HTTP REST endpoints & WebSocket server (port 9462)
│   │
│   └── ui\                      # User Interface Windows
│       ├── index.html           # Main IDM Dashboard
│       ├── app.css              # Pixel-perfect Windows classic IDM styling
│       ├── app.js               # Dashboard controller (categories, sorting, menus)
│       ├── download-dialog.html # Segmented connection visualizer progress window
│       ├── download-dialog.css  # Progress dialog styles & thread progress bars
│       ├── download-dialog.js   # Progress dialog controller & speed limiter
│       ├── complete-dialog.html # Download complete modal
│       ├── complete-dialog.js   # "Open", "Open Folder", "Close" handlers
│       ├── add-url-dialog.html  # "Enter new address to download" dialog
│       ├── add-url-dialog.js    # URL entry & category auto-detector
│       ├── options-dialog.html  # Configuration modal (categories, extensions)
│       ├── options-dialog.js    # Settings controller
│       │
│       └── assets\              # UI Assets
│           ├── icon.png         # IDM application icon
│           ├── icons.js         # High-resolution SVG toolbar & category icons
│           └── sounds.js        # Web Audio API sound synthesizer
│
├── extension\                   # Chrome Extension (Manifest V3)
│   ├── manifest.json            # MV3 extension manifest
│   ├── background.js            # Background service worker (downloads, menus, ping)
│   ├── content.js               # Sniffer button for YouTube & HTML5 video players
│   ├── content.css              # Sniffer button & in-page notification toast styles
│   ├── popup.html               # Extension status popup
│   ├── popup.css                # Popup styles
│   ├── popup.js                 # Popup connection status & toggle switches
│   └── icons\                   # Extension toolbar icons (16, 32, 48, 128px)
│
└── scripts\                     # Verification & Test Suites
    ├── export-history.js        # Transcript log exporter
    ├── test-engine.js           # Engine unit test (storage, task creation, API)
    ├── test-extension-api.js    # Simulated Chrome extension API client
    ├── test-multi-segment.js    # Multi-connection segmented range & integrity test
    └── test-resume.js           # Pause/Resume byte-integrity test
```

---

## 4. Key Components Explained

### 4.1. Multi-Segment Download Engine (`app/engine/downloader.js`)
* **Range Probing:** Sends an HTTP `HEAD` / `GET` with `Range: bytes=0-0` to inspect `Accept-Ranges: bytes`, `Content-Length`, and `Content-Disposition`.
* **Segment Partitioning:** Divides the total byte count across $N$ segments ($1 \le N \le 32$, default $8$).
* **Segment Workers:** Each segment runs an independent HTTP stream writing into a temporary part file (`.part_0`, `.part_1`, etc.).
* **Assembly:** Upon all parts completing, files are sequentially appended into the target output file with 100% byte integrity, verified against total length.
* **YouTube Support:** Detects streaming URLs and invokes `python -m yt_dlp` with FFmpeg location flags.

### 4.2. Audio Transcoding Solution for YouTube MP4s
* **The Problem:** YouTube serves video and audio in separate streams (`bv*` and `ba`). yt-dlp by default chooses Opus audio (format 251). Merging Opus into `.mp4` using standard copy causes the file to play with **no audio** in Windows Media Player and Microsoft Movies & TV.
* **The Solution:** In `downloader.js`:
  ```javascript
  const heightLimit = (this.format && !isNaN(parseInt(this.format, 10))) ? this.format : '1080';
  const formatArg = `bv*[height<=${heightLimit}][ext=mp4]+ba[ext=m4a]/bv*[height<=${heightLimit}]+ba[ext=m4a]/bv*[height<=${heightLimit}]+ba/b[height<=${heightLimit}]/bv*+ba/b`;

  args = [
    '-m', 'yt_dlp',
    '--ffmpeg-location', ffmpegBin,
    '--remote-components', 'ejs:github',
    '--js-runtimes', 'node:node',
    '-f', formatArg,
    '--merge-output-format', 'mp4',
    '--postprocessor-args', 'Merger:-c:v copy -c:a aac -b:a 192k',
    '-o', outTemplate,
    '--newline',
    this.url
  ];
  ```
  This guarantees standard **AAC audio** (`codec_name=aac`) in an MP4 container, ensuring 100% compatibility across all Windows players, Apple devices, browsers, and smart TVs.

### 4.3. Space-Safe URL Resolution in Electron (`app/main.js`)
* **The Problem:** The directory path `c:\Users\H\Desktop\IDM REVERSE` contains a space. Loading `file:///c:/Users/H/Desktop/IDM REVERSE/...` causes Chromium's URL parser to fail or load blank pages.
* **The Solution:** All dialog windows use Node's `url.pathToFileURL`:
  ```javascript
  const { pathToFileURL } = require('url');
  const htmlUrl = pathToFileURL(path.join(__dirname, 'ui/download-dialog.html')).href + `?id=${encodeURIComponent(taskId)}`;
  progWin.loadURL(htmlUrl);
  ```

### 4.4. Foreground Window Visibility on Windows
* When a download is triggered from Chrome, `openDownloadProgressDialog(taskId)` applies:
  ```javascript
  progWin.setAlwaysOnTop(true, 'screen-saver');
  progWin.show();
  progWin.focus();
  progWin.moveTop();
  ```
* In addition, `new-download-request` avoids restoring or focusing the main dashboard so that only the small segmented progress dialog pops up over the browser.

---

## 5. API Reference (`http://127.0.0.1:9462`)

| Endpoint | Method | Payload / Query | Description |
|---|---|---|---|
| `/health` | `GET` | - | Health check (returns `{"ok": true}`) |
| `/status` | `GET` | - | System status, active download counts, and settings |
| `/downloads` | `GET` | - | Returns array of all download tasks and their metadata |
| `/download` | `POST` | `{ url, fileName, cookies, referer, format, autoStart, showDialog }` | Submits a new download task |
| `/batch-download` | `POST` | `{ items: [{ url, fileName }], autoStart }` | Submits multiple download tasks |
| `/pause/:id` | `POST` | - | Pauses an active download |
| `/resume/:id` | `POST` | - | Resumes a paused download |
| `/delete/:id` | `DELETE` | `?deleteFile=true` | Removes a task and optionally deletes the file |
| `/focus` | `POST` | - | Brings the IDM main window to the front |

---

## 6. How to Run and Test

### 6.1. Running the Desktop Application
* Double-click `start-electron.bat` in the workspace root, or run:
  ```bash
  npm start
  ```

### 6.2. Installing the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the folder:
   `c:\Users\H\Desktop\IDM REVERSE\extension`
4. The IDM Integration Module icon will appear in Chrome.

### 6.3. Running Automated Test Suites
From PowerShell in the project directory:
```powershell
# 1. Full engine & API test
node scripts/test-engine.js

# 2. Simulated Chrome Extension download test
node scripts/test-extension-api.js

# 3. Segmented multi-connection range test
node scripts/test-multi-segment.js

# 4. Pause / Resume byte integrity test
node scripts/test-resume.js
```

---

## 7. Recommended Next Steps for Future Development

1. **Installer Generation:**
   - Configure `electron-builder` to generate a standalone Windows installer (`IDM_Setup.exe` with NSIS).
2. **Download Scheduler & Queue:**
   - Implement scheduled download queues (start at time $T$, stop at time $T_2$, hang up/shut down computer upon completion).
3. **Multi-Browser Support:**
   - Package Firefox extension (WebExtensions manifest) and Edge add-on.
4. **Site-Specific Logins:**
   - Store site credentials in `storage.js` for password-protected HTTP/FTP servers.

---

## 8. Update: "Electron by Haris" & In-Browser Download UI

### 8.1. Project Renamed to "Electron by Haris"
* `package.json`: updated `name` to `electron-by-haris` and `productName` to `Electron by Haris`.
* `start-electron.bat`: batch title and startup banners updated to `Electron by Haris`.
* All Electron window titles, dashboard headers, options, add URL, and completion dialogs updated to `Electron by Haris`.
* Chrome Extension manifest, popup, background service worker, and context menus updated to `Electron by Haris`.

### 8.2. In-Page Browser Download Modal (`extension/content.js` & `content.css`)
* **Immediate Interactive UI**: Clicking "Download with Electron by Haris" or clicking any downloadable link in the browser instantly displays the **Electron by Haris In-Page Download Modal**.
* **Pre-Download Confirmation**: Users can edit the file name, select video quality pills (1080p Full HD, 720p HD, 480p SD, 360p, MP3 Audio), and adjust the category before downloading.
* **Live In-Browser Progress Bar**: The modal seamlessly transitions into an active download monitor with live glowing progress bars, transfer speeds (MB/s), downloaded size, ETA, and Pause/Resume controls.
* **Floating Dock Pill**: Minimizing the dialog parks a sleek floating widget in the bottom-right corner of the webpage showing live speed and percentage.

---

## 9. Dynamic File Segmentation & Socket Keep-Alive Architecture

### 9.1. True Dynamic File Segmentation (`app/engine/downloader.js`)
* **IDM Proprietary Algorithm**: Instead of static equal parts computed at the start, an active worker pool continuously monitors progress.
* **Runtime Segment Stealing (`tryDynamicSplitSegment`)**: Whenever an idle thread finishes its chunk early, the engine inspects active streams, locates the segment with the largest remaining byte buffer (> 256 KB), dynamically cuts it in half (`splitPoint = currentByte + remaining / 2`), bounds the running stream, and assigns the idle worker to start pulling the second half immediately.
* **Linear Byte Assembly**: All segments (both initial and dynamically split parts) are automatically sorted by `start` offset and sequentially assembled with 100% byte-for-byte data integrity.

### 9.2. Persistent Socket Keep-Alive Connection Pooling
* Configured `httpKeepAliveAgent` and `httpsKeepAliveAgent` (`keepAlive: true, maxSockets: 64, maxFreeSockets: 32`).
* Sockets remain open and are reused across range requests and dynamic splits, eliminating TCP 3-way handshake and TLS/SSL certificate exchange latency.

---

## 10. Standalone Windows Installer & Browser Integration Setup Wizard

### 10.1. Standalone NSIS Installer (`dist/Electron by Haris Setup 1.0.0.exe`)
* Single-file standalone Windows installer built with `electron-builder` (`npm run dist`).
* Size: **~111.5 MB**.
* Completely portable to any other Windows PC without requiring Node.js, npm, or Git.
* Automatically bundles the `extension/` directory into `resources/extension` next to the executable.
* Automatically creates Desktop and Start Menu shortcuts.

### 10.2. Browser Integration Setup Wizard (`app/ui/integration-wizard.html`)
* Automatically greets the user on first launch on any PC (or via toolbar `🌐 Browsers` / Options dialog).
* **Detects Installed Browsers**: Google Chrome, Microsoft Edge, Brave, Opera/Opera GX, and Mozilla Firefox.
* **1-Click Integration**: Launches the browser directly to its extensions page (`chrome://extensions`, `edge://extensions`), opens the bundled extension folder in File Explorer, and copies the folder path to the clipboard.
* **Diagnostic Bridge**: Features a "Test Extension Bridge" button confirming live communication on port `9462`.
