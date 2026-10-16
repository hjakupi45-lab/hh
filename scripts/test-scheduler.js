// Scheduler engine verification: config persistence, window math, and events.
const storage = require('../app/engine/storage');
const scheduler = require('../app/engine/scheduler');

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

async function run() {
  console.log('--- Scheduler Engine Tests ---');

  const original = JSON.parse(JSON.stringify(storage.settings.scheduler || {}));

  // 1. Defaults are present
  const cfg = scheduler.getConfig();
  assert(typeof cfg.enabled === 'boolean', 'config has enabled flag');
  assert(/^\d{2}:\d{2}$/.test(cfg.startTime), 'config has valid start time');
  assert(/^\d{2}:\d{2}$/.test(cfg.stopTime), 'config has valid stop time');

  // 2. Saving config persists
  scheduler.saveConfig({ enabled: true, startTime: '02:30', stopTime: '05:15', onStop: 'shutdown' });
  const reloaded = require('../app/engine/storage').settings.scheduler;
  assert(reloaded.enabled === true, 'enabled persisted');
  assert(reloaded.startTime === '02:30', 'start persisted');
  assert(reloaded.stopTime === '05:15', 'stop persisted');
  assert(reloaded.onStop === 'shutdown', 'stop action persisted');

  // 3. Status shape
  const status = scheduler.getStatus();
  assert(status.config && typeof status.currentTime === 'string', 'status returns config + current time');
  assert(typeof status.inWindow === 'boolean', 'status returns inWindow flag');

  // 4. Window math around midnight and edge cases
  scheduler.saveConfig({ enabled: true, startTime: '00:00', stopTime: '23:59' });
  const s = scheduler.getStatus();
  assert(s.inWindow === true, '00:00-23:59 window is active for current time');

  scheduler.saveConfig({ enabled: true, startTime: '03:00', stopTime: '03:00' });
  assert(scheduler.getStatus().inWindow === false, 'zero-length window is never active');

  // 5. Restore original scheduler config
  scheduler.saveConfig(original);
  console.log('\n--- Scheduler Engine Tests Complete ---');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('All scheduler tests passed cleanly!');
  process.exit(0);
}

run().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
