const downloadManager = require('../app/engine/downloader');
const http = require('http');
const fs = require('fs');

async function testSegmentedDownloadWithLocalServer() {
  const TEST_SIZE = 10 * 1024 * 1024; // 10MB
  console.log(`Spinning up local HTTP server serving ${TEST_SIZE / 1024 / 1024}MB buffer with Range support...`);

  // Fill a 10MB buffer with recognizable pattern
  const testData = Buffer.alloc(TEST_SIZE);
  for (let i = 0; i < TEST_SIZE; i++) {
    testData[i] = (i % 256);
  }

  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : TEST_SIZE - 1;
        const chunk = testData.subarray(start, end + 1);

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${TEST_SIZE}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="local_test_file.bin"'
        });
        res.end(chunk);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Length': TEST_SIZE,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="local_test_file.bin"'
    });
    res.end(testData);
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  const url = `http://127.0.0.1:${port}/download`;
  const task = downloadManager.createTask({
    url,
    fileName: 'local_test_file.bin',
    maxSegments: 8
  });

  task.on('status-change', (meta) => {
    console.log(`[Status Change] -> ${meta.status} (Downloaded: ${(meta.downloadedBytes / (1024*1024)).toFixed(2)} MB / ${(meta.totalBytes / (1024*1024)).toFixed(2)} MB)`);
    if (meta.segments && meta.segments.length > 0) {
      console.log(`[Segments Initialized]: ${meta.segments.length} parallel parts`);
    }
  });

  task.on('progress', (meta) => {
    const segStatus = meta.segments.map(s => `P${s.index+1}:${s.percent}%`).join(' ');
    console.log(`[Progress] ${meta.percent}% | Segments: [${segStatus}]`);
  });

  return new Promise((resolve, reject) => {
    task.on('complete', (meta) => {
      console.log('[Complete] 10MB File successfully downloaded and assembled!');
      if (fs.existsSync(meta.filePath)) {
        const diskData = fs.readFileSync(meta.filePath);
        console.log('[Verification] Exact file size on disk:', diskData.length, 'bytes');

        // Verify data integrity byte for byte!
        if (diskData.equals(testData)) {
          console.log('[Verification] 100% Byte-for-byte data integrity verified!');
        } else {
          return reject(new Error('Data integrity mismatch!'));
        }

        downloadManager.deleteTask(meta.id, true);
        console.log('[Cleanup] Test file removed.');
        server.close();
        resolve();
      } else {
        reject(new Error('Downloaded file not found!'));
      }
    });

    task.on('error', (err) => {
      server.close();
      reject(err);
    });

    task.start();
  });
}

testSegmentedDownloadWithLocalServer()
  .then(() => {
    console.log('\nSegmented download test PASSED 100%!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Segmented download test failed:', err);
    process.exit(1);
  });
