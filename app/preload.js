const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('idmApi', {
  // Query
  getAllDownloads: () => ipcRenderer.invoke('get-all-downloads'),
  getDownload: (id) => ipcRenderer.invoke('get-download', id),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Actions
  addNewDownload: (options) => ipcRenderer.invoke('add-new-download', options),
  startDownload: (id) => ipcRenderer.invoke('start-download', id),
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  deleteDownload: (id, deleteFile) => ipcRenderer.invoke('delete-download', id, deleteFile),
  stopAll: () => ipcRenderer.invoke('stop-all'),
  resumeAll: () => ipcRenderer.invoke('resume-all'),
  deleteAllCompleted: (deleteFiles) => ipcRenderer.invoke('delete-all-completed', deleteFiles),

  // File system interaction
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Dialog Controls
  openAddUrlDialog: () => ipcRenderer.invoke('open-add-url-dialog'),
  openOptionsDialog: () => ipcRenderer.invoke('open-options-dialog'),
  openDownloadProgressDialog: (id) => ipcRenderer.invoke('open-download-progress-dialog', id),
  closeCurrentWindow: () => ipcRenderer.invoke('close-current-window'),
  minimizeCurrentWindow: () => ipcRenderer.invoke('minimize-current-window'),

  // Browser Integration & Setup Wizard
  detectBrowsers: () => ipcRenderer.invoke('detect-browsers'),
  integrateBrowser: (browserId) => ipcRenderer.invoke('integrate-browser', browserId),
  getExtensionPath: () => ipcRenderer.invoke('get-extension-path'),
  openExtensionFolder: () => ipcRenderer.invoke('open-extension-folder'),
  openIntegrationWizard: () => ipcRenderer.invoke('open-integration-wizard'),
  setWindowsAutoStart: (enable) => ipcRenderer.invoke('set-windows-auto-start', enable),

  // Sound effects
  playChime: (type) => ipcRenderer.invoke('play-chime', type),

  // Event Subscriptions
  on: (channel, listener) => {
    const validChannels = [
      'task-created',
      'task-updated',
      'task-progress',
      'task-completed',
      'task-deleted',
      'task-error',
      'active-task-data',
      'settings-updated'
    ];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  }
});
