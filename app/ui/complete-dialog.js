// Complete dialog controller

const urlParams = new URLSearchParams(window.location.search);
let taskId = urlParams.get('id');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

async function init() {
  if (!taskId) return;
  const task = await window.idmApi.getDownload(taskId);
  if (!task) return;

  document.getElementById('val-name').textContent = task.fileName;
  document.getElementById('val-size').textContent = formatBytes(task.totalBytes || task.downloadedBytes);
  document.getElementById('val-path').textContent = task.filePath;
  document.getElementById('val-url').textContent = task.url;

  document.getElementById('btn-open').addEventListener('click', () => {
    window.idmApi.openFile(task.filePath);
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-open-folder').addEventListener('click', () => {
    window.idmApi.openFolder(task.filePath);
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.idmApi.closeCurrentWindow();
  });
}

init();
