const fs = require('fs');
const sharp = require('sharp');

function buildIco(pngBuffers) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + numImages * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type (1 = ICO)
  header.writeUInt16LE(numImages, 4);

  const entries = [];
  for (const img of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((i) => i.buffer)]);
}

async function run() {
  console.log('Deploying 100% pure vector SVG and razor-sharp rendered icons...');
  const svgContent = fs.readFileSync('test_vector.svg', 'utf8');

  // 1. Pure Vector SVGs
  fs.writeFileSync('public/icon.svg', svgContent);
  fs.writeFileSync('public/favicon.svg', svgContent);
  console.log('✓ public/icon.svg & public/favicon.svg (Pure Vector SVG)');

  // 2. High-DPI Vector-rendered PNGs
  const svgBuf = Buffer.from(svgContent);

  const p512 = await sharp(svgBuf).resize(512, 512).png().toBuffer();
  fs.writeFileSync('public/icon-512x512.png', p512);
  fs.writeFileSync('public/rocket-logo.png', p512);

  const p192 = await sharp(svgBuf).resize(192, 192).png().toBuffer();
  fs.writeFileSync('public/icon-192x192.png', p192);
  fs.writeFileSync('src/app/icon.png', p192);

  const p180 = await sharp(svgBuf).resize(180, 180).png().toBuffer();
  fs.writeFileSync('public/apple-touch-icon.png', p180);
  fs.writeFileSync('src/app/apple-icon.png', p180);

  const p48 = await sharp(svgBuf).resize(48, 48).png().toBuffer();
  fs.writeFileSync('public/favicon-48x48.png', p48);

  const p32 = await sharp(svgBuf).resize(32, 32).png().toBuffer();
  fs.writeFileSync('public/favicon-32x32.png', p32);

  const p16 = await sharp(svgBuf).resize(16, 16).png().toBuffer();
  fs.writeFileSync('public/favicon-16x16.png', p16);

  // 3. Multi-resolution ICO
  const ico = buildIco([
    { width: 16, height: 16, buffer: p16 },
    { width: 32, height: 32, buffer: p32 },
    { width: 48, height: 48, buffer: p48 },
  ]);
  fs.writeFileSync('public/favicon.ico', ico);
  fs.writeFileSync('src/app/favicon.ico', ico);

  console.log('✓ All PNGs and multi-res favicon.ico updated with pure vector precision!');
}

run().catch(console.error);
