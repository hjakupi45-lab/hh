// IDM Desktop Application Renderer Logic

let downloads = [];
let selectedTaskId = null;
let currentFilter = { type: 'category', value: 'all' };
let settings = null;

// Helpers
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return formatBytes(bytesPerSec) + '/s';
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins} min ${secs} sec`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ${mins % 60} min`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Populate Toolbar Icons
function initIcons() {
  document.getElementById('icon-add-url').innerHTML = IDMIcons.addUrl;
  document.getElementById('icon-resume').innerHTML = IDMIcons.resume;
  document.getElementById('icon-stop').innerHTML = IDMIcons.stop;
  document.getElementById('icon-stop-all').innerHTML = IDMIcons.stopAll;
  document.getElementById('icon-delete').innerHTML = IDMIcons.delete;
  document.getElementById('icon-delete-all').innerHTML = IDMIcons.deleteAll;
  document.getElementById('icon-options').innerHTML = IDMIcons.options;
  document.getElementById('icon-scheduler').innerHTML = IDMIcons.scheduler;
  document.getElementById('icon-start-queue').innerHTML = IDMIcons.startQueue;
  document.getElementById('icon-stop-queue').innerHTML = IDMIcons.stopQueue;
  document.getElementById('icon-grabber').innerHTML = IDMIcons.grabber;

  // Category Icons
  document.getElementById('cat-icon-all').innerHTML = IDMIcons.catAll;
  document.getElementById('cat-icon-compressed').innerHTML = IDMIcons.catCompressed;
  document.getElementById('cat-icon-documents').innerHTML = IDMIcons.catDocuments;
  document.getElementById('cat-icon-music').innerHTML = IDMIcons.catMusic;
  document.getElementById('cat-icon-programs').innerHTML = IDMIcons.catPrograms;
  document.getElementById('cat-icon-video').innerHTML = IDMIcons.catVideo;
  document.getElementById('cat-icon-finished').innerHTML = IDMIcons.catFinished;
  document.getElementById('cat-icon-unfinished').innerHTML = IDMIcons.catUnfinished;
  document.getElementById('cat-icon-queues').innerHTML = IDMIcons.catQueues;
}

// Load initial downloads and settings
async function initApp() {
  initIcons();
  setupEventListeners();

  try {
    settings = await window.idmApi.getSettings();
    downloads = await window.idmApi.getAllDownloads();
    renderDownloads();
    updateBadges();
  } catch (err) {
    console.error('Failed to initialize app:', err);
  }
}

// Filter downloads
function getFilteredDownloads() {
  return downloads.filter(task => {
    if (currentFilter.type === 'category') {
      if (currentFilter.value === 'all') return true;
      return task.category === currentFilter.value;
    } else if (currentFilter.type === 'status') {
      if (currentFilter.value === 'finished') return task.status === 'completed';
      if (currentFilter.value === 'unfinished') return task.status !== 'completed';
    }
    return true;
  });
}

function updateBadges() {
  const counts = {
    all: downloads.length,
    compressed: 0,
    documents: 0,
    music: 0,
    programs: 0,
    video: 0,
    finished: 0,
    unfinished: 0
  };

  downloads.forEach(d => {
    if (counts[d.category] !== undefined) counts[d.category]++;
    if (d.status === 'completed') counts.finished++;
    else counts.unfinished++;
  });

  for (const [key, val] of Object.entries(counts)) {
    const el = document.getElementById(`badge-${key}`);
    if (el) el.textContent = val;
  }

  // Status Bar counts
  const totalEl = document.getElementById('status-total-count');
  if (totalEl) totalEl.textContent = `${downloads.length} downloads`;

  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'connecting').length;
  const activeEl = document.getElementById('status-active-count');
  if (activeEl) activeEl.textContent = `${activeCount} active transfers`;
}

