// IDM Integration Module - Background Service Worker

const DEFAULT_EXTENSIONS = [
  '3GP', '7Z', 'AAC', 'ACE', 'AIF', 'APK', 'ARJ', 'ASF', 'AVI', 'BIN',
  'BZ2', 'DMG', 'DOC', 'DOCX', 'EXE', 'FLV', 'GZ', 'GZIP', 'IMG', 'ISO',
  'LZH', 'M4A', 'M4V', 'MKV', 'MOV', 'MP3', 'MP4', 'MPA', 'MPE', 'MPEG',
  'MPG', 'MSI', 'MSU', 'OGG', 'OGV', 'PDF', 'PLJ', 'PPS', 'PPT', 'PPTX',
  'QT', 'RA', 'RAR', 'RM', 'RMVB', 'SEA', 'SIT', 'SITX', 'TAR', 'TIF',
  'TIFF', 'WAV', 'WMA', 'WMV', 'XLS', 'XLSX', 'ZIP'
];

let idmServerPort = 9462;
let isConnected = false;

// Initialize context menus and settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({
    enabled: true,
    interceptDownloads: true,
    videoGrabberEnabled: true,
    interceptExtensions: DEFAULT_EXTENSIONS
  }, (items) => {
    chrome.storage.local.set(items);
  });

  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'idm-download-link',
      title: 'Download with Electron by Haris',
      contexts: ['link', 'image', 'video', 'audio', 'selection']
    });

    chrome.contextMenus.create({
      id: 'idm-download-all',
      title: 'Download all links with Electron by Haris',
      contexts: ['page']
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'idm-download-link') {
    let downloadUrl = info.linkUrl || info.srcUrl || info.selectionText;
    if (downloadUrl) {
      downloadUrl = downloadUrl.trim();
      if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
        if (downloadUrl.startsWith('www.')) downloadUrl = 'http://' + downloadUrl;
      }
      await sendToIdm({
        url: downloadUrl,
        referer: tab ? tab.url : '',
        pageTitle: tab ? tab.title : ''
      });
    }
  } else if (info.menuItemId === 'idm-download-all') {
    if (tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageLinks
      }, async (results) => {
        if (results && results[0] && results[0].result) {
          const links = results[0].result;
          if (links.length > 0) {
            await sendBatchToIdm(links, tab.url);
          }
        }
      });
    }
  }
});

function extractPageLinks() {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const set = new Set();
  const list = [];

  anchors.forEach(a => {
    const href = a.href;
    if (href && (href.startsWith('http://') || href.startsWith('https://')) && !set.has(href)) {
      set.add(href);
      list.push({
        url: href,
        fileName: (a.textContent || '').trim().slice(0, 100) || undefined
      });
    }
  });

  return list;
}

// Intercept browser downloads
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const settings = await chrome.storage.local.get({
    enabled: true,
    interceptDownloads: true,
    interceptExtensions: DEFAULT_EXTENSIONS
  });

  if (!settings.enabled || !settings.interceptDownloads) {
    return;
  }

  const url = downloadItem.finalUrl || downloadItem.url;
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return;
  }

  // Check if URL ends with intercepted extension or matches mime
  const fileName = downloadItem.filename ? downloadItem.filename.split(/[/\\]/).pop() : '';
  const ext = fileName ? fileName.split('.').pop().toUpperCase() : getUrlExt(url);

  const shouldIntercept = !ext || settings.interceptExtensions.includes(ext);

  if (shouldIntercept) {
    // Cancel the chrome download and erase it from history
    try {
      chrome.downloads.cancel(downloadItem.id, () => {
        chrome.downloads.erase({ id: downloadItem.id });
      });
    } catch (e) {}

    // Forward to IDM
    await sendToIdm({
      url,
      fileName,
      referer: downloadItem.referrer || ''
    });
  }
});

function getUrlExt(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) {
      return last.split('.').pop().toUpperCase();
    }
  } catch {}
  return '';
}

// Get cookies for a given URL
async function getCookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

// Send single download to IDM Engine
async function sendToIdm({ url, fileName, referer = '', pageTitle = '', isYouTube = false, format = '1080', autoStart = true }) {
  const cookies = await getCookiesForUrl(url);

  try {
    const response = await fetch(`http://127.0.0.1:${idmServerPort}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        fileName,
        referer,
        cookies,
        userAgent: navigator.userAgent,
        pageTitle,
        isYouTube,
        format,
        autoStart,
        showDialog: true
      })
    });

    if (response.ok) {
      const data = await response.json();
      showNotification('Electron by Haris', fileName || url);
      return data;
    }
  } catch (err) {
    console.warn('[Electron by Haris Extension] Cannot reach desktop application:', err);
    showNotification('Electron by Haris Offline', 'Please launch Electron by Haris to capture downloads.');
    return null;
  }
}

// Send batch downloads to IDM Engine
async function sendBatchToIdm(items, referer) {
  try {
    const response = await fetch(`http://127.0.0.1:${idmServerPort}/batch-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({ ...item, referer })),
        autoStart: false
      })
    });

    if (response.ok) {
      showNotification('Electron by Haris Batch', `Captured ${items.length} links into Electron by Haris.`);
    }
  } catch (err) {
    showNotification('Electron by Haris Offline', 'Please start desktop application.');
  }
}

function showNotification(title, message) {
  // Set badge
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
}

// Listen to messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_MEDIA') {
    const tabUrl = sender.tab ? sender.tab.url : '';
    sendToIdm({
      url: message.url,
      fileName: message.fileName,
      referer: tabUrl,
      pageTitle: sender.tab ? sender.tab.title : '',
      isYouTube: message.isYouTube,
      format: message.format,
      autoStart: message.autoStart !== undefined ? message.autoStart : true
    }).then(res => {
      sendResponse({
        success: !!res,
        taskId: res ? res.taskId : null,
        meta: res ? res.meta : null
      });
    });
    return true; // async response
  }

  if (message.type === 'CHECK_STATUS') {
    fetch(`http://127.0.0.1:${idmServerPort}/status`)
      .then(res => res.json())
      .then(data => {
        isConnected = true;
        sendResponse({ connected: true, data });
      })
      .catch(() => {
        isConnected = false;
        sendResponse({ connected: false });
      });
    return true;
  }

  if (message.type === 'FOCUS_APP') {
    fetch(`http://127.0.0.1:${idmServerPort}/focus`, { method: 'POST' })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'SHOW_TASK_DIALOG') {
    fetch(`http://127.0.0.1:${idmServerPort}/downloads/${message.taskId}/show`, { method: 'POST' })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// Periodic ping
setInterval(() => {
  fetch(`http://127.0.0.1:${idmServerPort}/health`)
    .then(r => {
      isConnected = r.ok;
      chrome.action.setTitle({
        title: isConnected ? 'Electron by Haris: Connected (Running)' : 'Electron by Haris: Disconnected'
      });
    })
    .catch(() => {
      isConnected = false;
      chrome.action.setTitle({ title: 'Electron by Haris: Disconnected (Launch app)' });
    });
}, 5000);
