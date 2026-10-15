// IDM Extension Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  const indicator = document.getElementById('status-indicator');
  const title = document.getElementById('status-title');
  const desc = document.getElementById('status-desc');

  const chkIntercept = document.getElementById('chk-intercept');
  const chkSniffer = document.getElementById('chk-sniffer');

  // Load preferences
  chrome.storage.local.get({
    interceptDownloads: true,
    videoGrabberEnabled: true
  }, (items) => {
    chkIntercept.checked = items.interceptDownloads;
    chkSniffer.checked = items.videoGrabberEnabled;
  });

  chkIntercept.addEventListener('change', () => {
    chrome.storage.local.set({ interceptDownloads: chkIntercept.checked });
  });

  chkSniffer.addEventListener('change', () => {
    chrome.storage.local.set({ videoGrabberEnabled: chkSniffer.checked });
  });

  // Check connection status
  async function checkConnection() {
    try {
      const res = await fetch('http://127.0.0.1:9462/status');
      if (res.ok) {
        const data = await res.json();
        indicator.className = 'status-indicator online';
        title.textContent = 'Connected to Electron by Haris';
        title.style.color = '#15803d';
        desc.textContent = `${data.activeDownloads || 0} active transfers (${data.version || 'v6.42'})`;
        return;
      }
    } catch (e) {}

    indicator.className = 'status-indicator offline';
    title.textContent = 'Electron by Haris Offline';
    title.style.color = '#b91c1c';
    desc.textContent = 'Launch Electron by Haris Desktop';
  }

  checkConnection();

  // Action: Download all links on current tab
  document.getElementById('btn-download-page').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          const set = new Set();
          const list = [];
          anchors.forEach(a => {
            const href = a.href;
            if (href && (href.startsWith('http://') || href.startsWith('https://')) && !set.has(href)) {
              set.add(href);
              list.push({ url: href, fileName: (a.textContent || '').trim().slice(0, 100) || undefined });
            }
          });
          return list;
        }
      }, async (results) => {
        if (results && results[0] && results[0].result) {
          const links = results[0].result;
          if (links.length > 0) {
            fetch('http://127.0.0.1:9462/batch-download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: links.map(l => ({ ...l, referer: tab.url })),
                autoStart: false
              })
            }).then(() => {
              window.close();
            }).catch(() => {
              alert('Could not connect to Electron by Haris. Is it running?');
            });
          } else {
            alert('No downloadable links found on this page.');
          }
        }
      });
    }
  });

  // Action: Open Electron by Haris Desktop
  document.getElementById('btn-open-desktop').addEventListener('click', async () => {
    try {
      await fetch('http://127.0.0.1:9462/focus', { method: 'POST' });
      window.close();
    } catch (e) {
      alert('Electron by Haris Desktop is not running. Please start it using "start-electron.bat"!');
    }
  });
});
