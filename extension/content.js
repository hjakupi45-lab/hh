// Electron by Haris - In-Page Video Sniffer & Modern Download Dialog

(function() {
  const processedContainers = new WeakSet();
  let activeTaskId = null;
  let progressPollTimer = null;
  let currentDownloadPayload = null;

  function initSniffer() {
    chrome.storage.local.get({ videoGrabberEnabled: true }, (items) => {
      if (!items.videoGrabberEnabled) return;
      
      // Inject Modal & Dock markup if not already present
      ensureModalElements();

      // Initial scan
      scanForPlayers();
      attachLinkInterception();

      // Mutation observer for single-page apps (YouTube, TikTok, Twitter, etc.)
      const observer = new MutationObserver(() => {
        if (!chrome.runtime || !chrome.runtime.id) {
          observer.disconnect();
          return;
        }
        scanForPlayers();
        attachLinkInterception();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // YouTube navigation listener
      window.addEventListener('yt-navigate-finish', () => {
        setTimeout(() => {
          scanForPlayers();
          attachLinkInterception();
        }, 1000);
      });
    });
  }

  function resolveSocialMediaTarget(video) {
    const host = window.location.hostname.toLowerCase();

    // 1. YouTube & YouTube Shorts
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const shortsContainer = video.closest('ytd-reel-video-renderer') || video.closest('ytd-shorts');
      if (shortsContainer) {
        const link = shortsContainer.querySelector('a[href*="/shorts/"]');
        if (link && link.href) {
          return { url: link.href, title: (document.title || 'YouTube_Shorts').replace('- YouTube', '').trim(), isSocial: true, platform: 'YouTube Shorts' };
        }
      }
      return { url: window.location.href, title: (document.title || 'YouTube_Video').replace('- YouTube', '').trim(), isSocial: true, platform: 'YouTube' };
    }

    // 2. Facebook (Reels, Watch, Feed)
    if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com')) {
      const feedUnit = video.closest('[role="feed"] > div') || 
                       video.closest('[data-pagelet*="FeedUnit"]') || 
                       video.closest('div[data-video-id]') || 
                       video.closest('div[role="article"]') ||
                       video.closest('div[data-pagelet*="Reel"]') ||
                       video.closest('div[data-pagelet*="Watch"]');
      if (feedUnit) {
        const link = feedUnit.querySelector('a[href*="/videos/"]') || 
                     feedUnit.querySelector('a[href*="/reel/"]') || 
                     feedUnit.querySelector('a[href*="/watch"]') ||
                     feedUnit.querySelector('a[href*="facebook.com"]');
        if (link && link.href) {
          return { url: link.href, title: 'Facebook_Video_' + Date.now(), isSocial: true, platform: 'Facebook' };
        }
      }
      return { url: window.location.href, title: (document.title || 'Facebook_Video').replace('| Facebook', '').trim(), isSocial: true, platform: 'Facebook' };
    }

    // 3. Instagram (Reels & Posts)
    if (host.includes('instagram.com')) {
      const article = video.closest('article') || video.closest('div[role="dialog"]') || video.closest('div[data-blade]');
      if (article) {
        const link = article.querySelector('a[href*="/reel/"]') || article.querySelector('a[href*="/p/"]');
        if (link && link.href) {
          return { url: link.href, title: 'Instagram_Video_' + Date.now(), isSocial: true, platform: 'Instagram' };
        }
      }
      return { url: window.location.href, title: (document.title || 'Instagram_Video').replace('- Instagram', '').trim(), isSocial: true, platform: 'Instagram' };
    }

    // 4. TikTok
    if (host.includes('tiktok.com')) {
      const container = video.closest('[data-e2e="feed-video"]') || video.closest('[data-e2e="player"]');
      if (container) {
        const link = container.querySelector('a[href*="/video/"]');
        if (link && link.href) {
          return { url: link.href, title: 'TikTok_Video_' + Date.now(), isSocial: true, platform: 'TikTok' };
        }
      }
      return { url: window.location.href, title: (document.title || 'TikTok_Video').replace('| TikTok', '').trim(), isSocial: true, platform: 'TikTok' };
    }

    // 5. Twitter / X
    if (host.includes('twitter.com') || host.includes('x.com')) {
      const tweet = video.closest('article[data-testid="tweet"]') || video.closest('div[data-testid="videoComponent"]');
      if (tweet) {
        const link = tweet.querySelector('a[href*="/status/"]');
        if (link && link.href) {
          return { url: link.href, title: 'Twitter_Video_' + Date.now(), isSocial: true, platform: 'Twitter/X' };
        }
      }
      return { url: window.location.href, title: (document.title || 'Twitter_Video').replace('/ X', '').replace('- Twitter', '').trim(), isSocial: true, platform: 'Twitter/X' };
    }

    // 6. Reddit
    if (host.includes('reddit.com')) {
      const post = video.closest('shredder-post') || video.closest('[data-testid="post-container"]') || video.closest('article');
      if (post) {
        const link = post.querySelector('a[data-testid="post-title"]') || post.querySelector('a[href*="/comments/"]');
        if (link && link.href) {
          return { url: link.href, title: 'Reddit_Video_' + Date.now(), isSocial: true, platform: 'Reddit' };
        }
      }
      return { url: window.location.href, title: (document.title || 'Reddit_Video').replace('- Reddit', '').trim(), isSocial: true, platform: 'Reddit' };
    }

    // Generic HTML5 video
    const src = video.currentSrc || video.src;
    return { url: src || window.location.href, title: (document.title || 'video').trim(), isSocial: false, platform: 'HTML5' };
  }

  function scanForPlayers() {
    // 1. YouTube Main Player
    if (window.location.hostname.includes('youtube.com')) {
      const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (ytPlayer && !ytPlayer.querySelector('.idm-yt-sniffer-btn')) {
        attachYouTubeSniffer(ytPlayer);
      }
    }

    // 2. All HTML5 Videos (Facebook, Instagram, TikTok, Twitter/X, Reddit, Shorts, etc.)
    const videos = document.querySelectorAll('video');
    videos.forEach(attachUniversalSniffer);
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
        <span class="idm-btn-label">Download with Electron by Haris</span>
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

    mainAction.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.remove('show');
      const pageTitle = (document.title || 'video').replace('- YouTube', '').trim();
      openInBrowserDownloadDialog({
        url: window.location.href,
        fileName: `${pageTitle}_(1080p).mp4`,
        isYouTube: true,
        isSocial: true,
        format: '1080',
        category: 'video'
      });
    });

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

        const pageTitle = (document.title || 'video').replace('- YouTube', '').trim();
        const ext = format === 'audio' ? 'mp3' : 'mp4';
        const label = format === 'audio' ? 'Audio' : `${format}p`;
        openInBrowserDownloadDialog({
          url: window.location.href,
          fileName: `${pageTitle}_(${label}).${ext}`,
          isYouTube: true,
          isSocial: true,
          format: format,
          category: format === 'audio' ? 'music' : 'video'
        });
      });
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    player.appendChild(btn);
  }

  function attachUniversalSniffer(video) {
    if (window.location.hostname.includes('youtube.com') && !video.closest('ytd-reel-video-renderer')) return;
    if (processedContainers.has(video)) return;
    processedContainers.add(video);

    // Find best relative host container
    let container = video.parentElement;
    if (!container) return;

    // Skip tiny icons/previews
    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 120 && rect.height > 0 && rect.height < 120) return;

    // Check if button already exists in container or video parent
    if (container.querySelector('.idm-video-sniffer-btn')) return;

    const style = window.getComputedStyle(container);
    if (style.position === 'static') {
      container.style.position = 'relative';
    }

    const info = resolveSocialMediaTarget(video);

    const btn = document.createElement('div');
    btn.className = 'idm-video-sniffer-btn';
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.right = '10px';
    btn.style.zIndex = '2147483647';

    btn.innerHTML = `
      <div class="idm-btn-main" style="display: flex; align-items: center;">
        <div class="idm-btn-icon">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="#ffffff">
            <circle cx="8" cy="8" r="7" fill="#047857"/>
            <path d="M8 4v5M5 7l3 3 3-3M4 12h8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <span class="idm-btn-label">Download with Electron by Haris</span>
      </div>
      <span class="idm-btn-arrow" style="padding: 2px 4px; margin-left: 4px; border-left: 1px solid rgba(255,255,255,0.3);">▼</span>
      <div class="idm-sniffer-dropdown">
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

    mainAction.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.remove('show');
      const target = resolveSocialMediaTarget(video);
      let cleanTitle = (target.title || document.title || 'video').replace(/[\\/:*?"<>|]/g, '').trim();
      openInBrowserDownloadDialog({
        url: target.url,
        fileName: `${cleanTitle}_(1080p).mp4`,
        isYouTube: target.isSocial,
        isSocial: target.isSocial,
        format: '1080',
        category: 'video'
      });
    });

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

        const target = resolveSocialMediaTarget(video);
        let cleanTitle = (target.title || document.title || 'video').replace(/[\\/:*?"<>|]/g, '').trim();
        const ext = format === 'audio' ? 'mp3' : 'mp4';
        const label = format === 'audio' ? 'Audio' : `${format}p`;
        openInBrowserDownloadDialog({
          url: target.url,
          fileName: `${cleanTitle}_(${label}).${ext}`,
          isYouTube: target.isSocial,
          isSocial: target.isSocial,
          format: format,
          category: format === 'audio' ? 'music' : 'video'
        });
      });
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    container.appendChild(btn);
  }

  // Intercept file download links (test pages, direct download buttons)
  function attachLinkInterception() {
    const downloadExtensions = ['.zip', '.rar', '.7z', '.exe', '.msi', '.pdf', '.mp3', '.mp4', '.mkv', '.iso'];
    const links = document.querySelectorAll('a[href]:not([data-ebh-hooked])');
    links.forEach(a => {
      a.setAttribute('data-ebh-hooked', '1');
      const href = a.href || '';
      const isDownloadLink = downloadExtensions.some(ext => href.toLowerCase().includes(ext)) || a.hasAttribute('download');
      
      if (isDownloadLink) {
        a.addEventListener('click', (e) => {
          // If user holds Ctrl or Alt, let normal browser download happen
          if (e.ctrlKey || e.altKey) return;

          e.preventDefault();
          e.stopPropagation();

          let suggestedName = a.getAttribute('download') || (a.textContent || '').trim();
          if (!suggestedName || suggestedName.length > 80) {
            try {
              suggestedName = decodeURIComponent(new URL(href).pathname.split('/').pop());
            } catch {}
          }
          if (!suggestedName) suggestedName = 'download_file';

          // Auto-detect category
          const ext = suggestedName.split('.').pop().toLowerCase();
          let cat = 'general';
          if (['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext)) cat = 'video';
          else if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) cat = 'music';
          else if (['zip', 'rar', '7z', 'iso', 'tar', 'gz'].includes(ext)) cat = 'compressed';
          else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext)) cat = 'documents';
          else if (['exe', 'msi', 'apk'].includes(ext)) cat = 'programs';

          openInBrowserDownloadDialog({
            url: href,
            fileName: suggestedName,
            category: cat
          });
        });
      }
    });
  }

  // -------------------------------------------------------------
  // In-Page Interactive Download Modal UI
  // -------------------------------------------------------------

  function ensureModalElements() {
    if (document.getElementById('ebh-modal-backdrop')) return;

    const modalHtml = `
      <div id="ebh-modal-backdrop">
        <div id="ebh-download-dialog">
          <!-- Header -->
          <div class="ebh-dialog-header">
            <div class="ebh-brand">
              <div class="ebh-logo-icon">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 2v9M4 7l4 4 4-4M3 13h10"/>
                </svg>
              </div>
              <div>
                <div class="ebh-brand-title">Electron by Haris</div>
                <div class="ebh-brand-sub" id="ebh-engine-status">● Desktop Bridge Active (Port 9462)</div>
              </div>
            </div>
            <button class="ebh-close-btn" id="ebh-btn-close" title="Close dialog">✕</button>
          </div>

          <!-- 1. Setup / Confirmation View -->
          <div id="ebh-view-setup" class="ebh-view">
            <div class="ebh-field-group">
              <label class="ebh-label">File Name (Editable):</label>
              <input type="text" id="ebh-input-filename" class="ebh-input" spellcheck="false" placeholder="Enter file name" />
            </div>

            <div class="ebh-field-group" id="ebh-group-format" style="display: none;">
              <label class="ebh-label">Select Resolution / Quality:</label>
              <div class="ebh-format-pills" id="ebh-format-options">
                <div class="ebh-pill active" data-fmt="1080">⭐ 1080p HD (MP4)</div>
                <div class="ebh-pill" data-fmt="720">720p HD (MP4)</div>
                <div class="ebh-pill" data-fmt="480">480p SD</div>
                <div class="ebh-pill" data-fmt="360">360p</div>
                <div class="ebh-pill" data-fmt="audio">🎵 MP3 Audio</div>
              </div>
            </div>

            <div class="ebh-field-row">
              <div class="ebh-field-group" style="flex: 1;">
                <label class="ebh-label">Category:</label>
                <select id="ebh-select-category" class="ebh-select">
                  <option value="video">Video</option>
                  <option value="music">Music</option>
                  <option value="compressed">Compressed</option>
                  <option value="documents">Documents</option>
                  <option value="programs">Programs</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div class="ebh-field-group" style="flex: 1;">
                <label class="ebh-label">Save Location:</label>
                <input type="text" id="ebh-input-folder" class="ebh-input" readonly value="Downloads\..." />
              </div>
            </div>

            <div class="ebh-field-group">
              <label class="ebh-label">Target URL:</label>
              <div id="ebh-display-url" class="ebh-url-text">-</div>
            </div>

            <div class="ebh-footer-actions">
              <button class="ebh-btn ebh-btn-secondary" id="ebh-btn-cancel">Cancel</button>
              <button class="ebh-btn ebh-btn-outline" id="ebh-btn-open-app" title="Focus native Electron app">
                💻 Desktop App
              </button>
              <button class="ebh-btn ebh-btn-primary" id="ebh-btn-start">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 2v9M4 7l4 4 4-4M3 13h10"/>
                </svg>
                Start Download
              </button>
            </div>
          </div>

          <!-- 2. Active Download Progress View -->
          <div id="ebh-view-progress" class="ebh-view" style="display: none;">
            <div class="ebh-progress-card">
              <div class="ebh-progress-meta">
                <span id="ebh-prog-filename" class="ebh-prog-name">Connecting...</span>
                <span id="ebh-prog-percent" class="ebh-prog-num">0%</span>
              </div>

              <!-- Animated Glowing Progress Bar -->
              <div class="ebh-progress-track">
                <div id="ebh-progress-bar" class="ebh-progress-fill" style="width: 0%;"></div>
              </div>

              <!-- Live Stats Grid -->
              <div class="ebh-stats-grid">
                <div class="ebh-stat-item">
                  <span class="ebh-stat-label">Transfer Speed</span>
                  <span id="ebh-stat-speed" class="ebh-stat-val">0 KB/s</span>
                </div>
                <div class="ebh-stat-item">
                  <span class="ebh-stat-label">Downloaded</span>
                  <span id="ebh-stat-downloaded" class="ebh-stat-val">0 B (0%)</span>
                </div>
                <div class="ebh-stat-item">
                  <span class="ebh-stat-label">Time Remaining</span>
                  <span id="ebh-stat-eta" class="ebh-stat-val">Estimating...</span>
                </div>
                <div class="ebh-stat-item">
                  <span class="ebh-stat-label">Status</span>
                  <span id="ebh-stat-status" class="ebh-stat-val ebh-status-active">Downloading...</span>
                </div>
              </div>
            </div>

            <div class="ebh-footer-actions">
              <button class="ebh-btn ebh-btn-secondary" id="ebh-btn-pause-resume">⏸ Pause</button>
              <button class="ebh-btn ebh-btn-outline" id="ebh-btn-show-desktop" title="Open native segmented progress window">
                💻 Segment Visualizer
              </button>
              <button class="ebh-btn ebh-btn-secondary" id="ebh-btn-minimize" title="Keep downloading in background widget">
                Dock Widget ↘
              </button>
            </div>
          </div>

          <!-- 3. Complete View -->
          <div id="ebh-view-complete" class="ebh-view" style="display: none;">
            <div class="ebh-complete-box">
              <div class="ebh-check-icon">✓</div>
              <div class="ebh-complete-title">Download Completed!</div>
              <div id="ebh-complete-desc" class="ebh-complete-desc">File successfully saved with high fidelity audio and video.</div>
            </div>
            <div class="ebh-footer-actions">
              <button class="ebh-btn ebh-btn-outline" id="ebh-btn-open-folder">📂 Open in Desktop</button>
              <button class="ebh-btn ebh-btn-primary" id="ebh-btn-done">Done</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Floating Minimized Dock Widget -->
      <div id="ebh-dock-pill" class="ebh-dock-pill" title="Click to expand Electron by Haris download dialog">
        <span class="ebh-dock-icon">⚡</span>
        <span id="ebh-dock-text">Electron by Haris: 0%</span>
        <span class="ebh-dock-expand">Expand ↗</span>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'ebh-inpage-container';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);

    setupModalInteractions();
  }

  function setupModalInteractions() {
    const backdrop = document.getElementById('ebh-modal-backdrop');
    const btnClose = document.getElementById('ebh-btn-close');
    const btnCancel = document.getElementById('ebh-btn-cancel');
    const btnStart = document.getElementById('ebh-btn-start');
    const btnOpenApp = document.getElementById('ebh-btn-open-app');
    const btnShowDesktop = document.getElementById('ebh-btn-show-desktop');
    const btnPauseResume = document.getElementById('ebh-btn-pause-resume');
    const btnMinimize = document.getElementById('ebh-btn-minimize');
    const btnDone = document.getElementById('ebh-btn-done');
    const btnOpenFolder = document.getElementById('ebh-btn-open-folder');
    const dockPill = document.getElementById('ebh-dock-pill');
    const catSelect = document.getElementById('ebh-select-category');
    const folderInput = document.getElementById('ebh-input-folder');

    // Close actions
    const hideModal = () => {
      backdrop.classList.remove('show');
    };

    btnClose.addEventListener('click', hideModal);
    btnCancel.addEventListener('click', hideModal);
    btnDone.addEventListener('click', () => {
      hideModal();
      dockPill.classList.remove('show');
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) hideModal();
    });

    // Category folder hint
    catSelect.addEventListener('change', () => {
      const val = catSelect.value;
      const cap = val.charAt(0).toUpperCase() + val.slice(1);
      folderInput.value = `Downloads\\${cap}`;
    });

    // Quality Pills selector
    const pills = document.querySelectorAll('#ebh-format-options .ebh-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const fmt = pill.getAttribute('data-fmt');
        if (currentDownloadPayload) {
          currentDownloadPayload.format = fmt;
          const ext = fmt === 'audio' ? 'mp3' : 'mp4';
          const label = fmt === 'audio' ? 'Audio' : `${fmt}p`;
          const base = (currentDownloadPayload.baseTitle || 'video').trim();
          const filenameInput = document.getElementById('ebh-input-filename');
          filenameInput.value = `${base}_(${label}).${ext}`;
          currentDownloadPayload.fileName = filenameInput.value;
        }
      });
    });

    // Start Download Button Clicked
    btnStart.addEventListener('click', () => {
      if (!currentDownloadPayload) return;
      const fn = document.getElementById('ebh-input-filename').value.trim();
      if (fn) currentDownloadPayload.fileName = fn;
      currentDownloadPayload.category = catSelect.value;

      triggerActiveDownload(currentDownloadPayload);
    });

    // Switch to desktop app
    btnOpenApp.addEventListener('click', () => {
      sendFocusDesktop();
    });

    btnShowDesktop.addEventListener('click', () => {
      if (activeTaskId) {
        showDesktopTaskWindow(activeTaskId);
      } else {
        sendFocusDesktop();
      }
    });

    btnOpenFolder.addEventListener('click', () => {
      sendFocusDesktop();
      hideModal();
    });

    // Minimize to Dock Pill
    btnMinimize.addEventListener('click', () => {
      hideModal();
      dockPill.classList.add('show');
    });

    // Dock Pill Clicked -> Re-open Modal
    dockPill.addEventListener('click', () => {
      backdrop.classList.add('show');
    });

    // Pause / Resume toggle
    btnPauseResume.addEventListener('click', async () => {
      if (!activeTaskId) return;
      const isPaused = btnPauseResume.textContent.includes('Resume');
      const action = isPaused ? 'resume' : 'pause';
      
      try {
        await fetch(`http://127.0.0.1:9462/downloads/${activeTaskId}/${action}`, { method: 'POST' });
        btnPauseResume.textContent = isPaused ? '⏸ Pause' : '▶ Resume';
      } catch (e) {
        console.warn('Pause/Resume error:', e);
      }
    });
  }

  // Opens the in-page download confirmation modal
  function openInBrowserDownloadDialog(payload) {
    ensureModalElements();

    currentDownloadPayload = { ...payload };
    const backdrop = document.getElementById('ebh-modal-backdrop');
    const viewSetup = document.getElementById('ebh-view-setup');
    const viewProgress = document.getElementById('ebh-view-progress');
    const viewComplete = document.getElementById('ebh-view-complete');
    const filenameInput = document.getElementById('ebh-input-filename');
    const urlDisplay = document.getElementById('ebh-display-url');
    const formatGroup = document.getElementById('ebh-group-format');
    const catSelect = document.getElementById('ebh-select-category');
    const folderInput = document.getElementById('ebh-input-folder');

    // Switch to setup view
    viewSetup.style.display = 'flex';
    viewProgress.style.display = 'none';
    viewComplete.style.display = 'none';

    // Populate fields
    filenameInput.value = payload.fileName || 'download';
    urlDisplay.textContent = payload.url || window.location.href;
    urlDisplay.title = payload.url || window.location.href;

    if (payload.category) {
      catSelect.value = payload.category;
    }
    const cap = catSelect.value.charAt(0).toUpperCase() + catSelect.value.slice(1);
    folderInput.value = `Downloads\\${cap}`;

    if (payload.isYouTube || payload.isSocial) {
      formatGroup.style.display = 'flex';
      payload.baseTitle = payload.fileName.replace(/_\(.*?p\)\.mp4|_\(Audio\)\.mp3/i, '').trim();
      
      // Highlight matching format pill
      const pills = document.querySelectorAll('#ebh-format-options .ebh-pill');
      pills.forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-fmt') === (payload.format || '1080'));
      });
    } else {
      formatGroup.style.display = 'none';
    }

    // Show backdrop
    backdrop.classList.add('show');
    filenameInput.focus();
    filenameInput.select();
  }

  // Triggers active download and switches modal to live progress mode
  function triggerActiveDownload(payload) {
    const viewSetup = document.getElementById('ebh-view-setup');
    const viewProgress = document.getElementById('ebh-view-progress');
    const viewComplete = document.getElementById('ebh-view-complete');
    const dockPill = document.getElementById('ebh-dock-pill');
    const progFilename = document.getElementById('ebh-prog-filename');

    viewSetup.style.display = 'none';
    viewProgress.style.display = 'flex';
    viewComplete.style.display = 'none';

    progFilename.textContent = payload.fileName || 'download';
    dockPill.classList.add('show');

    showIdmInPageNotification('⬇ Download Initiated', payload.fileName || 'Video');

    // Send download creation to backend
    const fullPayload = {
      url: payload.url,
      fileName: payload.fileName,
      referer: window.location.href,
      isYouTube: payload.isYouTube || payload.isSocial || false,
      format: payload.format || '1080',
      category: payload.category || 'video',
      autoStart: true,
      showDialog: true
    };

    if (chrome && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MEDIA',
        ...fullPayload
      }, (res) => {
        if (res && res.taskId) {
          startProgressPolling(res.taskId);
        } else {
          fallbackDirectPost(fullPayload);
        }
      });
    } else {
      fallbackDirectPost(fullPayload);
    }
  }

  function fallbackDirectPost(payload) {
    fetch('http://127.0.0.1:9462/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
      if (data && data.taskId) {
        startProgressPolling(data.taskId);
      }
    })
    .catch(err => {
      console.warn('Electron by Haris Direct Post error:', err);
      const statusElem = document.getElementById('ebh-stat-status');
      if (statusElem) statusElem.textContent = 'Desktop App Offline';
    });
  }

  // Polls live progress from the local API server and updates the UI
  function startProgressPolling(taskId) {
    activeTaskId = taskId;
    if (progressPollTimer) clearInterval(progressPollTimer);

    const progressBar = document.getElementById('ebh-progress-bar');
    const progPercent = document.getElementById('ebh-prog-percent');
    const statSpeed = document.getElementById('ebh-stat-speed');
    const statDownloaded = document.getElementById('ebh-stat-downloaded');
    const statEta = document.getElementById('ebh-stat-eta');
    const statStatus = document.getElementById('ebh-stat-status');
    const dockText = document.getElementById('ebh-dock-text');
    const viewProgress = document.getElementById('ebh-view-progress');
    const viewComplete = document.getElementById('ebh-view-complete');
    const completeDesc = document.getElementById('ebh-complete-desc');

    progressPollTimer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:9462/downloads/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();

        const pct = `${task.percent || 0}%`;
        progressBar.style.width = pct;
        progPercent.textContent = pct;
        statSpeed.textContent = task.speedStr || formatSpeed(task.speed);
        statDownloaded.textContent = task.totalBytes > 0 ? `${formatBytes(task.downloadedBytes)} (${pct})` : pct;
        statEta.textContent = task.etaStr || formatTime(task.eta);
        statStatus.textContent = task.status === 'downloading' ? 'Downloading...' : (task.status || 'Active');

        dockText.textContent = `Electron by Haris: ${pct} (${statSpeed.textContent})`;

        if (task.status === 'completed') {
          clearInterval(progressPollTimer);
          progressPollTimer = null;
          viewProgress.style.display = 'none';
          viewComplete.style.display = 'flex';
          completeDesc.textContent = `Successfully saved "${task.fileName}" to Downloads.`;
          dockText.textContent = `Electron by Haris: 100% (Complete)`;
        }
      } catch (e) {
        // Ignored during temporary offline blips
      }
    }, 450);
  }

  function sendFocusDesktop() {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: 'FOCUS_APP' });
    } else {
      fetch('http://127.0.0.1:9462/focus', { method: 'POST' }).catch(() => {});
    }
  }

  function showDesktopTaskWindow(taskId) {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: 'SHOW_TASK_DIALOG', taskId });
    } else {
      fetch(`http://127.0.0.1:9462/downloads/${taskId}/show`, { method: 'POST' }).catch(() => {});
    }
  }

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
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'Calculating...';
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  function showIdmInPageNotification(title, message) {
    let toast = document.getElementById('idm-inpage-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'idm-inpage-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div class="idm-toast-title">Electron by Haris</div>
      <div class="idm-toast-msg">${title}: <strong>${message || 'Connecting to Engine...'}</strong></div>
    `;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSniffer);
  } else {
    initSniffer();
  }
})();
