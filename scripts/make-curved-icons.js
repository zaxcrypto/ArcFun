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
  console.log('1. Loading original pristine rocket logo...');
  const cropLeft = Math.round(306.5 - 273); // 34px

  // Clean 1:1 square centered on rocket
  const squareOriginal = await sharp('orig_rocket.png')
    .extract({ left: cropLeft, top: 0, width: 546, height: 546 })
    .resize(512, 512, { kernel: 'lanczos3' })
    .toBuffer();

  const size = 512;
  // Transparent padding: 18px (just enough so corners float with visible curve, while maximizing rocket size and sharpness!)
  const pad = 18;
  const boxSize = size - pad * 2; // 476px
  const radius = Math.round(boxSize * 0.24); // 114px

  const svgMask = Buffer.from(
    '<svg width="' + size + '" height="' + size + '">' +
    '<rect x="' + pad + '" y="' + pad + '" width="' + boxSize + '" height="' + boxSize + '" rx="' + radius + '" ry="' + radius + '" fill="white"/>' +
    '</svg>'
  );

  console.log('2. Masking with squircle curve...');
  const curvedMaster = await sharp(squareOriginal)
    .composite([{ input: svgMask, blend: 'dest-in' }])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // Save 512x512
  fs.writeFileSync('public/icon-512x512.png', curvedMaster);
  fs.writeFileSync('public/rocket-logo.png', curvedMaster);

  // 192x192
  const p192 = await sharp(curvedMaster)
    .resize(192, 192, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  fs.writeFileSync('public/icon-192x192.png', p192);
  fs.writeFileSync('src/app/icon.png', p192);

  // Apple Touch Icon (180x180)
  const p180 = await sharp(curvedMaster)
    .resize(180, 180, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  fs.writeFileSync('public/apple-touch-icon.png', p180);
  fs.writeFileSync('src/app/apple-icon.png', p180);

  // 48x48 (Crucial for Windows Chrome tabs at 125%/150% DPI - prevents blurry scaling!)
  const p48 = await sharp(curvedMaster)
    .resize(48, 48, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.9, m1: 1.5, m2: 0.7 })
    .png()
    .toBuffer();
  fs.writeFileSync('public/favicon-48x48.png', p48);

  // 32x32 (Crisp for standard DPI)
  const p32 = await sharp(curvedMaster)
    .resize(32, 32, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.8, m1: 1.4, m2: 0.6 })
    .png()
    .toBuffer();
  fs.writeFileSync('public/favicon-32x32.png', p32);

  // 16x16 (Sharpened)
  const p16 = await sharp(curvedMaster)
    .resize(16, 16, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.7, m1: 1.6, m2: 0.8 })
    .png()
    .toBuffer();
  fs.writeFileSync('public/favicon-16x16.png', p16);

  // Multi-res ICO
  const ico = buildIco([
    { width: 16, height: 16, buffer: p16 },
    { width: 32, height: 32, buffer: p32 },
    { width: 48, height: 48, buffer: p48 },
  ]);
  fs.writeFileSync('public/favicon.ico', ico);
  fs.writeFileSync('src/app/favicon.ico', ico);

  // Remove problematic pseudo-SVGs so Chrome uses the pristine sharpened PNGs
  try { fs.unlinkSync('public/icon.svg'); } catch {}
  try { fs.unlinkSync('public/favicon.svg'); } catch {}

  console.log('✓ All icons regenerated with high-contrast, razor-sharp Lanczos3 + unsharp mask!');
}

run().catch(console.error);
