const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const downloadManager = require('../engine/downloader');
const storage = require('../engine/storage');
const EventEmitter = require('events');

class ApiServer extends EventEmitter {
  constructor() {
    super();
    this.app = express();
    this.server = null;
    this.wss = null;
    this.port = storage.settings.port || 9462;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Status / Health check
    this.app.get('/status', (req, res) => {
      res.json({
        status: 'online',
        name: 'Internet Download Manager Engine',
        version: '6.42 Build 18',
        activeDownloads: downloadManager.getAllTasks().filter(t => t.status === 'downloading').length,
        totalDownloads: downloadManager.tasks.size,
        settings: storage.settings
      });
    });

    this.app.get('/health', (req, res) => {
      res.json({ ok: true });
    });

    // Bring desktop app to front
    this.app.post('/focus', (req, res) => {
      this.emit('focus-window');
      res.json({ success: true });
    });

    // Create a new download task
    this.app.post('/download', (req, res) => {
      try {
        const {
          url,
          fileName,
          cookies,
          referer,
          userAgent,
          headers,
          category,
          directory,
          isYouTube,
          format,
          autoStart = true,
          showDialog = true
        } = req.body;

        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        const task = downloadManager.createTask({
          url,
          fileName,
          cookies,
          referer,
          userAgent,
          headers,
          category,
          directory,
          isYouTube,
          format
        });

        // Notify Electron to pop up the Download Dialog
        this.emit('new-download-request', {
          taskId: task.id,
          showDialog,
          autoStart
        });

        if (autoStart) {
          setImmediate(() => {
            task.start().catch(err => {
              console.error(`[DownloadManager] Task ${task.id} start error:`, err);
            });
          });
        }

        res.json({
          success: true,
          taskId: task.id,
          meta: task.getMeta()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Batch download (for "Download all links with IDM")
    this.app.post('/batch-download', (req, res) => {
      try {
        const { items, autoStart = false } = req.body;
        if (!Array.isArray(items)) {
          return res.status(400).json({ error: 'items must be an array' });
        }

        const createdTasks = [];
        for (const item of items) {
          if (item && item.url) {
            const task = downloadManager.createTask({
              url: item.url,
              fileName: item.fileName,
              referer: item.referer,
              cookies: item.cookies,
              userAgent: item.userAgent
            });
            if (autoStart) {
              task.start();
            }
            createdTasks.push(task.getMeta());
          }
        }

        this.emit('batch-download-request', { count: createdTasks.length });

        res.json({ success: true, count: createdTasks.length, tasks: createdTasks });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // List all downloads
    this.app.get('/downloads', (req, res) => {
      res.json(downloadManager.getAllTasks());
    });

    // Pause download
    this.app.post('/downloads/:id/pause', (req, res) => {
      downloadManager.pauseTask(req.params.id);
      res.json({ success: true });
    });

    // Resume download
    this.app.post('/downloads/:id/resume', (req, res) => {
      downloadManager.startTask(req.params.id);
      res.json({ success: true });
    });

    // Delete download
    this.app.delete('/downloads/:id', (req, res) => {
      const deleteFile = req.query.deleteFile === 'true';
      downloadManager.deleteTask(req.params.id, deleteFile);
      res.json({ success: true });
    });

    // Extension configuration query
    this.app.get('/extension-config', (req, res) => {
      res.json({
        interceptExtensions: storage.settings.interceptExtensions,
        soundsEnabled: storage.settings.soundsEnabled
      });
    });

    // Test Suite Webpage
    this.app.get('/test', (req, res) => {
      const testPagePath = path.join(__dirname, '../../test-page.html');
      res.sendFile(testPagePath);
    });

    // Dynamic Mock Download Files with full HTTP Range support
    this.app.get('/test-files/:filename', (req, res) => {
      const fn = req.params.filename;
      const sizeMap = {
        'archive.zip': 5 * 1024 * 1024,
        'document.pdf': 2 * 1024 * 1024,
        'setup.exe': 8 * 1024 * 1024,
        'song.mp3': 3.5 * 1024 * 1024,
        'sample-video.mp4': 4 * 1024 * 1024
      };

      const totalSize = Math.floor(sizeMap[fn] || 2 * 1024 * 1024);
      const range = req.headers.range;

      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          const chunkSize = (end - start) + 1;
          const chunk = Buffer.alloc(chunkSize, (start % 250) + 1);

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': fn.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fn}"`
          });
          return res.end(chunk);
        }
      }

      res.writeHead(200, {
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': fn.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fn}"`
      });
      const data = Buffer.alloc(totalSize, 42);
      res.end(data);
    });
  }

  start() {
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'initial-state',
        tasks: downloadManager.getAllTasks()
      }));
    });

    // Hook download manager events to WebSocket broadcast
    downloadManager.on('task-progress', (meta) => {
      this.broadcast({ type: 'progress', data: meta });
    });

    downloadManager.on('task-updated', (meta) => {
      this.broadcast({ type: 'updated', data: meta });
    });

    downloadManager.on('task-completed', (meta) => {
      this.broadcast({ type: 'completed', data: meta });
    });

    downloadManager.on('task-deleted', (id) => {
      this.broadcast({ type: 'deleted', id });
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[IDM Engine] Integration API Server listening on http://127.0.0.1:${this.port}`);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[IDM Engine] Port ${this.port} is already in use. Retrying on next port...`);
        this.port += 1;
        this.server.listen(this.port, '127.0.0.1');
      } else {
        console.error('[IDM Engine] Server error:', err);
      }
    });
  }

  broadcast(message) {
    if (!this.wss) return;
    const json = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(json);
      }
    });
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }
}

module.exports = new ApiServer();
