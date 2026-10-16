const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const storage = require('./storage');

// Persistent Keep-Alive socket pools to eliminate TCP/TLS handshake overhead
const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 64,
  keepAliveMsecs: 120000
});

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 64,
  keepAliveMsecs: 120000
});

// Global Speed Limiter shared across every active segmented stream.
//
// Because independent segments each pause only their own socket, throttling
// them separately allows an aggregate overshoot. Instead this limiter keeps the
// set of all live response streams and, once the per-second budget is exceeded,
// pauses EVERY stream simultaneously and resumes them together at the start of
// the next window. This converges total throughput tightly on the configured KB/s.
class SpeedLimiter {
  constructor() {
    this.streams = new Set();
    this.windowBytes = 0;
    this.windowStart = Date.now();
    this.paused = false;
    this.resumeTimer = null;
  }

  get enabled() {
    return !!(storage.settings.speedLimiterEnabled && storage.settings.speedLimitKBps > 0);
  }

  get limitBytesPerSec() {
    return (storage.settings.speedLimitKBps || 0) * 1024;
  }

  register(res) {
    this.streams.add(res);
  }

  unregister(res) {
    this.streams.delete(res);
  }

  // Account for received bytes; pauses all live streams when the budget is spent.
  consume(res, bytes) {
    if (!this.enabled) {
      if (this.paused) this.resumeAll();
      return;
    }

    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowBytes = 0;
      this.windowStart = now;
    }
    this.windowBytes += bytes;

    if (this.windowBytes > this.limitBytesPerSec && !this.paused) {
      this.pauseAll();
      const wait = Math.max(50, 1000 - (Date.now() - this.windowStart));
      this.resumeTimer = setTimeout(() => this.resumeAll(), wait);
    }
  }

  pauseAll() {
    this.paused = true;
    for (const res of this.streams) {
      try { res.pause(); } catch (e) {}
    }
  }

  resumeAll() {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.paused = false;
    this.windowBytes = 0;
    this.windowStart = Date.now();
    for (const res of this.streams) {
      try { res.resume(); } catch (e) {}
    }
  }
}

const globalSpeedLimiter = new SpeedLimiter();

function applySpeedLimit(res, bytes) {
  globalSpeedLimiter.consume(res, bytes);
}