// Render downloads table
function renderDownloads() {
  const listEl = document.getElementById('downloads-list');
  const items = getFilteredDownloads();

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="2">
          <circle cx="32" cy="32" r="28"/>
          <path d="M32 20v24M22 34l10 10 10-10"/>
        </svg>
        <div>No downloads in this category. Click <b>"Add URL"</b> or download from Chrome.</div>
      </div>
    `;
    updateToolbarButtons();
    return;
  }

  listEl.innerHTML = items.map(item => createRowHtml(item)).join('');
  attachRowListeners();
  updateToolbarButtons();
}

function createRowHtml(item) {
  const isSelected = item.id === selectedTaskId;
  let statusBadge = '';
  let progressBar = '';

  if (item.status === 'completed') {
    statusBadge = `<span class="status-badge completed">Complete</span>`;
  } else if (item.status === 'downloading') {
    statusBadge = `
      <div style="width: 100%;">
        <span class="status-badge downloading">Downloading (${item.percent}%)</span>
        <div class="cell-progress-bar">
          <div class="cell-progress-fill" style="width: ${item.percent}%;"></div>
        </div>
      </div>
    `;
  } else if (item.status === 'paused') {
    statusBadge = `<span class="status-badge paused">Paused (${item.percent}%)</span>`;
  } else if (item.status === 'error') {
    statusBadge = `<span class="status-badge error" title="${item.errorMessage || ''}">Error</span>`;
  } else if (item.status === 'connecting') {
    statusBadge = `<span class="status-badge connecting">Connecting...</span>`;
  } else if (item.status === 'assembling') {
    statusBadge = `<span class="status-badge connecting">Assembling parts...</span>`;
  } else {
    statusBadge = `<span class="status-badge">${item.status}</span>`;
  }

  const categoryIcon = getCategorySvg(item.category);

  return `
    <div class="tr ${isSelected ? 'selected' : ''}" data-id="${item.id}" id="row-${item.id}">
      <div class="td col-name" title="${item.fileName}">
        ${categoryIcon}
        <span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis;">${item.fileName}</span>
      </div>
      <div class="td col-size">${formatBytes(item.totalBytes || item.downloadedBytes)}</div>
      <div class="td col-status">${statusBadge}</div>
      <div class="td col-time" id="time-${item.id}">${formatTime(item.eta)}</div>
      <div class="td col-speed" id="speed-${item.id}">${formatSpeed(item.speed)}</div>
      <div class="td col-date">${formatDate(item.lastTryDate)}</div>
      <div class="td col-desc" title="${item.url}">${item.url}</div>
    </div>
  `;
}

function getCategorySvg(cat) {
  switch (cat) {
    case 'compressed': return IDMIcons.catCompressed;
    case 'documents': return IDMIcons.catDocuments;
    case 'music': return IDMIcons.catMusic;
    case 'programs': return IDMIcons.catPrograms;
    case 'video': return IDMIcons.catVideo;
    default: return IDMIcons.catAll;
  }
}

function updateRowInPlace(meta) {
  const row = document.getElementById(`row-${meta.id}`);
  if (!row) return;

  const speedEl = document.getElementById(`speed-${meta.id}`);
  if (speedEl) speedEl.textContent = formatSpeed(meta.speed);

  const timeEl = document.getElementById(`time-${meta.id}`);
  if (timeEl) timeEl.textContent = formatTime(meta.eta);

  const statusCol = row.querySelector('.col-status');
  if (statusCol) {
    if (meta.status === 'downloading') {
      statusCol.innerHTML = `
        <div style="width: 100%;">
          <span class="status-badge downloading">Downloading (${meta.percent}%)</span>
          <div class="cell-progress-bar">
            <div class="cell-progress-fill" style="width: ${meta.percent}%;"></div>
          </div>
        </div>
      `;
    } else if (meta.status === 'completed') {
      statusCol.innerHTML = `<span class="status-badge completed">Complete</span>`;
    } else if (meta.status === 'paused') {
      statusCol.innerHTML = `<span class="status-badge paused">Paused (${meta.percent}%)</span>`;
    } else if (meta.status === 'assembling') {
      statusCol.innerHTML = `<span class="status-badge connecting">Assembling parts...</span>`;
    }
  }

  const sizeCol = row.querySelector('.col-size');
  if (sizeCol && meta.totalBytes > 0) {
    sizeCol.textContent = formatBytes(meta.totalBytes);
  }
}

function attachRowListeners() {
  const rows = document.querySelectorAll('.tr[data-id]');
  rows.forEach(row => {
    row.addEventListener('click', (e) => {
      selectedTaskId = row.getAttribute('data-id');
      document.querySelectorAll('.tr').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      updateToolbarButtons();
    });

    row.addEventListener('dblclick', () => {
      const id = row.getAttribute('data-id');
      const task = downloads.find(d => d.id === id);
      if (task) {
        if (task.status === 'completed') {
          window.idmApi.openFile(task.filePath);
        } else {
          window.idmApi.openDownloadProgressDialog(task.id);
        }
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      selectedTaskId = row.getAttribute('data-id');
      document.querySelectorAll('.tr').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      updateToolbarButtons();
      showContextMenu(e.clientX, e.clientY);
    });
  });
}

function updateToolbarButtons() {
  const selected = downloads.find(d => d.id === selectedTaskId);
  const resumeBtn = document.getElementById('btn-resume');
  const stopBtn = document.getElementById('btn-stop');
  const deleteBtn = document.getElementById('btn-delete');

  if (!selected) {
    resumeBtn.disabled = true;
    stopBtn.disabled = true;
    deleteBtn.disabled = true;
    return;
  }

  deleteBtn.disabled = false;
  if (selected.status === 'downloading' || selected.status === 'connecting') {
    resumeBtn.disabled = true;
    stopBtn.disabled = false;
  } else if (selected.status === 'paused' || selected.status === 'queued') {
    resumeBtn.disabled = false;
    stopBtn.disabled = true;
  } else {
    resumeBtn.disabled = true;
    stopBtn.disabled = true;
  }
}

// Context menu
const contextMenu = document.getElementById('context-menu');

function showContextMenu(x, y) {
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';

  const selected = downloads.find(d => d.id === selectedTaskId);
  if (!selected) return;

  const isCompleted = selected.status === 'completed';
  const isDownloading = selected.status === 'downloading';

  document.getElementById('ctx-open').style.display = isCompleted ? 'flex' : 'none';
  document.getElementById('ctx-resume').style.display = !isCompleted && !isDownloading ? 'flex' : 'none';
  document.getElementById('ctx-pause').style.display = isDownloading ? 'flex' : 'none';
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
}

document.addEventListener('click', () => hideContextMenu());

// Event Listeners setup
function setupEventListeners() {
  // Category sidebar clicks
  document.querySelectorAll('.category-item[data-category]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      currentFilter = { type: 'category', value: el.getAttribute('data-category') };
      renderDownloads();
    });
  });

  document.querySelectorAll('.category-item[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      currentFilter = { type: 'status', value: el.getAttribute('data-filter') };
      renderDownloads();
    });
  });

  // Toolbar Actions
  document.getElementById('btn-add-url').addEventListener('click', () => {
    window.idmApi.openAddUrlDialog();
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.startDownload(selectedTaskId);
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.pauseDownload(selectedTaskId);
  });

  document.getElementById('btn-stop-all').addEventListener('click', () => {
    window.idmApi.stopAll();
  });

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (selectedTaskId) {
      if (confirm('Are you sure you want to remove this download from the list?')) {
        window.idmApi.deleteDownload(selectedTaskId, false);
      }
    }
  });

  document.getElementById('btn-delete-all').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all completed downloads?')) {
      window.idmApi.deleteAllCompleted(false);
    }
  });

  document.getElementById('btn-options').addEventListener('click', () => {
    window.idmApi.openOptionsDialog();
  });

  document.getElementById('btn-scheduler').addEventListener('click', () => {
    alert('IDM Scheduler: Automatically start/stop downloads or disconnect modem at designated times.');
  });

  document.getElementById('btn-start-queue').addEventListener('click', () => {
    window.idmApi.resumeAll();
  });

  document.getElementById('btn-stop-queue').addEventListener('click', () => {
    window.idmApi.stopAll();
  });

  document.getElementById('btn-grabber').addEventListener('click', () => {
    window.idmApi.openAddUrlDialog();
  });

  const btnBrowserSetup = document.getElementById('btn-browser-setup');
  if (btnBrowserSetup) {
    btnBrowserSetup.addEventListener('click', () => {
      window.idmApi.openIntegrationWizard();
    });
  }

  // Context Menu Actions
  document.getElementById('ctx-resume').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.startDownload(selectedTaskId);
  });

  document.getElementById('ctx-pause').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.pauseDownload(selectedTaskId);
  });

  document.getElementById('ctx-details').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.openDownloadProgressDialog(selectedTaskId);
  });

  document.getElementById('ctx-open').addEventListener('click', () => {
    const task = downloads.find(d => d.id === selectedTaskId);
    if (task) window.idmApi.openFile(task.filePath);
  });

  document.getElementById('ctx-open-folder').addEventListener('click', () => {
    const task = downloads.find(d => d.id === selectedTaskId);
    if (task) window.idmApi.openFolder(task.filePath);
  });

  document.getElementById('ctx-copy-link').addEventListener('click', () => {
    const task = downloads.find(d => d.id === selectedTaskId);
    if (task && navigator.clipboard) {
      navigator.clipboard.writeText(task.url);
    }
  });

  document.getElementById('ctx-redownload').addEventListener('click', () => {
    const task = downloads.find(d => d.id === selectedTaskId);
    if (task) {
      window.idmApi.addNewDownload({
        url: task.url,
        fileName: task.fileName,
        autoStart: true
      });
    }
  });

  document.getElementById('ctx-delete').addEventListener('click', () => {
    if (selectedTaskId) window.idmApi.deleteDownload(selectedTaskId, false);
  });

  document.getElementById('ctx-delete-file').addEventListener('click', () => {
    if (selectedTaskId && confirm('Are you sure you want to permanently delete this file from your disk?')) {
      window.idmApi.deleteDownload(selectedTaskId, true);
    }
  });

  // Menu bar items
  document.getElementById('menu-tasks').addEventListener('click', () => {
    window.idmApi.openAddUrlDialog();
  });
  document.getElementById('menu-downloads').addEventListener('click', () => {
    window.idmApi.openOptionsDialog();
  });
  document.getElementById('menu-help').addEventListener('click', () => {
    alert('Electron by Haris 6.42\nBuilt for ultra-fast multi-segmented downloads and 100% Chrome integration.');
  });

  // IPC Event Subscriptions
  window.idmApi.on('task-created', (task) => {
    downloads.unshift(task);
    renderDownloads();
    updateBadges();
  });

  window.idmApi.on('task-progress', (meta) => {
    const idx = downloads.findIndex(d => d.id === meta.id);
    if (idx !== -1) {
      downloads[idx] = { ...downloads[idx], ...meta };
      updateRowInPlace(meta);
    }
  });

  window.idmApi.on('task-updated', (meta) => {
    const idx = downloads.findIndex(d => d.id === meta.id);
    if (idx !== -1) {
      downloads[idx] = { ...downloads[idx], ...meta };
      updateRowInPlace(meta);
    } else {
      downloads.unshift(meta);
    }
    updateBadges();
    updateToolbarButtons();
  });

  window.idmApi.on('task-completed', (meta) => {
    const idx = downloads.findIndex(d => d.id === meta.id);
    if (idx !== -1) {
      downloads[idx] = { ...downloads[idx], ...meta };
      updateRowInPlace(meta);
    }
    updateBadges();
    updateToolbarButtons();
    if (window.idmSounds) {
      window.idmSounds.playComplete();
    }
  });

  window.idmApi.on('task-deleted', (id) => {
    downloads = downloads.filter(d => d.id !== id);
    if (selectedTaskId === id) selectedTaskId = null;
    renderDownloads();
    updateBadges();
  });

  window.idmApi.on('task-error', ({ id, error }) => {
    const idx = downloads.findIndex(d => d.id === id);
    if (idx !== -1) {
      downloads[idx].status = 'error';
      downloads[idx].errorMessage = error;
      updateRowInPlace(downloads[idx]);
    }
    if (window.idmSounds) {
      window.idmSounds.playAlert();
    }
  });
}

// Start
initApp();
