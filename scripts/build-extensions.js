// Builds browser-specific extension packages from the shared `extension/` source.
//
//   build/extensions/chrome   - Chrome / Chromium (MV3, service worker)
//   build/extensions/edge     - Microsoft Edge (identical Chromium package)
//   build/extensions/firefox  - Firefox (MV3 event page + promise polyfill)
//
// Usage: node scripts/build-extensions.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'build', 'extensions');

const GECKO_ID = 'electron-by-haris@haris.local';

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function copySource(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(SRC, targetDir, { recursive: true });
}

function buildChromium(id) {
  const targetDir = path.join(OUT, id);
  copySource(targetDir);

  const manifest = readManifest();
  // Edge uses the exact Chrome package; only the product name is adjusted.
  if (id === 'edge') {
    manifest.name = 'Electron by Haris - Download Integration (Edge)';
  }
  // Chromium builds use the MV3 service worker defined in the source manifest.
  writeManifest(targetDir, manifest);
  return targetDir;
}

function buildFirefox() {
  const targetDir = path.join(OUT, 'firefox');
  copySource(targetDir);

  const manifest = readManifest();
  // Firefox MV3 runs a non-persistent event page rather than a service worker.
  manifest.background = {
    scripts: ['polyfill.js', 'background.js']
  };
  manifest.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: '109.0'
    }
  };
  writeManifest(targetDir, manifest);
  return targetDir;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = [
    buildChromium('chrome'),
    buildChromium('edge'),
    buildFirefox()
  ];
  console.log('Built extension packages:');
  results.forEach((r) => console.log('  ' + path.relative(ROOT, r)));
}

main();
