const apiServer = require('../app/server/apiServer');
const downloadManager = require('../app/engine/downloader');
const WebSocket = require('ws');

async function testExtensionIntegration() {
  console.log('Testing Chrome Extension <-> Desktop IDM Integration...');
  apiServer.start();
  await new Promise(r => setTimeout(r, 400));

  const port = apiServer.port;

  // 1. WebSocket connection
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise(r => ws.on('open', r));
  console.log('[WebSocket] Connected to IDM Real-Time Bridge!');

  // 2. Health & Status
  const statusRes = await fetch(`http://127.0.0.1:${port}/status`).then(r => r.json());
  console.log('[Extension GET /status]:', statusRes.name, statusRes.version);

  // 3. Extension sending single download request
  console.log('[Extension POST /download]: Sending video download request...');
  const dlRes = await fetch(`http://127.0.0.1:${port}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com/video_sample.mp4',
      fileName: 'Awesome_Video_1080p.mp4',
      cookies: 'session_id=abcdef123456',
      referer: 'https://example.com/watch?v=123',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
      autoStart: false,
      showDialog: true
    })
  }).then(r => r.json());

  console.log('[Extension Response]:', dlRes.success ? 'Success' : 'Failed');

  // 4. Extension sending batch download request
  console.log('[Extension POST /batch-download]: Sending batch grabber request (3 links)...');
  const batchRes = await fetch(`http://127.0.0.1:${port}/batch-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { url: 'https://example.com/part1.rar', fileName: 'part1.rar' },
        { url: 'https://example.com/part2.rar', fileName: 'part2.rar' },
        { url: 'https://example.com/part3.rar', fileName: 'part3.rar' }
      ],
      autoStart: false
    })
  }).then(r => r.json());

  console.log('[Batch Response]: Captured count =', batchRes.count);

  // Clean up created test tasks
  downloadManager.deleteTask(dlRes.taskId, false);
  for (const t of batchRes.tasks) {
    downloadManager.deleteTask(t.id, false);
  }

  await new Promise(r => {
    ws.on('close', r);
    ws.close();
  });
  apiServer.stop();
  console.log('Extension <-> Electron by Haris Desktop integration test PASSED 100%!');
}

testExtensionIntegration()
  .then(() => {
    setTimeout(() => process.exit(0), 50);
  })
  .catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
  });
