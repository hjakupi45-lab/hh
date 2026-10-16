# Internet Download Manager (IDM Reverse)

A high-performance Windows desktop application and Google Chrome extension built to reproduce the complete **Internet Download Manager (IDM)** experience with 100% fidelity.

---

## 🌟 Key Features

### 🖥️ Windows Desktop Application
* **Authentic IDM User Interface**:
  * **Top Menu Bar**: Tasks, File, Downloads, View, Help.
  * **Iconic Toolbar**: Add URL, Resume, Stop, Stop All, Delete, Delete Completed, Options, Scheduler, Start Queue, Stop Queue, Site Grabber.
  * **Category Tree Sidebar**: All Downloads, Compressed, Documents, Music, Programs, Video, Unfinished, Finished, Queues (with live badge counters).
  * **Downloads Grid**: File name, Size, Status, Time left, Transfer rate, Last try date, Description.
  * **Signature Download Progress Dialog**:
    * Real-time metrics: File size, Downloaded bytes, Transfer rate (smoothed KB/s & MB/s), Time remaining (ETA), and Resume capability.
    * **Multi-Segment Connection Visualizer**: Displays all 8 (up to 32) parallel connections with live independent progress bars racing each other.
    * In-dialog Speed Limiter toggle & speed input.
    * Pause, Cancel, and Hide buttons.
  * **Download Complete Dialog**:
    * "Download Complete" prompt with Open File, Open Folder, and Close buttons.
  * **Audio Chimes**:
    * Synthesized Web Audio IDM dual-tone completion bell and alert chimes.
  * **True Multi-Segment Parallel Engine**:
    * Performs HTTP `Range: bytes=start-end` requests.
    * Slices files dynamically into $N$ concurrent chunk streams (configurable from 1 to 32 connections).
    * Atomic part assembly without corrupting disk sectors.
    * Full Pause & Resume capability: keeps track of downloaded bytes even across network dropouts.
  * **Global Speed Limiter**: caps aggregate throughput across every parallel stream (pauses all connections together).
  * **Download Scheduler & Queue**: start/stop the main queue at set times (cross-midnight windows supported), with optional
    exit / shutdown / hibernate / sleep actions and "turn off computer when all downloads complete".
  * **Minimize to Tray**: closing the window keeps the background bridge alive; exit from the tray or File menu.

---

### 🌐 Google Chrome Extension ("IDM Integration Module")
* **Manifest V3 Architecture**:
  * **Automatic Download Interception**: Captures browser downloads for designated file types (`.zip`, `.exe`, `.iso`, `.rar`, `.mp4`, `.pdf`, `.tar`, `.dmg`, etc.) and seamlessly hands them over to the desktop app while canceling Chrome's internal downloader.
  * **Floating Video Sniffer ("Download this video")**:
    * Injects an emerald IDM button hovering near HTML5 `<video>` players (e.g. YouTube, Vimeo, direct streams).
    * Detects resolutions/qualities (1080p, 720p, etc.) with a dropdown menu.
    * One-click download with full cookies, referer, and user-agent forwarding.
  * **Context Menus**:
    * Right-click any link, image, or video: **"Download with IDM"**.
    * Right-click anywhere on the page: **"Download all links with IDM"** (Batch Grabber).
  * **Extension Popup**:
  * Real-time connection ping to desktop IDM engine.
  * Interception toggles and quick action to grab all page links.
  * **Native desktop notifications** when a download is captured by the engine.

### 🌍 Multi-Browser Support
* One shared extension source runs on **Chrome, Edge, Brave, Opera and Firefox** via a compatibility polyfill.
* `npm run build:extensions` produces ready-to-load packages under `build/extensions/{chrome,edge,firefox}`.

---

## 🚀 How to Run

### 1. Launch the Desktop Application

From the project root folder (`c:\Users\H\Desktop\IDM REVERSE`):

```powershell
npm start
```

> **Note**: The application will start the Electron desktop window and activate the background integration server on `http://127.0.0.1:9462`.

---

### 2. Install the Google Chrome Extension

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `extension` directory inside this project:
   ```
   C:\Users\H\Desktop\IDM REVERSE\extension
   ```
6. The **IDM Integration Module** icon will appear in your Chrome toolbar!
7. Click the extension icon to verify the status indicator turns green: **"Connected to IDM Engine"**.

---

## 📁 Project Architecture

```
IDM REVERSE/
├── app/
│   ├── main.js                  # Electron lifecycle, window manager, IPC dispatch
│   ├── preload.js               # Secure IPC bridge exposing window.idmApi
│   ├── engine/
│   │   ├── downloader.js        # Segmented multi-connection streaming engine
│   │   └── storage.js           # Persistent JSON storage for downloads & config
│   ├── server/
│   │   └── apiServer.js         # Local HTTP & WebSocket server (port 9462)
│   └── ui/
│       ├── index.html           # Main IDM window
│       ├── app.css              # Authentic IDM styling
│       ├── app.js               # Main window controller logic
│       ├── download-dialog.html # Signature segmented progress popup
│       ├── download-dialog.js
│       ├── download-dialog.css
│       ├── add-url-dialog.html  # "Enter new address to download" modal
│       ├── add-url-dialog.js
│       ├── complete-dialog.html # "Download Complete" popup
│       ├── complete-dialog.js
│       ├── options-dialog.html  # Settings / Options dialog
│       ├── options-dialog.js
│       └── assets/
│           ├── icons.js         # SVG icon assets
│           └── sounds.js        # Web Audio API chime synthesizer
├── extension/
│   ├── manifest.json            # Manifest V3 extension definition
│   ├── background.js            # Intercepts downloads, context menus, API bridge
│   ├── content.js               # Floating "Download this video" sniffer
│   ├── content.css              # Sniffer button styling
│   ├── popup.html               # Extension action popup
│   ├── popup.js
│   ├── popup.css
│   └── icons/                   # 16, 32, 48, 128 px PNG icons
├── scripts/
│   ├── generate-icons.js        # PNG icon generator script
│   ├── test-engine.js           # Engine validation suite
│   ├── test-segmented.js        # 10MB segmented download verification
│   ├── test-resume.js           # Pause & Resume verification
│   └── test-extension-integration.js # Extension API bridge test
└── package.json
```

---

## 🧪 Automated Test Suite

All core systems have automated verification tests:

| Test Script | Description | Status |
| :--- | :--- | :--- |
| `node scripts/test-engine.js` | Verifies storage, category routing, and API server | ✅ Passed |
| `node scripts/test-download.js` | Verifies real HTTP download and assembly | ✅ Passed |
| `node scripts/test-segmented.js` | Verifies 10MB 8-segment parallel chunking & byte integrity | ✅ Passed |
| `node scripts/test-resume.js` | Verifies mid-stream Pause & Resume without byte loss | ✅ Passed |
| `node scripts/test-extension-integration.js` | Verifies Chrome Extension API & WebSocket endpoints | ✅ Passed |
| `node scripts/test-scheduler.js` | Verifies scheduler config, window math & edge cases | ✅ Passed |
| `node scripts/test-limiter.js` | Verifies the global speed limiter throttles throughput | ✅ Passed |

---

## ⚙️ Configuration & Options

Access **Options** from the IDM toolbar to customize:
* **Max Connection Number**: Choose between 1, 2, 4, 8, 16, 24, or 32 concurrent parallel segments.
* **Default Folders**: Configure distinct destination directories for Compressed, Documents, Music, Programs, and Video categories.
* **Speed Limiter**: Cap download rates (in KB/s) to save bandwidth for browsing.
* **File Types**: Customize the list of file extensions automatically captured from Chrome.