class DownloadTask extends EventEmitter {
  constructor(options) {
    super();
    this.id = options.id || ('idm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    this.url = options.url;
    this.originalUrl = options.url;
    this.headers = options.headers || {};
    this.cookies = options.cookies || '';
    this.referer = options.referer || '';
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    
    this.category = options.category || storage.getCategory(options.fileName || '');
    this.directory = options.directory || storage.getTargetDir(this.category);
    this.fileName = options.fileName || this.extractFileName(options.url);
    this.filePath = path.join(this.directory, this.fileName);

    this.tempDir = path.join(storage.baseDir, 'temp', this.id);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.totalBytes = options.totalBytes || 0;
    this.downloadedBytes = options.downloadedBytes || 0;
    this.status = options.status || 'queued'; // queued, connecting, downloading, paused, assembling, completed, error
    this.errorMessage = null;
    this.resumable = options.resumable !== undefined ? options.resumable : true;
    
    this.maxSegments = options.maxSegments || storage.settings.maxSegments || 8;
    this.segments = options.segments || [];
    this.speed = 0;
    this.eta = 0; // seconds
    this.addedDate = options.addedDate || new Date().toISOString();
    this.lastTryDate = new Date().toISOString();

    this.activeRequests = [];
    this.speedSampleBytes = 0;
    this.speedLastTime = Date.now();
    this.speedInterval = null;
    this.isPaused = false;
    this.isCancelled = false;
  }

  extractFileName(urlString) {
    try {
      const parsed = new URL(urlString);
      let base = path.basename(parsed.pathname);
      if (!base || base.trim() === '' || base === '/') {
        return 'download_' + Date.now();
      }
      return decodeURIComponent(base);
    } catch {
      return 'download_' + Date.now();
    }
  }

  getMeta() {
    return {
      id: this.id,
      url: this.url,
      fileName: this.fileName,
      filePath: this.filePath,
      category: this.category,
      directory: this.directory,
      totalBytes: this.totalBytes,
      downloadedBytes: this.downloadedBytes,
      status: this.status,
      speed: this.speed,
      speedStr: this.speedStr || '',
      eta: this.eta,
      etaStr: this.etaStr || '',
      isYouTube: this.isYouTube,
      resumable: this.resumable,
      maxSegments: this.maxSegments,
      segments: this.segments.map(s => ({
        index: s.index,
        start: s.start,
        end: s.end,
        total: s.total,
        downloaded: s.downloaded,
        percent: s.total > 0 ? Math.min(100, Math.floor((s.downloaded / s.total) * 100)) : 0,
        status: s.status
      })),
      percent: this.percent !== undefined && this.percent > 0 ? this.percent : (this.totalBytes > 0 ? Math.min(100, Number(((this.downloadedBytes / this.totalBytes) * 100).toFixed(1))) : 0),
      addedDate: this.addedDate,
      lastTryDate: this.lastTryDate,
      errorMessage: this.errorMessage
    };
  }

  buildHeaders(extra = {}) {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': '*/*',
      'Accept-Encoding': 'identity', // disable gzip for byte-level accuracy
      'Connection': 'keep-alive',
      ...this.headers,
      ...extra
    };
    if (this.referer) headers['Referer'] = this.referer;
    if (this.cookies) headers['Cookie'] = this.cookies;
    return headers;
  }

  async resolveMetadata() {
    return new Promise((resolve, reject) => {
      let currentUrl = this.url;
      let redirectsCount = 0;

      const doProbe = (targetUrl) => {
        if (redirectsCount > 10) {
          return reject(new Error('Too many redirects'));
        }

        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: this.buildHeaders({ 'Range': 'bytes=0-0' }), // test Range support immediately
          agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent
        };

        const req = client.request(options, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            redirectsCount++;
            const newTarget = new URL(res.headers.location, targetUrl).toString();
            this.url = newTarget;
            res.resume();
            return doProbe(newTarget);
          }

          // Check Content-Disposition for filename
          const cd = res.headers['content-disposition'];
          if (cd) {
            const filenameMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
            if (filenameMatch && filenameMatch[1]) {
              this.fileName = decodeURIComponent(filenameMatch[1].trim());
              this.category = storage.getCategory(this.fileName);
              this.directory = storage.getTargetDir(this.category);
              this.filePath = path.join(this.directory, this.fileName);
            }
          }

          let total = 0;
          let rangeSupported = false;

          if (res.statusCode === 206) {
            rangeSupported = true;
            const contentRange = res.headers['content-range'];
            if (contentRange) {
              const match = contentRange.match(/\/(\d+|\*)/);
              if (match && match[1] !== '*') {
                total = parseInt(match[1], 10);
              }
            }
          } else if (res.statusCode === 200) {
            const len = res.headers['content-length'];
            if (len) {
              total = parseInt(len, 10);
            }
            const acceptRanges = res.headers['accept-ranges'];
            rangeSupported = acceptRanges === 'bytes';
          }

          this.totalBytes = total;
          this.resumable = rangeSupported && total > 0;
          res.destroy(); // done probing
          resolve({ total, rangeSupported });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.setTimeout(15000, () => {
          req.destroy(new Error('Connection probe timed out'));
        });

        req.end();
      };

      doProbe(currentUrl);
    });
  }

  isSocialMediaUrl(urlString) {
    if (this.isYouTube || this.isSocialMedia) return true;
    try {
      const parsed = new URL(urlString);
      const host = parsed.hostname.toLowerCase();
      const socialDomains = [
        'youtube.com', 'youtu.be',
        'facebook.com', 'fb.watch', 'fb.com', 'm.facebook.com', 'web.facebook.com',
        'instagram.com', 'instagr.am',
        'tiktok.com',
        'twitter.com', 'x.com',
        'reddit.com', 'v.redd.it', 'redd.it',
        'vimeo.com',
        'twitch.tv',
        'pinterest.com', 'pin.it',
        'dailymotion.com', 'dai.ly',
        'soundcloud.com',
        'bilibili.com', 'bilibili.tv',
        'vk.com',
        'threads.net', 'threads.com',
        'snapchat.com',
        'rumble.com',
        'linkedin.com',
        'tumblr.com',
        'streamable.com',
        'mixcloud.com',
        'bandcamp.com',
        'odysee.com',
        'bitchute.com',
        'kick.com',
        'weibo.com',
        'douyin.com',
        'kuaishou.com'
      ];
      return socialDomains.some(d => host === d || host.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  async start() {
    if (this.status === 'downloading') return;
    this.isPaused = false;
    this.isCancelled = false;
    this.status = 'connecting';
    this.lastTryDate = new Date().toISOString();
    this.emit('status-change', this.getMeta());

    try {
      if (this.isSocialMediaUrl(this.url)) {
        return await this.startMediaStreamDownload();
      }

      if (this.totalBytes === 0) {
        await this.resolveMetadata();
      }

      if (this.isPaused || this.isCancelled) return;

      this.filePath = this.getUniqueFilePath(this.filePath);
      this.status = 'downloading';
      this.emit('status-change', this.getMeta());

      this.startSpeedMonitor();

      if (this.resumable && this.totalBytes > 1024 * 512) {
        // Multi-segmented download
        await this.startSegmentedDownload();
      } else {
        // Single stream download
        await this.startSingleDownload();
      }
    } catch (err) {
      if (this.isPaused || this.isCancelled) return;
      this.status = 'error';
      this.errorMessage = err.message || 'Download failed';
      this.stopSpeedMonitor();
      this.emit('error', err);
      this.emit('status-change', this.getMeta());
    }
  }

  // Unified discovery for standalone yt-dlp executable or Python yt-dlp module
  static _cachedYtDlpExec = null;
  static _cachedFFmpegPath = null;

  getYtDlpExecution() {
    if (DownloadTask._cachedYtDlpExec) return DownloadTask._cachedYtDlpExec;

    const isWin = process.platform === 'win32';
    const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

    // 1. Check bundled binary in resources/bin (packaged app) or workspace/bin (dev)
    const bundledPaths = [
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', exeName) : null,
      path.join(__dirname, '../../bin', exeName),
      path.join(process.cwd(), 'bin', exeName)
    ].filter(Boolean);

    for (const p of bundledPaths) {
      if (fs.existsSync(p)) {
        console.log(`[yt-dlp] Using bundled standalone binary: ${p}`);
        DownloadTask._cachedYtDlpExec = { command: p, baseArgs: [] };
        return DownloadTask._cachedYtDlpExec;
      }
    }

    // 2. Check standalone yt-dlp on system PATH or standard install paths
    const systemPaths = isWin ? [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
      'yt-dlp.exe',
      'yt-dlp'
    ] : [
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      'yt-dlp'
    ];

    const { execFileSync } = require('child_process');
    for (const sysPath of systemPaths) {
      try {
        if (sysPath.includes(path.sep) && !fs.existsSync(sysPath)) continue;
        execFileSync(sysPath, ['--version'], { timeout: 8000, stdio: 'pipe' });
        console.log(`[yt-dlp] Using system standalone binary: ${sysPath}`);
        DownloadTask._cachedYtDlpExec = { command: sysPath, baseArgs: [] };
        return DownloadTask._cachedYtDlpExec;
      } catch (e) {}
    }

    // 3. Fallback to Python with -m yt_dlp
    const pythonExe = this.findPythonWithYtDlp();
    DownloadTask._cachedYtDlpExec = { command: pythonExe, baseArgs: ['-u', '-m', 'yt_dlp'] };
    return DownloadTask._cachedYtDlpExec;
  }

  findPythonWithYtDlp() {
    const { execFileSync } = require('child_process');

    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
      'python'
    ];

    for (const pyPath of candidates) {
      try {
        if (pyPath.includes(path.sep) && !fs.existsSync(pyPath)) continue;
        execFileSync(pyPath, ['-m', 'yt_dlp', '--version'], { timeout: 10000, stdio: 'pipe' });
        console.log(`[yt-dlp] Found Python with yt-dlp: ${pyPath}`);
        return pyPath;
      } catch (e) {}
    }

    console.warn('[yt-dlp] Could not find specific Python with yt-dlp, falling back to "python"');
    return 'python';
  }

  findFFmpegBin() {
    if (DownloadTask._cachedFFmpegPath) return DownloadTask._cachedFFmpegPath;

    const isWin = process.platform === 'win32';
    const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

    // 1. Check bundled in resources/bin or workspace/bin
    const bundledPaths = [
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', exeName) : null,
      path.join(__dirname, '../../bin', exeName),
      path.join(process.cwd(), 'bin', exeName)
    ].filter(Boolean);

    for (const p of bundledPaths) {
      if (fs.existsSync(p)) {
        const binDir = path.dirname(p);
        console.log(`[yt-dlp] Using bundled FFmpeg binary: ${p}`);
        DownloadTask._cachedFFmpegPath = binDir;
        return binDir;
      }
    }

    // 2. Check WinGet / macOS Homebrew paths
    if (isWin) {
      const wingetPkgBase = path.join(
        process.env.LOCALAPPDATA || '',
        'Microsoft', 'WinGet', 'Packages',
        'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe'
      );
      if (fs.existsSync(wingetPkgBase)) {
        try {
          const subdirs = fs.readdirSync(wingetPkgBase).filter(d => d.startsWith('ffmpeg-'));
          if (subdirs.length > 0) {
            subdirs.sort().reverse();
            const binDir = path.join(wingetPkgBase, subdirs[0], 'bin');
            if (fs.existsSync(path.join(binDir, 'ffmpeg.exe'))) {
              DownloadTask._cachedFFmpegPath = binDir;
              return binDir;
            }
          }
        } catch (e) {}
      }
    } else {
      const macPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
      for (const mp of macPaths) {
        if (fs.existsSync(path.join(mp, 'ffmpeg'))) {
          DownloadTask._cachedFFmpegPath = mp;
          return mp;
        }
      }
    }

    // 3. Check system PATH
    const { execFileSync } = require('child_process');
    try {
      execFileSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'pipe' });
      DownloadTask._cachedFFmpegPath = '';
      return '';
    } catch (e) {}

    console.warn('[yt-dlp] FFmpeg not found');
    return '';
  }

  findJsRuntime() {
    if (DownloadTask._cachedJsRuntime) return DownloadTask._cachedJsRuntime;

    const isWin = process.platform === 'win32';
    const denoName = isWin ? 'deno.exe' : 'deno';
    const nodeName = isWin ? 'node.exe' : 'node';

    const bundledDirs = [
      process.resourcesPath ? path.join(process.resourcesPath, 'bin') : null,
      path.join(__dirname, '../../bin'),
      path.join(process.cwd(), 'bin')
    ].filter(Boolean);

    // 1. Bundled deno (yt-dlp's preferred/default runtime)
    for (const dir of bundledDirs) {
      const p = path.join(dir, denoName);
      if (fs.existsSync(p)) {
        console.log(`[yt-dlp] Using bundled Deno JS runtime: ${p}`);
        DownloadTask._cachedJsRuntime = ['--js-runtimes', `deno:${p}`];
        return DownloadTask._cachedJsRuntime;
      }
    }

    // 2. Bundled node
    for (const dir of bundledDirs) {
      const p = path.join(dir, nodeName);
      if (fs.existsSync(p)) {
        console.log(`[yt-dlp] Using bundled Node JS runtime: ${p}`);
        DownloadTask._cachedJsRuntime = ['--js-runtimes', `node:${p}`];
        return DownloadTask._cachedJsRuntime;
      }
    }

    // 3. Node on system PATH
    const { execFileSync } = require('child_process');
    try {
      execFileSync(isWin ? 'where' : 'which', [nodeName], { timeout: 5000, stdio: 'pipe' });
      console.log('[yt-dlp] Using system Node JS runtime');
      DownloadTask._cachedJsRuntime = ['--js-runtimes', 'node:node'];
      return DownloadTask._cachedJsRuntime;
    } catch (e) {}

    console.warn('[yt-dlp] No JS runtime (deno/node) found; YouTube formats may be limited');
    DownloadTask._cachedJsRuntime = [];
    return DownloadTask._cachedJsRuntime;
  }

  async startYouTubeDownload() {
    return this.startMediaStreamDownload();
  }

  async startMediaStreamDownload() {
    const { spawn } = require('child_process');
    this.status = 'downloading';
    this.category = 'video';
    this.directory = storage.getTargetDir('video');
    this.emit('status-change', this.getMeta());

    const { command, baseArgs } = this.getYtDlpExecution();
    const ffmpegBin = this.findFFmpegBin();
    const outTemplate = path.join(this.directory, '%(title).100s.%(ext)s');

    const maxParallel = Math.max(8, Math.min(32, storage.settings.maxSegments || 16));
    const turboArgs = [
      '-N', String(maxParallel),   // IDM multi-connection parallel chunk downloading!
      '--buffer-size', '1024k',    // 1MB network buffer
      '--http-chunk-size', '10M',  // 10MB chunks for fast throughput
      '--retries', '10',
      '--fragment-retries', '10'
    ];

    // yt-dlp needs a JS runtime + EJS components to fully extract YouTube
    // formats; without them extraction is degraded and format selection can
    // fail with "Requested format is not available".
    // --encoding utf-8 is required so non-ASCII titles (e.g. en dash) are
    // emitted as UTF-8 instead of the console code page; otherwise the parsed
    // file path becomes mojibake and Open File/Folder silently fail.
    const extractionArgs = [
      ...this.findJsRuntime(),
      '--remote-components', 'ejs:github',
      '--encoding', 'utf-8'
    ];

    let cookieArgs = [];
    if (this.cookies && this.cookies.trim()) {
      cookieArgs = ['--add-header', `Cookie:${this.cookies}`];
    }
    if (this.referer) {
      cookieArgs.push('--add-header', `Referer:${this.referer}`);
    }

    let args;
    if (this.format === 'audio') {
      args = [
        ...baseArgs,
        ...turboArgs,
        ...extractionArgs,
        ...cookieArgs,
        ...(ffmpegBin ? ['--ffmpeg-location', ffmpegBin] : []),
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outTemplate,
        '--newline',
        '--no-mtime',
        this.url
      ];
    } else {
      const heightLimit = (this.format && !isNaN(parseInt(this.format, 10))) ? this.format : '1080';
      const formatArg = `bv*[height<=${heightLimit}][ext=mp4]+ba[ext=m4a]/bv*[height<=${heightLimit}]+ba[ext=m4a]/bv*[height<=${heightLimit}]+ba/b[height<=${heightLimit}]/bv*+ba/b`;

      args = [
        ...baseArgs,
        ...turboArgs,
        ...extractionArgs,
        ...cookieArgs,
        ...(ffmpegBin ? ['--ffmpeg-location', ffmpegBin] : []),
        '-f', formatArg,
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'Merger:-c:v copy -c:a aac -b:a 192k',
        '-o', outTemplate,
        '--newline',
        '--no-mtime',
        this.url
      ];
    }

    console.log(`[yt-dlp Turbo] Spawning: ${command} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      this.activeProc = proc;
      let stderrOutput = '';


      proc.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('[yt-dlp stdout]', text.trim());

        const percentMatch = text.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (percentMatch) {
          this.percent = parseFloat(percentMatch[1]);
        }

        const speedMatch = text.match(/at\s+([\d\.]+\s*[KMGT]?i?B\/s)/);
        if (speedMatch) {
          this.speedStr = speedMatch[1];
        }

        const etaMatch = text.match(/ETA\s+(\d+:\d+)/);
        if (etaMatch) {
          this.etaStr = etaMatch[1];
        }

        const destMatch = text.match(/Destination:\s+(.+)/);
        if (destMatch) {
          this.filePath = destMatch[1].trim();
          this.fileName = path.basename(this.filePath);
        }

        const mergerMatch = text.match(/\[Merger\]\s+Merging formats into "(.+)"/);
        if (mergerMatch) {
          this.filePath = mergerMatch[1].trim();
          this.fileName = path.basename(this.filePath);
          this.status = 'assembling';
          this.speedStr = 'Converting';
          this.etaStr = 'Merging AAC audio...';
          this.emit('status-change', this.getMeta());
        }

        const alreadyMatch = text.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (alreadyMatch) {
          this.filePath = alreadyMatch[1].trim();
          this.fileName = path.basename(this.filePath);
          this.percent = 100;
        }

        this.emit('progress', this.getMeta());
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderrOutput += text;
        console.warn('[yt-dlp stderr]', text.trim());
      });

      proc.on('error', (err) => {
        console.error('[yt-dlp] Failed to spawn process:', err.message);
        this.status = 'error';
        this.errorMessage = `Failed to start yt-dlp: ${err.message}`;
        this.emit('status-change', this.getMeta());
        reject(new Error(this.errorMessage));
      });

      proc.on('close', (code) => {
        this.activeProc = null;
        if (code === 0) {
          this.finishDownload();
          resolve();
        } else {
          this.status = 'error';
          const errorLines = stderrOutput.split('\n').filter(l => l.includes('ERROR')).join('; ');
          this.errorMessage = errorLines || `yt-dlp exited with code ${code}`;
          console.error(`[yt-dlp] Process exited with code ${code}. stderr: ${stderrOutput}`);
          this.emit('status-change', this.getMeta());
          reject(new Error(this.errorMessage));
        }
      });
    });
  }

  getUniqueFilePath(origPath) {
    if (!fs.existsSync(origPath) || this.segments.length > 0) {
      return origPath;
    }
    const dir = path.dirname(origPath);
    const ext = path.extname(origPath);
    const base = path.basename(origPath, ext);
    let counter = 1;
    let newPath = path.join(dir, `${base}_(${counter})${ext}`);
    while (fs.existsSync(newPath)) {
      counter++;
      newPath = path.join(dir, `${base}_(${counter})${ext}`);
    }
    this.fileName = path.basename(newPath);
    return newPath;
  }

  tryDynamicSplitSegment() {
    if (this.isPaused || this.isCancelled) return null;

    // Minimum remaining bytes required to justify a dynamic split (256 KB)
    const MIN_SPLIT_THRESHOLD = 256 * 1024;

    let bestCandidate = null;
    let maxRemaining = 0;

    for (const seg of this.segments) {
      if (seg.status === 'downloading') {
        const currentPos = seg.start + seg.downloaded;
        const remaining = seg.end - currentPos + 1;
        if (remaining >= MIN_SPLIT_THRESHOLD && remaining > maxRemaining) {
          maxRemaining = remaining;
          bestCandidate = seg;
        }
      }
    }

    if (!bestCandidate) return null;

    // Split the largest remaining portion in half
    const currentPos = bestCandidate.start + bestCandidate.downloaded;
    const splitPoint = currentPos + Math.floor(maxRemaining / 2);
    const originalEnd = bestCandidate.end;

    // Shrink active candidate segment end to splitPoint - 1
    bestCandidate.end = splitPoint - 1;
    bestCandidate.total = (bestCandidate.end - bestCandidate.start) + 1;

    // Create new sub-segment for the second half
    const newIndex = this.segments.length;
    const newPartFile = path.join(this.tempDir, `part_${newIndex}.idm`);
    const newSeg = {
      index: newIndex,
      start: splitPoint,
      end: originalEnd,
      total: (originalEnd - splitPoint) + 1,
      downloaded: 0,
      partFile: newPartFile,
      status: 'pending'
    };

    this.segments.push(newSeg);
    this.emit('progress', this.getMeta());

    return newSeg;
  }

  async startSegmentedDownload() {
    const numWorkers = Math.min(this.maxSegments, 32);
    const initialSegmentsCount = Math.min(numWorkers, Math.max(1, Math.floor(this.totalBytes / (512 * 1024))));
    const chunkSize = Math.floor(this.totalBytes / initialSegmentsCount);

    // Initialize segments if not already created
    if (this.segments.length === 0) {
      this.segments = [];
      for (let i = 0; i < initialSegmentsCount; i++) {
        const start = i * chunkSize;
        const end = (i === initialSegmentsCount - 1) ? this.totalBytes - 1 : (start + chunkSize - 1);
        const partFile = path.join(this.tempDir, `part_${i}.idm`);
        
        let existingDownloaded = 0;
        if (fs.existsSync(partFile)) {
          existingDownloaded = fs.statSync(partFile).size;
        }

        this.segments.push({
          index: i,
          start,
          end,
          total: (end - start) + 1,
          downloaded: existingDownloaded,
          partFile,
          status: existingDownloaded >= ((end - start) + 1) ? 'done' : 'pending'
        });
      }
    } else {
      // Sync from disk (e.g. on resume)
      let totalDownloaded = 0;
      for (const seg of this.segments) {
        if (fs.existsSync(seg.partFile)) {
          seg.downloaded = fs.statSync(seg.partFile).size;
        } else {
          seg.downloaded = 0;
        }
        seg.status = seg.downloaded >= seg.total ? 'done' : 'pending';
        totalDownloaded += seg.downloaded;
      }
      this.downloadedBytes = totalDownloaded;
    }

    if (!this.activeStreams) this.activeStreams = [];

    // Worker pool: numWorkers run concurrently, pulling pending chunks or dynamically splitting active ones!
    const runWorker = async (workerId) => {
      while (!this.isPaused && !this.isCancelled) {
        // 1. Check for any pending segment
        let seg = this.segments.find(s => s.status === 'pending');

        // 2. If no pending segment, attempt Dynamic File Segmentation (IDM patented logic)
        if (!seg) {
          seg = this.tryDynamicSplitSegment();
        }

        // 3. If still nothing to split, this worker has no more work to do
        if (!seg) {
          break;
        }

        await this.downloadSegment(seg);
      }
    };

    const workers = [];
    for (let w = 0; w < numWorkers; w++) {
      workers.push(runWorker(w));
    }

    await Promise.all(workers);

    if (this.isPaused || this.isCancelled) return;

    // All segments completed! Assemble file in exact linear byte sequence
    await this.assembleParts();
  }

  downloadSegment(seg) {
    return new Promise((resolve, reject) => {
      if (seg.downloaded >= seg.total) {
        seg.status = 'done';
        return resolve();
      }

      if (this.isPaused || this.isCancelled) {
        return resolve();
      }

      const currentStart = seg.start + seg.downloaded;
      const parsedUrl = new URL(this.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = this.buildHeaders({
        'Range': `bytes=${currentStart}-${seg.end}`
      });

      const options = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers,
        agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent
      };

      seg.status = 'downloading';

      const fileStream = fs.createWriteStream(seg.partFile, {
        flags: seg.downloaded > 0 ? 'a' : 'w',
        highWaterMark: 1024 * 1024 // 1MB high-speed disk buffer
      });
      if (!this.activeStreams) this.activeStreams = [];
      this.activeStreams.push(fileStream);

      let isFinished = false;
      let currentRes = null;
      const markDone = () => {
        if (!isFinished) {
          isFinished = true;
          seg.status = 'done';
          if (currentRes) globalSpeedLimiter.unregister(currentRes);
          try { fileStream.close(); } catch {}
          resolve();
        }
      };

      const req = client.request(options, (res) => {
        currentRes = res;
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          fileStream.close();
          seg.status = 'error';
          return reject(new Error(`Segment ${seg.index} HTTP ${res.statusCode}`));
        }

        globalSpeedLimiter.register(res);

        res.on('data', (chunk) => {
          if (this.isPaused || this.isCancelled) {
            req.destroy();
            return markDone();
          }

          // Handle dynamic split: don't write past seg.total
          const needed = seg.total - seg.downloaded;
          if (needed <= 0) {
            req.destroy();
            return markDone();
          }

          const toWrite = chunk.length > needed ? chunk.slice(0, needed) : chunk;
          fileStream.write(toWrite);

          seg.downloaded += toWrite.length;
          this.downloadedBytes += toWrite.length;
          this.speedSampleBytes += toWrite.length;

          if (seg.downloaded >= seg.total) {
            req.destroy();
            return markDone();
          }

          applySpeedLimit(res, toWrite.length);
        });

        res.on('end', () => {
          markDone();
        });

        fileStream.on('finish', () => {
          markDone();
        });

        fileStream.on('error', (err) => {
          seg.status = 'error';
          if (currentRes) globalSpeedLimiter.unregister(currentRes);
          reject(err);
        });
      });

      this.activeRequests.push(req);

      req.on('error', (err) => {
        if (currentRes) globalSpeedLimiter.unregister(currentRes);
        if (this.isPaused || this.isCancelled || isFinished) return resolve();
        seg.status = 'error';
        reject(err);
      });

      req.setTimeout(30000, () => {
        if (!isFinished) {
          req.destroy(new Error(`Segment ${seg.index} timeout`));
        }
      });

      req.end();
    });
  }

  async startSingleDownload() {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(this.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const tempFile = path.join(this.tempDir, 'single_download.idm');
      let currentDownloaded = 0;
      if (fs.existsSync(tempFile) && this.resumable) {
        currentDownloaded = fs.statSync(tempFile).size;
        this.downloadedBytes = currentDownloaded;
      }

      const headers = this.buildHeaders(
        currentDownloaded > 0 ? { 'Range': `bytes=${currentDownloaded}-` } : {}
      );

      const options = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers,
        agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent
      };

      const fileStream = fs.createWriteStream(tempFile, {
        flags: currentDownloaded > 0 ? 'a' : 'w'
      });

      let singleRes = null;

      const req = client.request(options, (res) => {
        singleRes = res;
        if (this.totalBytes === 0 && res.headers['content-length']) {
          this.totalBytes = parseInt(res.headers['content-length'], 10);
        }

        globalSpeedLimiter.register(res);

        res.on('data', (chunk) => {
          if (this.isPaused || this.isCancelled) {
            req.destroy();
            fileStream.close();
            return;
          }
          this.downloadedBytes += chunk.length;
          this.speedSampleBytes += chunk.length;
          applySpeedLimit(res, chunk.length);
        });

        res.pipe(fileStream);

        fileStream.on('finish', async () => {
          globalSpeedLimiter.unregister(res);
          fileStream.close();
          if (this.isPaused || this.isCancelled) return resolve();
          
          this.status = 'assembling';
          this.emit('status-change', this.getMeta());
          
          // Move to target
          if (!fs.existsSync(this.directory)) {
            fs.mkdirSync(this.directory, { recursive: true });
          }
          fs.copyFileSync(tempFile, this.filePath);
          fs.unlinkSync(tempFile);
          
          this.finishDownload();
          resolve();
        });

        fileStream.on('error', (err) => {
          if (singleRes) globalSpeedLimiter.unregister(singleRes);
          reject(err);
        });
      });

      this.activeRequests.push(req);

      req.on('error', (err) => {
        if (singleRes) globalSpeedLimiter.unregister(singleRes);
        if (this.isPaused || this.isCancelled) return resolve();
        reject(err);
      });

      req.end();
    });
  }

  async assembleParts() {
    this.status = 'assembling';
    this.emit('status-change', this.getMeta());

    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }

    const outStream = fs.createWriteStream(this.filePath, {
      highWaterMark: 1024 * 1024
    });

    // CRITICAL: Sort all dynamically split segments by starting byte offset
    const sortedSegments = [...this.segments].sort((a, b) => a.start - b.start);

    for (const seg of sortedSegments) {
      if (fs.existsSync(seg.partFile)) {
        await new Promise((res, rej) => {
          const inStream = fs.createReadStream(seg.partFile, {
            highWaterMark: 1024 * 1024
          });
          inStream.pipe(outStream, { end: false });
          inStream.on('end', res);
          inStream.on('error', rej);
        });
      }
    }

    outStream.end();

    await new Promise((res) => outStream.on('finish', res));

    // Clean up temp part files
    try {
      for (const seg of this.segments) {
        if (fs.existsSync(seg.partFile)) {
          fs.unlinkSync(seg.partFile);
        }
      }
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore temp cleanup errors
    }

    this.finishDownload();
  }

  finishDownload() {
    this.stopSpeedMonitor();
    this.status = 'completed';
    this.speed = 0;
    this.eta = 0;
    this.downloadedBytes = this.totalBytes || this.downloadedBytes;
    this.emit('status-change', this.getMeta());
    this.emit('complete', this.getMeta());
  }

  pause() {
    this.isPaused = true;
    this.status = 'paused';
    this.stopSpeedMonitor();
    this.speed = 0;
    this.eta = 0;

    for (const req of this.activeRequests) {
      try {
        req.destroy();
      } catch (e) {}
    }
    this.activeRequests = [];

    if (this.activeStreams) {
      for (const st of this.activeStreams) {
        try {
          st.end();
        } catch (e) {}
      }
      this.activeStreams = [];
    }

    // Update segment downloaded from disk
    let totalDownloaded = 0;
    for (const seg of this.segments) {
      if (fs.existsSync(seg.partFile)) {
        seg.downloaded = fs.statSync(seg.partFile).size;
        seg.status = seg.downloaded >= seg.total ? 'done' : 'paused';
        totalDownloaded += seg.downloaded;
      }
    }
    if (this.segments.length > 0) {
      this.downloadedBytes = totalDownloaded;
    }

    this.emit('status-change', this.getMeta());
  }

  cancel() {
    this.isCancelled = true;
    this.pause();
    this.status = 'cancelled';
    this.cleanTemp();
    this.emit('status-change', this.getMeta());
  }

  cleanTemp() {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  startSpeedMonitor() {
    this.speedLastTime = Date.now();
    this.speedSampleBytes = 0;

    if (this.speedInterval) clearInterval(this.speedInterval);

    this.speedInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.speedLastTime) / 1000;
      if (elapsed > 0) {
        const instantSpeed = this.speedSampleBytes / elapsed; // bytes/sec
        // Smoothed EMA
        this.speed = this.speed === 0 ? instantSpeed : (this.speed * 0.7 + instantSpeed * 0.3);
        this.speedSampleBytes = 0;
        this.speedLastTime = now;

        if (this.speed > 0 && this.totalBytes > this.downloadedBytes) {
          this.eta = Math.round((this.totalBytes - this.downloadedBytes) / this.speed);
        } else {
          this.eta = 0;
        }

        this.emit('progress', this.getMeta());
      }
    }, 400);
  }

  stopSpeedMonitor() {
    if (this.speedInterval) {
      clearInterval(this.speedInterval);
      this.speedInterval = null;
    }
  }
}

class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.initExistingDownloads();
  }

  initExistingDownloads() {
    const records = storage.loadDownloads();
    for (const rec of records) {
      const task = new DownloadTask({
        ...rec,
        status: rec.status === 'downloading' || rec.status === 'connecting' ? 'paused' : rec.status
      });
      this.bindTaskEvents(task);
      this.tasks.set(task.id, task);
    }
  }

  bindTaskEvents(task) {
    task.on('status-change', (meta) => {
      this.persist();
      this.emit('task-updated', meta);
    });

    task.on('progress', (meta) => {
      this.emit('task-progress', meta);
    });

    task.on('complete', (meta) => {
      this.persist();
      this.emit('task-completed', meta);
    });

    task.on('error', (err) => {
      this.persist();
      this.emit('task-error', { id: task.id, error: err.message });
    });
  }

  createTask(options) {
    const task = new DownloadTask(options);
    this.bindTaskEvents(task);
    this.tasks.set(task.id, task);
    this.persist();
    this.emit('task-created', task.getMeta());
    return task;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllTasks() {
    return Array.from(this.tasks.values()).map(t => t.getMeta());
  }

  startTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.start();
    }
  }

  pauseTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.pause();
    }
  }

  stopAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'connecting') {
        task.pause();
      }
    }
  }

  resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'queued') {
        task.start();
      }
    }
  }

  deleteTask(id, deleteFile = false) {
    const task = this.tasks.get(id);
    if (task) {
      task.cancel();
      if (deleteFile && fs.existsSync(task.filePath)) {
        try {
          fs.unlinkSync(task.filePath);
        } catch (e) {}
      }
      this.tasks.delete(id);
      this.persist();
      this.emit('task-deleted', id);
    }
  }

  deleteAllCompleted(deleteFiles = false) {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed') {
        this.deleteTask(id, deleteFiles);
      }
    }
  }

  persist() {
    const list = Array.from(this.tasks.values()).map(t => t.getMeta());
    storage.downloads = list;
    storage.saveDownloads();
  }
}

module.exports = new DownloadManager();
