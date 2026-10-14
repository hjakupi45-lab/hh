// Options dialog controller

async function init() {
  const settings = await window.idmApi.getSettings();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  // Populate fields
  document.getElementById('chk-auto-start').checked = !!settings.autoStartDownload;
  document.getElementById('chk-show-progress').checked = !!settings.showDownloadProgressDialog;
  document.getElementById('chk-show-complete').checked = !!settings.showDownloadCompleteDialog;
  document.getElementById('chk-sounds').checked = !!settings.soundsEnabled;
  document.getElementById('select-max-segments').value = String(settings.maxSegments || 8);
  document.getElementById('input-speed-limit').value = settings.speedLimitKBps || 0;

  // Directories
  document.getElementById('dir-general').value = settings.defaultDownloadDir || '';
  if (settings.categoryDirs) {
    document.getElementById('dir-compressed').value = settings.categoryDirs.compressed || '';
    document.getElementById('dir-documents').value = settings.categoryDirs.documents || '';
    document.getElementById('dir-music').value = settings.categoryDirs.music || '';
    document.getElementById('dir-programs').value = settings.categoryDirs.programs || '';
    document.getElementById('dir-video').value = settings.categoryDirs.video || '';
  }

  // Extensions
  document.getElementById('textarea-types').value = (settings.interceptExtensions || []).join(' ');

  // Browse buttons
  document.querySelectorAll('.btn-browse').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      const selected = await window.idmApi.selectDirectory();
      if (selected) {
        document.getElementById(targetId).value = selected;
      }
    });
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', async () => {
    const rawExtensions = document.getElementById('textarea-types').value.split(/\s+/).filter(Boolean).map(e => e.toUpperCase().replace(/^\./, ''));

    const updated = {
      autoStartDownload: document.getElementById('chk-auto-start').checked,
      showDownloadProgressDialog: document.getElementById('chk-show-progress').checked,
      showDownloadCompleteDialog: document.getElementById('chk-show-complete').checked,
      soundsEnabled: document.getElementById('chk-sounds').checked,
      maxSegments: parseInt(document.getElementById('select-max-segments').value, 10),
      speedLimitKBps: parseInt(document.getElementById('input-speed-limit').value, 10) || 0,
      defaultDownloadDir: document.getElementById('dir-general').value,
      categoryDirs: {
        general: document.getElementById('dir-general').value,
        compressed: document.getElementById('dir-compressed').value,
        documents: document.getElementById('dir-documents').value,
        music: document.getElementById('dir-music').value,
        programs: document.getElementById('dir-programs').value,
        video: document.getElementById('dir-video').value
      },
      interceptExtensions: rawExtensions
    };

    await window.idmApi.saveSettings(updated);
    window.idmApi.closeCurrentWindow();
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    window.idmApi.closeCurrentWindow();
  });
}

init();
