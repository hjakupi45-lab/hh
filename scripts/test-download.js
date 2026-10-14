const downloadManager = require('../app/engine/downloader');
const fs = require('fs');

async function testRealDownload() {
  console.log('Testing real multi-part download...');
  
  // Public test file with range support
  const url = 'https://raw.githubusercontent.com/torvalds/linux/master/README';
  const task = downloadManager.createTask({
    url,
    fileName: 'TEST_LINUX_README.md',
    maxSegments: 4
  });

  task.on('status-change', (meta) => {
    console.log(`[Status Change] -> ${meta.status} (Downloaded: ${meta.downloadedBytes} / ${meta.totalBytes})`);
  });

  task.on('progress', (meta) => {
    console.log(`[Progress] ${meta.percent}% | Speed: ${meta.speed} B/s | ETA: ${meta.eta}s`);
  });

  return new Promise((resolve, reject) => {
    task.on('complete', (meta) => {
      console.log('[Complete] File successfully downloaded to:', meta.filePath);
      if (fs.existsSync(meta.filePath)) {
        const size = fs.statSync(meta.filePath).size;
        console.log('[Verification] File size on disk:', size, 'bytes');
        // Clean up test file
        downloadManager.deleteTask(meta.id, true);
        console.log('[Cleanup] Test file removed.');
        resolve();
      } else {
        reject(new Error('Downloaded file not found on disk!'));
      }
    });

    task.on('error', (err) => {
      reject(err);
    });

    task.start();
  });
}

testRealDownload()
  .then(() => {
    console.log('Multi-part download test PASSED 100%!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Download test failed:', err);
    process.exit(1);
  });
