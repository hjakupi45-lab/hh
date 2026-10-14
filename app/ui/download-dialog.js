// IDM Download Progress Dialog Logic

const urlParams = new URLSearchParams(window.location.search);
let taskId = urlParams.get('id');

// Fallback to command line arguments if any
if (!taskId) {
  const arg = window.process && window.process.argv ? window.process.argv.find(a => a.startsWith('--task-id=')) : null;
  if (arg) taskId = arg.split('=')[1];
}

let currentTask = null;

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  return formatBytes(bytesPerSec) + '/s';
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'Unknown';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins} min ${secs} sec`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ${mins % 60} min`;
}

async function initDialog() {
  if (!taskId) {
    document.getElementById('val-status').textContent = 'Error: No task ID specified.';
    return;
  }

  setupEventListeners();

  try {
    currentTask = await window.idmApi.getDownload(taskId);
    if (currentTask) {
      updateUI(currentTask);
    }
  } catch (err) {
    console.error('Failed to load task:', err);
  }
}

function updateUI(task) {
  currentTask = task;
  document.title = `${task.percent}% of ${task.fileName} - IDM`;

  document.getElementById('val-filename').textContent = task.fileName || 'Connecting...';
  
  let statusText = task.status;
  if (task.status === 'downloading') statusText = 'Downloading...';
  else if (task.status === 'connecting') statusText = 'Connecting to server...';
  else if (task.status === 'paused') statusText = 'Paused';
  else if (task.status === 'assembling') statusText = 'Assembling file parts...';
  else if (task.status === 'completed') statusText = 'Download Complete';
  else if (task.status === 'error') statusText = `Error: ${task.errorMessage || 'Failed'}`;
  
  document.getElementById('val-status').textContent = statusText;
  document.getElementById('val-filesize').textContent = task.totalBytes > 0 ? formatBytes(task.totalBytes) : (task.isYouTube ? 'Adaptive Stream' : 'Unknown');
  document.getElementById('val-downloaded').textContent = task.totalBytes > 0 ? `${formatBytes(task.downloadedBytes)} (${task.percent}%)` : `${task.percent}%`;
  document.getElementById('val-speed').textContent = task.speedStr || formatSpeed(task.speed);
  document.getElementById('val-eta').textContent = task.etaStr || formatTime(task.eta);
  document.getElementById('val-resume').textContent = task.resumable ? 'Yes' : 'No';
  document.getElementById('val-url').textContent = task.url;

  // Main progress bar
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  fill.style.width = `${task.percent}%`;
  text.textContent = `${task.percent}%`;
  document.getElementById('label-percent').textContent = `${task.percent}%`;

  // Pause / Resume button state
  const pauseBtn = document.getElementById('btn-pause-resume');
  if (task.status === 'downloading' || task.status === 'connecting') {
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = false;
  } else if (task.status === 'paused') {
    pauseBtn.textContent = 'Resume';
    pauseBtn.disabled = false;
  } else if (task.status === 'completed') {
    pauseBtn.textContent = 'Completed';
    pauseBtn.disabled = true;
  }

  // Update Segments
  updateSegments(task);
}

function updateSegments(task) {
  const container = document.getElementById('segments-container');
  if (!task.segments || task.segments.length === 0) {
    if (task.status === 'downloading' || task.status === 'connecting') {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #0284c7; font-weight: 500;">
          ${task.isYouTube ? '🎬 YouTube Media Stream Engine Active' : 'Single stream connection active'}
        </div>
      `;
    }
    return;
  }

  // If segment rows haven't been created yet
  if (container.children.length !== task.segments.length) {
    container.innerHTML = task.segments.map(seg => `
      <div class="segment-row" id="seg-row-${seg.index}">
        <div class="seg-col-num">Part ${seg.index + 1}</div>
        <div class="seg-col-status" id="seg-stat-${seg.index}">${seg.status}</div>
        <div class="seg-col-bytes" id="seg-bytes-${seg.index}">${formatBytes(seg.downloaded)}</div>
        <div class="seg-col-bar">
          <div class="segment-mini-bar">
            <div class="segment-mini-fill" id="seg-fill-${seg.index}" style="width: ${seg.percent}%;"></div>
          </div>
        </div>
      </div>
    `).join('');
    return;
  }

  // In-place updates for performance
  task.segments.forEach(seg => {
    const statEl = document.getElementById(`seg-stat-${seg.index}`);
    const bytesEl = document.getElementById(`seg-bytes-${seg.index}`);
    const fillEl = document.getElementById(`seg-fill-${seg.index}`);

    if (statEl) statEl.textContent = seg.status;
    if (bytesEl) bytesEl.textContent = formatBytes(seg.downloaded);
    if (fillEl) fillEl.style.width = `${seg.percent}%`;
  });
}

function setupEventListeners() {
  document.getElementById('btn-pause-resume').addEventListener('click', () => {
    if (!currentTask) return;
    if (currentTask.status === 'downloading' || currentTask.status === 'connecting') {
      window.idmApi.pauseDownload(currentTask.id);
    } else {
      window.idmApi.startDownload(currentTask.id);
    }
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    if (currentTask) {
      window.idmApi.deleteDownload(currentTask.id, false);
    }
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-hide').addEventListener('click', () => {
    window.idmApi.closeCurrentWindow();
  });

  // Speed limiter checkbox
  document.getElementById('chk-speed-limiter').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const limit = parseInt(document.getElementById('input-speed-limit').value, 10) || 500;
    window.idmApi.saveSettings({
      speedLimiterEnabled: enabled,
      speedLimitKBps: limit
    });
  });

  // IPC Event subscriptions
  window.idmApi.on('task-progress', (meta) => {
    if (meta.id === taskId) {
      updateUI(meta);
    }
  });

  window.idmApi.on('task-updated', (meta) => {
    if (meta.id === taskId) {
      updateUI(meta);
    }
  });

  window.idmApi.on('task-completed', (meta) => {
    if (meta.id === taskId) {
      updateUI(meta);
      document.getElementById('val-status').textContent = 'Download Complete!';
      const cancelBtn = document.getElementById('btn-cancel');
      if (cancelBtn) cancelBtn.textContent = 'Close';
    }
  });
}

initDialog();
