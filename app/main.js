const { app, BrowserWindow, ipcMain, shell, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const downloadManager = require('./engine/downloader');
const storage = require('./engine/storage');
const scheduler = require('./engine/scheduler');
const apiServer = require('./server/apiServer');

let mainWindow = null;
let tray = null;
const progressWindows = new Map(); // taskId -> BrowserWindow

app.isQuitting = false;

// Enforce single instance: if another instance is already running, focus it and quit
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

// Initialize integration server only in the primary instance
apiServer.start();

function getExtensionPath(browserId) {
  const isFirefox = browserId === 'firefox';

  if (app.isPackaged) {
    // Firefox and Chromium builds are bundled into separate resource folders.
    const packagedExt = path.join(process.resourcesPath, isFirefox ? 'extension-firefox' : 'extension');
    if (fs.existsSync(packagedExt)) return packagedExt;
    const fallback = path.join(process.resourcesPath, 'extension');
    if (fs.existsSync(fallback)) return fallback;
  }

  if (isFirefox) {
    const builtFirefox = path.join(__dirname, '../build/extensions/firefox');
    if (fs.existsSync(builtFirefox)) return builtFirefox;
  }
  return path.join(__dirname, '../extension');
}

function detectInstalledBrowsers() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const browserDefinitions = [
    {
      id: 'chrome',
      name: 'Google Chrome',
      icon: '🌐',
      paths: [
        path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
        path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
        path.join(localAppData, 'Google/Chrome/Application/chrome.exe')
      ],
      extensionUrl: 'chrome://extensions'
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      icon: '🌊',
      paths: [
        path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe')
      ],
      extensionUrl: 'edge://extensions'
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      icon: '🦁',
      paths: [
        path.join(programFiles, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(programFilesX86, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(localAppData, 'BraveSoftware/Brave-Browser/Application/brave.exe')
      ],
      extensionUrl: 'brave://extensions'
    },
    {
      id: 'opera',
      name: 'Opera / Opera GX',
      icon: '🔴',
      paths: [
        path.join(localAppData, 'Programs/Opera/opera.exe'),
        path.join(localAppData, 'Programs/Opera GX/opera.exe'),
        path.join(programFiles, 'Opera/opera.exe'),
        path.join(programFilesX86, 'Opera/opera.exe')
      ],
      extensionUrl: 'opera://extensions'
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      icon: '🦊',
      paths: [
        path.join(programFiles, 'Mozilla Firefox/firefox.exe'),
        path.join(programFilesX86, 'Mozilla Firefox/firefox.exe')
      ],
      extensionUrl: 'about:debugging#/runtime/this-firefox'
    }
  ];

  return browserDefinitions.map(b => {
    const foundPath = b.paths.find(p => fs.existsSync(p));
    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      installed: !!foundPath,
      exePath: foundPath || null,
      extensionUrl: b.extensionUrl
    };
  });
}

function openIntegrationWizard() {
  const wizWin = new BrowserWindow({
    width: 680,
    height: 600,
    minWidth: 620,
    minHeight: 520,
    resizable: true,
    parent: mainWindow,
    modal: false,
    title: 'Browser Integration Setup - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  wizWin.setMenu(null);
  wizWin.loadFile(path.join(__dirname, 'ui/integration-wizard.html'));
  wizWin.show();
  wizWin.focus();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 840,
    minHeight: 500,
    title: 'Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#f0f0f0',
    show: true
  });

  const mainHtmlUrl = pathToFileURL(path.join(__dirname, 'ui/index.html')).href;
  mainWindow.loadURL(mainHtmlUrl);
  mainWindow.show();
  mainWindow.focus();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (!storage.settings.firstRunWizardShown) {
      setTimeout(() => {
        openIntegrationWizard();
      }, 700);
    }
  });

  mainWindow.on('close', (e) => {
    // Typical download-manager behaviour: closing the window parks the app in
    // the system tray so background bridge keeps working. Exit via the tray
    // menu (or File > Exit) to actually terminate.
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  try {
    const iconPath = path.join(__dirname, 'ui/assets/icon.png');
    const trayImage = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayImage);
    tray.setToolTip('Electron by Haris');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Electron by Haris', click: () => showMainWindow() },
      { label: 'Add URL...', click: () => { showMainWindow(); openAddUrlDialog(); } },
      { label: 'Scheduler...', click: () => { showMainWindow(); openSchedulerDialog(); } },
      { type: 'separator' },
      { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => showMainWindow());
  } catch (e) {
    console.error('Tray initialization failed:', e);
  }
}

