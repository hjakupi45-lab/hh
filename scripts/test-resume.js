const downloadManager = require('../app/engine/downloader');
const http = require('http');
const fs = require('fs');

async function testResumeCapability() {
  const TEST_SIZE = 12 * 1024 * 1024; // 12MB
  console.log(`Testing Pause & Resume capability with ${TEST_SIZE / 1024 / 1024}MB buffer...`);

  const testData = Buffer.alloc(TEST_SIZE);
  for (let i = 0; i < TEST_SIZE; i++) {
    testData[i] = (i * 7) % 256;
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
          'Content-Type': 'application/octet-stream'
        });
        
        // Slightly chunk the response to let pause happen mid-stream
        const half = Math.floor(chunk.length / 2);
        res.write(chunk.subarray(0, half));
        setTimeout(() => {
          if (!res.destroyed) {
            res.end(chunk.subarray(half));
          }
        }, 120);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Length': TEST_SIZE,
      'Accept-Ranges': 'bytes'
    });
    res.end(testData);
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const url = `http://127.0.0.1:${port}/download_resume`;
  const task = downloadManager.createTask({
    url,
    fileName: 'test_resume_verify.bin',
    maxSegments: 4
  });

  task.start();

  // Wait until it has downloaded part of the file
  await new Promise(resolve => {
    const check = () => {
      if (task.status === 'downloading' && task.downloadedBytes > 0) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });

  console.log(`[Action] Pausing download mid-stream (${(task.downloadedBytes / 1024 / 1024).toFixed(2)} MB downloaded)...`);
  task.pause();
  console.log(`[Status after pause]: ${task.status} (${task.downloadedBytes} bytes cached)`);

  // Wait 100ms
  await new Promise(r => setTimeout(r, 100));

  console.log('[Action] Resuming download...');
  task.start();

  await new Promise((resolve, reject) => {
    task.on('complete', (meta) => {
      console.log('[Complete] File successfully resumed and finished!');
      if (fs.existsSync(meta.filePath)) {
        const diskData = fs.readFileSync(meta.filePath);
        console.log('[Verification] Resumed file size on disk:', diskData.length, 'bytes');

        if (diskData.equals(testData)) {
          console.log('[Verification] 100% Byte-for-byte data integrity verified after Pause & Resume!');
          downloadManager.deleteTask(meta.id, true);
          server.close();
          resolve();
        } else {
          server.close();
          reject(new Error(`Resumed file corrupted! Expected ${testData.length}, got ${diskData.length}`));
        }
      }
    });

    task.on('error', (err) => {
      server.close();
      reject(err);
    });
  });
}

testResumeCapability()
  .then(() => {
    console.log('\nResume capability test PASSED 100%!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Resume test failed:', err);
    process.exit(1);
  });
