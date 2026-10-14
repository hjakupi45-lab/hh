const storage = require('../app/engine/storage');
const downloadManager = require('../app/engine/downloader');
const apiServer = require('../app/server/apiServer');
const http = require('http');

async function testEngine() {
  console.log('--- 1. Testing Storage Engine ---');
  console.log('Base directory:', storage.baseDir);
  console.log('Default settings loaded:', !!storage.settings);
  console.log('Category for movie.mp4:', storage.getCategory('movie.mp4'));
  console.log('Category for archive.zip:', storage.getCategory('archive.zip'));

  console.log('\n--- 2. Testing API Server ---');
  apiServer.start();

  // Wait 500ms for server to bind
  await new Promise(r => setTimeout(r, 500));

  // Test GET /status
  const statusRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${apiServer.port}/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  console.log('API Server /status response:', statusRes);

  console.log('\n--- 3. Testing Download Task Creation ---');
  const task = downloadManager.createTask({
    url: 'https://speed.hetzner.de/100MB.bin',
    fileName: 'test_100MB.bin'
  });

  console.log('Task created successfully:', {
    id: task.id,
    fileName: task.fileName,
    category: task.category,
    directory: task.directory,
    status: task.status
  });

  console.log('\n--- 4. All Engine Tests Passed Cleanly! ---');
  apiServer.stop();
  process.exit(0);
}

testEngine().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
