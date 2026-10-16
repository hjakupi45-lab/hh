// Speed Limiter verification.
//
// Downloads the same file twice from a local HTTP server: once unlimited and
// once with the global speed limiter enabled. Because the OS socket buffers
// absorb a bounded burst on localhost, the assertion is relative: the throttled
// run must be substantially slower than the unlimited baseline and stay within
// a sane multiple of the configured cap.
const path = require('path');
const http = require('http');
const storage = require('../app/engine/storage');
const downloadManager = require('../app/engine/downloader');

const SIZE = 4 * 1024 * 1024; // 4 MB
const LIMIT_KB = 256;
const CHUNK = 16 * 1024;

function writeSlowly(res, buffer, offset) {
  if (offset >= buffer.length) return res.end();
  const end = Math.min(offset + CHUNK, buffer.length);
  res.write(buffer.subarray(offset, end));
  setImmediate(() => writeSlowly(res, buffer, end));
}

function startServer(data) {
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : SIZE - 1;
      const chunk = data.subarray(start, end + 1);
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${SIZE}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunk.length });
      return writeSlowly(res, chunk, 0);
    }
    res.writeHead(200, { 'Content-Length': SIZE, 'Accept-Ranges': 'bytes' });
    writeSlowly(res, data, 0);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function runDownload(port, tag) {
  const task = downloadManager.createTask({
    url: `http://127.0.0.1:${port}/file.bin`,
    fileName: `limiter_${tag}.bin`,
    maxSegments: 2
  });
  const started = Date.now();
  await new Promise((resolve, reject) => {
    task.on('complete', resolve);
    task.on('error', reject);
    task.start();
  });
  const sec = (Date.now() - started) / 1000;
  const kbps = (SIZE / 1024) / sec;
  downloadManager.deleteTask(task.id, true);
  return kbps;
}

(async () => {
  console.log('--- Speed Limiter Tests ---');
  const data = Buffer.alloc(SIZE, 7);
  const server = await startServer(data);
  const port = server.address().port;

  const original = {
    speedLimiterEnabled: storage.settings.speedLimiterEnabled,
    speedLimitKBps: storage.settings.speedLimitKBps
  };

  // Baseline: unlimited
  storage.settings.speedLimiterEnabled = false;
  const baseline = await runDownload(port, 'baseline');
  console.log(`  Unlimited baseline: ${baseline.toFixed(0)} KB/s`);

  // Throttled
  storage.settings.speedLimiterEnabled = true;
  storage.settings.speedLimitKBps = LIMIT_KB;
  const throttled = await runDownload(port, 'throttled');
  console.log(`  Throttled (${LIMIT_KB} KB/s): ${throttled.toFixed(0)} KB/s`);

  server.close();

  storage.settings.speedLimiterEnabled = original.speedLimiterEnabled;
  storage.settings.speedLimitKBps = original.speedLimitKBps;
  storage.saveSettings({});

  let failures = 0;
  if (throttled < baseline * 0.6) {
    console.log('  PASS  throttled run is clearly slower than unlimited');
  } else {
    failures++;
    console.log('  FAIL  throttled run was not slower than unlimited');
  }
  if (throttled <= LIMIT_KB * 2.5) {
    console.log('  PASS  throttled throughput within tolerance of the cap');
  } else {
    failures++;
    console.log('  FAIL  throttled throughput far exceeds the cap');
  }

  console.log('\n--- Speed Limiter Tests Complete ---');
  if (failures > 0) {
    console.error(`${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('All speed limiter tests passed cleanly!');
  process.exit(0);
})().catch(e => { console.error('Test crashed:', e); process.exit(1); });
