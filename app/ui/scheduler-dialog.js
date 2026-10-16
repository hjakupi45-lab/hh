// Download Scheduler dialog controller

async function init() {
  const chkEnable = document.getElementById('chk-enable');
  const startTime = document.getElementById('start-time');
  const stopTime = document.getElementById('stop-time');
  const onStart = document.getElementById('on-start');
  const onStop = document.getElementById('on-stop');
  const chkShutdown = document.getElementById('chk-shutdown-complete');
  const statusLine = document.getElementById('status-line');

  let status = null;
  try {
    status = await window.idmApi.getScheduler();
  } catch (e) {
    console.error('Failed to load scheduler:', e);
  }

  const cfg = (status && status.config) || {};
  chkEnable.checked = !!cfg.enabled;
  startTime.value = cfg.startTime || '01:00';
  stopTime.value = cfg.stopTime || '06:00';
  onStart.value = cfg.onStart || 'resume-queue';
  onStop.value = cfg.onStop || 'stop-queue';
  chkShutdown.checked = !!cfg.shutdownOnComplete;

  function syncEnabledState() {
    const on = chkEnable.checked;
    [startTime, stopTime, onStart, onStop, chkShutdown].forEach(el => { el.disabled = !on; });
    renderStatus();
  }

  function renderStatus() {
    if (!chkEnable.checked) {
      statusLine.className = 'status-line off';
      statusLine.innerHTML = 'Schedule is <b>disabled</b>. Downloads use the normal Start/Stop Queue buttons.';
      return;
    }
    const now = status ? status.currentTime : '';
    const live = status && status.inWindow;
    statusLine.className = 'status-line' + (live ? '' : ' off');
    statusLine.innerHTML =
      `Current time: <b>${now}</b> &nbsp;•&nbsp; Window: <b>${startTime.value} → ${stopTime.value}</b> &nbsp;•&nbsp; ` +
      (live ? 'Queue window <b>ACTIVE</b>' : 'Outside schedule window');
  }

  chkEnable.addEventListener('change', syncEnabledState);
  startTime.addEventListener('change', renderStatus);
  stopTime.addEventListener('change', renderStatus);

  syncEnabledState();

  document.getElementById('btn-save').addEventListener('click', async () => {
    await window.idmApi.saveScheduler({
      enabled: chkEnable.checked,
      startTime: startTime.value || '01:00',
      stopTime: stopTime.value || '06:00',
      onStart: onStart.value,
      onStop: onStop.value,
      shutdownOnComplete: chkShutdown.checked
    });
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-start-now').addEventListener('click', async () => {
    await window.idmApi.resumeAll();
    statusLine.className = 'status-line';
    statusLine.innerHTML = 'Main queue <b>started</b>.';
  });
}

init();
