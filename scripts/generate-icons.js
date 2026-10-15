const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(typeAndData), 8 + len);
  return buf;
}

function generateIdmPng(size) {
  const width = size;
  const height = size;

  // Raw uncompressed bitmap with 0 filter byte per line
  const rawLineLen = 1 + width * 4;
  const rawData = Buffer.alloc(rawLineLen * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.46;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rawLineLen;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // IDM Green Globe background
        const borderDist = radius - dist;
        if (borderDist < 1.5) {
          // Dark green border
          rawData[pxOffset] = 4;
          rawData[pxOffset + 1] = 120;
          rawData[pxOffset + 2] = 87;
          rawData[pxOffset + 3] = 255;
        } else {
          // Vibrant IDM emerald gradient
          const normY = y / height;
          const r = Math.floor(16 + normY * 10);
          const g = Math.floor(185 - normY * 50);
          const b = Math.floor(129 - normY * 40);

          // Downward arrow shape in the center
          const inArrowStem = (Math.abs(dx) <= width * 0.12 && dy >= -height * 0.28 && dy <= height * 0.05);
          const inArrowHead = (dy >= height * 0.05 && dy <= height * 0.32 && Math.abs(dx) <= (height * 0.32 - dy) * 1.0);

          if (inArrowStem || inArrowHead) {
            // Crisp White Arrow with subtle highlight
            rawData[pxOffset] = 255;
            rawData[pxOffset + 1] = 255;
            rawData[pxOffset + 2] = 255;
            rawData[pxOffset + 3] = 255;
          } else {
            rawData[pxOffset] = r;
            rawData[pxOffset + 1] = g;
            rawData[pxOffset + 2] = b;
            rawData[pxOffset + 3] = 255;
          }
        }
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  // PNG Header
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Generate icons
const sizes = [16, 32, 48, 128, 256];
sizes.forEach(sz => {
  const buf = generateIdmPng(sz);
  fs.writeFileSync(path.join(__dirname, '..', 'extension', 'icons', `icon${sz}.png`), buf);
});

// App icon (256x256 for Windows NSIS compatibility)
fs.writeFileSync(path.join(__dirname, '..', 'app', 'ui', 'assets', 'icon.png'), generateIdmPng(256));
console.log('Successfully generated all IDM icons including 256x256 Windows installer icon!');
