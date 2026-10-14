// IDM Integration Module - Content Script (Enhanced for YouTube & HTML5 Video)

(function() {
  const processedContainers = new WeakSet();

  function initSniffer() {
    chrome.storage.local.get({ videoGrabberEnabled: true }, (items) => {
      if (!items.videoGrabberEnabled) return;
      
      // Initial scan
      scanForPlayers();

      // Mutation observer for single-page apps (YouTube, TikTok, Twitter, etc.)
      const observer = new MutationObserver(() => {
        if (!chrome.runtime || !chrome.runtime.id) {
          observer.disconnect();
          return;
        }
        scanForPlayers();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // YouTube navigation listener
      window.addEventListener('yt-navigate-finish', () => {
        setTimeout(scanForPlayers, 1000);
      });
    });
  }

  function scanForPlayers() {
    // 1. YouTube Player
    if (window.location.hostname.includes('youtube.com')) {
      const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (ytPlayer && !ytPlayer.querySelector('.idm-yt-sniffer-btn')) {
        attachYouTubeSniffer(ytPlayer);
      }
    }

    // 2. Generic HTML5 Videos
    const videos = document.querySelectorAll('video');
    videos.forEach(attachGenericSniffer);
  }

  function attachYouTubeSniffer(player) {
    const btn = document.createElement('div');
    btn.className = 'idm-video-sniffer-btn idm-yt-sniffer-btn';
    btn.style.position = 'absolute';
    btn.style.top = '15px';
    btn.style.right = '20px';
    btn.style.zIndex = '999999999';

    btn.innerHTML = `
      <div class="idm-btn-main" style="display: flex; align-items: center;">
        <div class="idm-btn-icon">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="#ffffff">
            <circle cx="8" cy="8" r="7" fill="#047857"/>
            <path d="M8 4v5M5 7l3 3 3-3M4 12h8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <span class="idm-btn-label">Download this video</span>
      </div>
      <span class="idm-btn-arrow" style="padding: 2px 4px; margin-left: 4px; border-left: 1px solid rgba(255,255,255,0.3);">▼</span>
      <div class="idm-sniffer-dropdown" id="idm-yt-dropdown">
        <div class="idm-dropdown-item" data-format="1080">
          <span class="idm-item-quality">1080p Full HD</span>
          <span class="idm-item-type">MP4 (with Audio)</span>
        </div>
        <div class="idm-dropdown-item" data-format="720">
          <span class="idm-item-quality">720p HD</span>
          <span class="idm-item-type">MP4 (with Audio)</span>
        </div>
        <div class="idm-dropdown-item" data-format="480">
          <span class="idm-item-quality">480p SD</span>
          <span class="idm-item-type">MP4 (with Audio)</span>
        </div>
        <div class="idm-dropdown-item" data-format="360">
          <span class="idm-item-quality">360p Standard</span>
          <span class="idm-item-type">MP4 (with Audio)</span>
        </div>
        <div class="idm-dropdown-item" data-format="audio">
          <span class="idm-item-quality">Audio Only</span>
          <span class="idm-item-type">MP3</span>
        </div>
      </div>
    `;

    const dropdown = btn.querySelector('.idm-sniffer-dropdown');
    const mainAction = btn.querySelector('.idm-btn-main');
    const arrowAction = btn.querySelector('.idm-btn-arrow');

    // Click main part -> default 1080p download
    mainAction.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.remove('show');
      const pageTitle = document.title.replace('- YouTube', '').trim();
      dispatchDownloadToIdm({
        url: window.location.href,
        fileName: `${pageTitle}_(1080p).mp4`,
        isYouTube: true,
        format: '1080'
      });
    });

    // Click arrow -> toggle dropdown
    arrowAction.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.toggle('show');
    });

    dropdown.querySelectorAll('.idm-dropdown-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const format = item.getAttribute('data-format');
        dropdown.classList.remove('show');

        const pageTitle = document.title.replace('- YouTube', '').trim();
        const ext = format === 'audio' ? 'mp3' : 'mp4';
        const label = format === 'audio' ? 'Audio' : `${format}p`;
        dispatchDownloadToIdm({
          url: window.location.href,
          fileName: `${pageTitle}_(${label}).${ext}`,
          isYouTube: true,
          format: format
        });
      });
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    player.appendChild(btn);
  }

  function attachGenericSniffer(video) {
    if (window.location.hostname.includes('youtube.com')) return;
    if (processedContainers.has(video)) return;
    processedContainers.add(video);

    const parent = video.parentElement;
    if (!parent || parent.querySelector('.idm-video-sniffer-btn')) return;

    const style = window.getComputedStyle(parent);
    if (style.position === 'static') {
      parent.style.position = 'relative';
    }

    const btn = document.createElement('div');
    btn.className = 'idm-video-sniffer-btn';
    btn.innerHTML = `
      <div class="idm-btn-icon">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="#ffffff">
          <circle cx="8" cy="8" r="7" fill="#047857"/>
          <path d="M8 4v5M5 7l3 3 3-3M4 12h8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        </svg>
      </div>
      <span>Download this video</span>
      <span class="idm-btn-arrow">▼</span>
      <div class="idm-sniffer-dropdown"></div>
    `;

    const dropdown = btn.querySelector('.idm-sniffer-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const sources = gatherVideoSources(video);
      const mainSrc = video.currentSrc || video.src;

      if (sources.length <= 1) {
        const targetUrl = (sources[0] && sources[0].url) || mainSrc || window.location.href;
        downloadSource(targetUrl, 'video');
        return;
      }

      dropdown.innerHTML = sources.map((s, idx) => `
        <div class="idm-dropdown-item" data-idx="${idx}">
          <span class="idm-item-quality">${s.quality}</span>
          <span class="idm-item-type">${s.type}</span>
        </div>
      `).join('');

      dropdown.querySelectorAll('.idm-dropdown-item').forEach(item => {
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = parseInt(item.getAttribute('data-idx'), 10);
          const chosen = sources[idx];
          if (chosen) {
            downloadSource(chosen.url, chosen.quality);
            dropdown.classList.remove('show');
          }
        });
      });

      dropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    parent.appendChild(btn);
  }

  function gatherVideoSources(video) {
    const list = [];
    const mainSrc = video.currentSrc || video.src;

    if (mainSrc && (mainSrc.startsWith('http://') || mainSrc.startsWith('https://'))) {
      list.push({
        url: mainSrc,
        quality: video.videoHeight ? `${video.videoHeight}p` : 'Default Quality',
        type: 'MP4 / WebM'
      });
    }

    const sourceTags = video.querySelectorAll('source');
    sourceTags.forEach(st => {
      const src = st.src;
      if (src && (src.startsWith('http://') || src.startsWith('https://')) && !list.some(s => s.url === src)) {
        list.push({
          url: src,
          quality: st.getAttribute('size') ? `${st.getAttribute('size')}p` : 'Alternate Quality',
          type: st.type || 'Media'
        });
      }
    });

    return list;
  }

  function downloadSource(url, qualityLabel) {
    let cleanTitle = document.title || 'video';
    cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, '').trim();
    dispatchDownloadToIdm({
      url,
      fileName: `${cleanTitle}.mp4`
    });
  }

  function showIdmInPageNotification(title, message) {
    let toast = document.getElementById('idm-inpage-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'idm-inpage-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div class="idm-toast-title">Internet Download Manager</div>
      <div class="idm-toast-msg">${title}: <strong>${message || 'Connecting to IDM...'}</strong></div>
    `;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function dispatchDownloadToIdm(payload) {
    showIdmInPageNotification('⬇ Download Started', payload.fileName || 'Video');

    if (chrome && chrome.runtime && chrome.runtime.id) {
      try {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_MEDIA',
          ...payload
        }, (res) => {
          if (chrome.runtime.lastError) {
            fallbackDirectFetch(payload);
          }
        });
        return;
      } catch (e) {
        // Fallback below
      }
    }
    fallbackDirectFetch(payload);
  }

  function fallbackDirectFetch(payload) {
    fetch('http://127.0.0.1:9462/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: payload.url,
        fileName: payload.fileName,
        referer: window.location.href,
        isYouTube: payload.isYouTube || false,
        format: payload.format || '1080',
        autoStart: true,
        showDialog: true
      })
    }).catch(err => {
      console.warn('IDM Direct Fetch:', err);
    });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSniffer);
  } else {
    initSniffer();
  }
})();
