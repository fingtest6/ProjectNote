const fs = require('fs');
const path = require('path');

const pngSourcePath = path.join(__dirname, '../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png');
const pngBuffer = fs.readFileSync(pngSourcePath);

// Create ICO containing the PNG
function createIcoFromPng(buffer, width = 192, height = 192) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(buffer.length, 8); // image size
  entry.writeUInt32LE(22, 12); // image offset (6 + 16)

  return Buffer.concat([header, entry, buffer]);
}

const icoBuffer = createIcoFromPng(pngBuffer);

// Save to multiple needed locations
const locations = [
  path.join(__dirname, '../public/icon.png'),
  path.join(__dirname, '../public/favicon.ico'),
  path.join(__dirname, '../electron/icon.png'),
  path.join(__dirname, '../electron/icon.ico'),
  path.join(__dirname, '../icon.ico'),
  path.join(__dirname, '../icon.png'),
];

for (const loc of locations) {
  const dir = path.dirname(loc);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (loc.endsWith('.ico')) {
    fs.writeFileSync(loc, icoBuffer);
  } else {
    fs.writeFileSync(loc, pngBuffer);
  }
  console.log('Saved icon to:', loc);
}