function openAddUrlDialog() {
  const addUrlWin = new BrowserWindow({
    width: 540,
    height: 250,
    resizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Enter new address - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  addUrlWin.setMenu(null);
  addUrlWin.loadFile(path.join(__dirname, 'ui/add-url-dialog.html'));
}

function openOptionsDialog() {
  const optWin = new BrowserWindow({
    width: 580,
    height: 520,
    resizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Configuration - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  optWin.setMenu(null);
  optWin.loadFile(path.join(__dirname, 'ui/options-dialog.html'));
}

function openSchedulerDialog() {
  const schWin = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Download Scheduler - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  schWin.setMenu(null);
  schWin.loadFile(path.join(__dirname, 'ui/scheduler-dialog.html'));
}

// Execute the configured stop action (queue stop, app exit, power state...).
function runSchedulerAction(action) {
  switch (action) {
    case 'stop-queue':
      downloadManager.stopAll();
      break;
    case 'exit-app':
      app.isQuitting = true;
      app.quit();
      break;
    case 'shutdown':
      if (process.platform === 'win32') {
        spawn('shutdown', ['/s', '/t', '60', '/c', 'Electron by Haris: scheduled shutdown. Save your work.'], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('shutdown', ['-h', '+1'], { detached: true, stdio: 'ignore' }).unref();
      }
      break;
    case 'hibernate':
      if (process.platform === 'win32') {
        spawn('shutdown', ['/h'], { detached: true, stdio: 'ignore' }).unref();
      }
      break;
    case 'sleep':
      if (process.platform === 'win32') {
        spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('pmset', ['sleepnow'], { detached: true, stdio: 'ignore' }).unref();
      }
      break;
    default:
      break;
  }
}

function bringWindowToForeground(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true);
  win.show();
  win.focus();
  win.moveTop();
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(false);
    }
  }, 1200);
}

function openDownloadProgressDialog(taskId) {
  if (progressWindows.has(taskId)) {
    const existing = progressWindows.get(taskId);
    if (!existing.isDestroyed()) {
      bringWindowToForeground(existing);
      return existing;
    }
  }

  const task = downloadManager.getTask(taskId);
  const progWin = new BrowserWindow({
    width: 580,
    height: 450,
    resizable: true,
    minWidth: 480,
    minHeight: 380,
    alwaysOnTop: true,
    show: false,
    title: task ? `${task.fileName} - Electron by Haris` : 'Download Status - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  progWin.setMenu(null);
  const htmlUrl = pathToFileURL(path.join(__dirname, 'ui/download-dialog.html')).href + `?id=${encodeURIComponent(taskId)}`;
  progWin.loadURL(htmlUrl);

  progWin.once('ready-to-show', () => {
    bringWindowToForeground(progWin);
  });

  setTimeout(() => {
    if (!progWin.isDestroyed() && !progWin.isVisible()) {
      bringWindowToForeground(progWin);
    }
  }, 300);

  progressWindows.set(taskId, progWin);

  progWin.on('closed', () => {
    progressWindows.delete(taskId);
  });

  return progWin;
}

function openCompleteDialog(taskId) {
  const task = downloadManager.getTask(taskId);
  if (!task) return;

  const compWin = new BrowserWindow({
    width: 500,
    height: 300,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Download Complete - Electron by Haris',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  compWin.setMenu(null);
  const completeUrl = pathToFileURL(path.join(__dirname, 'ui/complete-dialog.html')).href + `?id=${encodeURIComponent(taskId)}`;
  compWin.loadURL(completeUrl);

  compWin.once('ready-to-show', () => {
    bringWindowToForeground(compWin);
  });
}

// IPC Handlers
ipcMain.handle('get-all-downloads', () => {
  return downloadManager.getAllTasks();
});

ipcMain.handle('get-download', (event, id) => {
  const task = downloadManager.getTask(id);
  return task ? task.getMeta() : null;
});

ipcMain.handle('get-settings', () => {
  return storage.settings;
});

ipcMain.handle('save-settings', (event, newSettings) => {
  const saved = storage.saveSettings(newSettings);
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('settings-updated', saved);
    }
  });
  return saved;
});

ipcMain.handle('add-new-download', (event, options) => {
  const task = downloadManager.createTask(options);
  if (options.autoStart !== false) {
    task.start();
  }
  if (storage.settings.showDownloadProgressDialog) {
    openDownloadProgressDialog(task.id);
  }
  return task.getMeta();
});

ipcMain.handle('start-download', (event, id) => {
  downloadManager.startTask(id);
  return true;
});

ipcMain.handle('pause-download', (event, id) => {
  downloadManager.pauseTask(id);
  return true;
});

ipcMain.handle('delete-download', (event, id, deleteFile) => {
  downloadManager.deleteTask(id, deleteFile);
  if (progressWindows.has(id)) {
    const win = progressWindows.get(id);
    if (!win.isDestroyed()) win.close();
  }
  return true;
});

ipcMain.handle('stop-all', () => {
  downloadManager.stopAll();
  return true;
});

ipcMain.handle('resume-all', () => {
  downloadManager.resumeAll();
  return true;
});

ipcMain.handle('delete-all-completed', (event, deleteFiles) => {
  downloadManager.deleteAllCompleted(deleteFiles);
  return true;
});

ipcMain.handle('open-file', async (event, filePath) => {
  if (filePath) {
    await shell.openPath(filePath);
  }
});

ipcMain.handle('open-folder', async (event, filePath) => {
  if (filePath) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-add-url-dialog', () => {
  openAddUrlDialog();
});

ipcMain.handle('open-options-dialog', () => {
  openOptionsDialog();
});

ipcMain.handle('get-scheduler', () => {
  return scheduler.getStatus();
});

ipcMain.handle('save-scheduler', (event, patch) => {
  scheduler.saveConfig(patch);
  const status = scheduler.getStatus();
  broadcastToWindows('scheduler-updated', status);
  return status;
});

ipcMain.handle('open-scheduler-dialog', () => {
  openSchedulerDialog();
});

ipcMain.handle('open-download-progress-dialog', (event, id) => {
  openDownloadProgressDialog(id);
});

ipcMain.handle('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('minimize-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

// Browser Integration & Setup Wizard IPC Handlers
ipcMain.handle('detect-browsers', () => {
  return detectInstalledBrowsers();
});

ipcMain.handle('get-extension-path', (event, browserId) => {
  return getExtensionPath(browserId);
});

ipcMain.handle('open-extension-folder', async (event, browserId) => {
  const extPath = getExtensionPath(browserId);
  if (fs.existsSync(extPath)) {
    await shell.openPath(extPath);
  }
});

ipcMain.handle('integrate-browser', async (event, browserId) => {
  const browsers = detectInstalledBrowsers();
  const target = browsers.find(b => b.id === browserId);
  const extPath = getExtensionPath(browserId);

  // 1. Open extension folder in Explorer
  if (fs.existsSync(extPath)) {
    shell.openPath(extPath);
  }

  // 2. Launch browser directly to extensions management page
  if (target && target.exePath) {
    try {
      spawn(target.exePath, [target.extensionUrl], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) {
      shell.openExternal(target.extensionUrl);
    }
  } else if (target) {
    shell.openExternal(target.extensionUrl);
  }

  return true;
});

ipcMain.handle('open-integration-wizard', () => {
  openIntegrationWizard();
});

ipcMain.handle('set-windows-auto-start', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath
  });
  return true;
});

// Broadcast helper to all renderer windows
function broadcastToWindows(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
  for (const win of progressWindows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

// Download manager event dispatching
downloadManager.on('task-created', (meta) => {
  broadcastToWindows('task-created', meta);
});

downloadManager.on('task-updated', (meta) => {
  broadcastToWindows('task-updated', meta);
});

downloadManager.on('task-progress', (meta) => {
  broadcastToWindows('task-progress', meta);
});

downloadManager.on('task-completed', (meta) => {
  broadcastToWindows('task-completed', meta);
  // Auto-close progress window or show completion dialog
  if (progressWindows.has(meta.id)) {
    const progWin = progressWindows.get(meta.id);
    if (!progWin.isDestroyed()) {
      progWin.webContents.send('task-completed', meta);
    }
  }

  if (storage.settings.showDownloadCompleteDialog) {
    openCompleteDialog(meta.id);
  }

  // "Turn off computer when all downloads finish" scheduler option.
  const schedCfg = scheduler.getConfig();
  if (schedCfg.enabled && schedCfg.shutdownOnComplete) {
    const stillActive = downloadManager.getAllTasks().some(
      t => t.status === 'downloading' || t.status === 'connecting' || t.status === 'queued' || t.status === 'assembling'
    );
    if (!stillActive) {
      runSchedulerAction('shutdown');
    }
  }
});

// Scheduler event dispatching
scheduler.on('schedule-start', (info) => {
  if (info.onStart === 'resume-queue') {
    downloadManager.resumeAll();
  }
  broadcastToWindows('scheduler-fired', { phase: 'start', info });
});

scheduler.on('schedule-stop', (info) => {
  runSchedulerAction(info.onStop);
  broadcastToWindows('scheduler-fired', { phase: 'stop', info });
});

downloadManager.on('task-deleted', (id) => {
  broadcastToWindows('task-deleted', id);
});

downloadManager.on('task-error', (data) => {
  broadcastToWindows('task-error', data);
});

// Handle incoming requests from Chrome extension
apiServer.on('new-download-request', ({ taskId, showDialog }) => {
  openDownloadProgressDialog(taskId);
});

apiServer.on('show-task-dialog', (taskId) => {
  openDownloadProgressDialog(taskId);
});

apiServer.on('focus-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
  } else {
    createMainWindow();
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  }
});

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  scheduler.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  scheduler.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
