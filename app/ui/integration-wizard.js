document.addEventListener('DOMContentLoaded', async () => {
  const browsersList = document.getElementById('browsers-list');
  const pathInput = document.getElementById('extension-path-input');
  const btnCopyPath = document.getElementById('btn-copy-path');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnTestConn = document.getElementById('btn-test-connection');
  const testFeedback = document.getElementById('test-feedback');
  const btnFinish = document.getElementById('btn-finish');
  const chkDontShow = document.getElementById('chk-dont-show-again');
  const chkAutoStart = document.getElementById('chk-auto-start-windows');

  // 1. Get Extension folder path
  let extPath = '';
  try {
    extPath = await window.idmApi.getExtensionPath();
    pathInput.value = extPath;
  } catch (e) {
    pathInput.value = 'c:\\...\\extension';
  }

  // 2. Load detected browsers
  try {
    const browsers = await window.idmApi.detectBrowsers();
    renderBrowsers(browsers);
  } catch (e) {
    console.error('Error detecting browsers:', e);
  }

  function renderBrowsers(browsers) {
    browsersList.innerHTML = '';
    browsers.forEach(b => {
      const card = document.createElement('div');
      card.className = 'browser-card';
      card.innerHTML = `
        <div class="browser-info">
          <div class="browser-icon">${b.icon}</div>
          <div>
            <div class="browser-name">${b.name}</div>
            <div class="browser-status ${b.installed ? '' : 'not-installed'}">
              ${b.installed ? '● Installed & Ready' : '○ Not detected'}
            </div>
          </div>
        </div>
        <button class="btn-integrate ${b.installed ? '' : 'disabled'}" data-id="${b.id}" ${b.installed ? '' : 'disabled'}>
          ${b.installed ? 'Integrate' : 'Not Found'}
        </button>
      `;

      const btn = card.querySelector('.btn-integrate');
      if (b.installed) {
        btn.addEventListener('click', async () => {
          btn.textContent = 'Opening...';
          await window.idmApi.integrateBrowser(b.id);
          setTimeout(() => {
            btn.textContent = '✓ Opened';
          }, 800);
        });
      }

      browsersList.appendChild(card);
    });
  }

  // Copy Path action
  btnCopyPath.addEventListener('click', () => {
    if (extPath) {
      navigator.clipboard.writeText(extPath);
      btnCopyPath.textContent = '✓ Copied!';
      setTimeout(() => btnCopyPath.textContent = '📋 Copy', 2000);
    }
  });

  // Open Folder action
  btnOpenFolder.addEventListener('click', () => {
    window.idmApi.openExtensionFolder();
  });

  // Test Extension Bridge
  btnTestConn.addEventListener('click', async () => {
    testFeedback.textContent = 'Testing bridge...';
    testFeedback.className = 'test-feedback';
    try {
      const res = await fetch('http://127.0.0.1:9462/status');
      if (res.ok) {
        const data = await res.json();
        testFeedback.textContent = `✓ Bridge Online (${data.name})`;
        testFeedback.className = 'test-feedback success';
      } else {
        testFeedback.textContent = '⚠ Bridge responded with error';
        testFeedback.className = 'test-feedback warn';
      }
    } catch (e) {
      testFeedback.textContent = '✕ Bridge Offline (Restart app)';
      testFeedback.className = 'test-feedback warn';
    }
  });

  // Finish Setup
  btnFinish.addEventListener('click', async () => {
    try {
      const settings = await window.idmApi.getSettings();
      settings.firstRunWizardShown = chkDontShow.checked;
      settings.autoStartWithWindows = chkAutoStart.checked;
      await window.idmApi.saveSettings(settings);

      if (chkAutoStart.checked) {
        await window.idmApi.setWindowsAutoStart(true);
      }
    } catch (e) {
      console.warn('Error saving setup preferences:', e);
    }

    window.idmApi.closeCurrentWindow();
  });
});
