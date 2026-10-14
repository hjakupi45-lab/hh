// Add URL dialog controller

async function init() {
  const urlInput = document.getElementById('input-url');
  const filenameInput = document.getElementById('input-filename');
  const dirInput = document.getElementById('input-dir');
  const catSelect = document.getElementById('select-category');

  // Load default directory
  const settings = await window.idmApi.getSettings();
  dirInput.value = settings.defaultDownloadDir;

  // Auto-read clipboard if it's a URL
  try {
    const clipText = await navigator.clipboard.readText();
    if (clipText && (clipText.startsWith('http://') || clipText.startsWith('https://'))) {
      urlInput.value = clipText.trim();
      detectFileNameAndCategory(clipText.trim());
    }
  } catch (e) {
    // Clipboard permission not granted or empty
  }

  urlInput.addEventListener('input', () => {
    detectFileNameAndCategory(urlInput.value.trim());
  });

  document.getElementById('btn-browse').addEventListener('click', async () => {
    const selected = await window.idmApi.selectDirectory();
    if (selected) {
      dirInput.value = selected;
    }
  });

  catSelect.addEventListener('change', () => {
    const cat = catSelect.value;
    if (settings.categoryDirs && settings.categoryDirs[cat]) {
      dirInput.value = settings.categoryDirs[cat];
    }
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    submitDownload(true);
  });

  document.getElementById('btn-later').addEventListener('click', () => {
    submitDownload(false);
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    window.idmApi.closeCurrentWindow();
  });

  function detectFileNameAndCategory(url) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/');
      const last = parts[parts.length - 1];
      if (last && last.trim()) {
        const decoded = decodeURIComponent(last);
        filenameInput.value = decoded;

        // Auto-select category
        const ext = decoded.split('.').pop().toLowerCase();
        const catMap = {
          compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'iso'],
          documents: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'],
          music: ['mp3', 'wav', 'flac', 'aac'],
          programs: ['exe', 'msi', 'apk'],
          video: ['mp4', 'mkv', 'avi', 'mov', 'webm']
        };

        for (const [c, exts] of Object.entries(catMap)) {
          if (exts.includes(ext)) {
            catSelect.value = c;
            if (settings.categoryDirs && settings.categoryDirs[c]) {
              dirInput.value = settings.categoryDirs[c];
            }
            break;
          }
        }
      }
    } catch {}
  }

  function submitDownload(autoStart) {
    const url = urlInput.value.trim();
    if (!url) {
      alert('Please enter a valid URL.');
      return;
    }

    window.idmApi.addNewDownload({
      url,
      fileName: filenameInput.value.trim() || undefined,
      directory: dirInput.value.trim(),
      category: catSelect.value,
      autoStart
    });

    window.idmApi.closeCurrentWindow();
  }
}

init();
