const { app, BrowserWindow, ipcMain, shell, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const downloadManager = require('./engine/downloader');
const storage = require('./engine/storage');
const apiServer = require('./server/apiServer');

let mainWindow = null;
let tray = null;
const progressWindows = new Map(); // taskId -> BrowserWindow

// Initialize integration server immediately
apiServer.start();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 840,
    minHeight: 500,
    title: 'Internet Download Manager 6.42',
    icon: path.join(__dirname, 'ui/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#f0f0f0',
    show: true
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));
  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      // Keep running in background/tray unless quit
      // mainWindow.hide();
      // e.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openAddUrlDialog() {
  const addUrlWin = new BrowserWindow({
    width: 540,
    height: 250,
    resizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Enter new address to download',
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
    title: 'Configuration',
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

function openDownloadProgressDialog(taskId) {
  if (progressWindows.has(taskId)) {
    const existing = progressWindows.get(taskId);
    if (!existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      existing.setAlwaysOnTop(true, 'screen-saver');
      existing.moveTop();
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
    title: task ? `${task.fileName} - IDM` : 'Download Status - IDM',
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
    progWin.show();
    progWin.focus();
    progWin.setAlwaysOnTop(true, 'screen-saver');
    progWin.moveTop();
  });

  setTimeout(() => {
    if (!progWin.isDestroyed() && !progWin.isVisible()) {
      progWin.show();
      progWin.focus();
      progWin.setAlwaysOnTop(true, 'screen-saver');
      progWin.moveTop();
    }
  }, 350);

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
    title: 'Download Complete',
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
    compWin.show();
    compWin.focus();
    compWin.setAlwaysOnTop(true, 'screen-saver');
    compWin.moveTop();
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
  return storage.saveSettings(newSettings);
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
