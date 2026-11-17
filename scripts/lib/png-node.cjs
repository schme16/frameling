// Plain Node PNG reading, writing and comparing, for harnesses on a machine without ImageMagick (Windows).
// Reads 8-bit, non-interlaced grey, grey+alpha, RGB, RGBA and palette PNGs; that covers Frameling's, Illustrator's and
// Photoshop's PNGs. Anything else throws.
const fs = require('node:fs');
const zlib = require('node:zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** { width, height, pixels: RGBA bytes } */
function readPng(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let at = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const kind = b.toString('latin1', at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') [w, h, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !bpp) throw new Error(`${file}: only 8-bit non-interlaced PNGs are read (depth ${depth}, type ${type}, interlace ${interlace})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const lines = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const up = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const u = up ? up[x] : 0;
      const c = up && x >= bpp ? up[x - bpp] : 0;
      let p = src[x];
      if (f === 1) p += a;
      else if (f === 2) p += u;
      else if (f === 3) p += (a + u) >> 1;
      else if (f === 4) {
        const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c);
        p += pa <= pb && pa <= pc ? a : pb <= pc ? u : c;
      }
      out[x] = p & 255;
    }
  }
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp;
    if (type === 6) pixels.set(lines.subarray(s, s + 4), i * 4);
    else if (type === 2) pixels.set([lines[s], lines[s + 1], lines[s + 2], 255], i * 4);
    else if (type === 0) pixels.set([lines[s], lines[s], lines[s], 255], i * 4);
    else if (type === 4) pixels.set([lines[s], lines[s], lines[s], lines[s + 1]], i * 4);
    else {
      const k = lines[s];
      pixels.set([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], trns && k < trns.length ? trns[k] : 255], i * 4);
    }
  }
  return { width: w, height: h, pixels };
}

function writePng(file, img) {
  const { width: w, height: h, pixels } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(pixels.buffer, pixels.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (kind, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(kind, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** The picture laid on a solid colour, alpha 255 everywhere (ImageMagick's -background c -alpha remove). */
function flatten(img, rgb) {
  const out = new Uint8ClampedArray(img.pixels.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = img.pixels[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(img.pixels[i + c] * a + rgb[c] * (1 - a));
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, pixels: out };
}

/** Normalised RMSE (0 to 1) over red, green and blue, both laid on magenta so see-through counts. Like ImageMagick's compare -metric RMSE. */
function rmse(fileA, fileB) {
  const a = flatten(readPng(fileA), [255, 0, 255]);
  const b = flatten(readPng(fileB), [255, 0, 255]);
  const size = [`${a.width} ${a.height}`, `${b.width} ${b.height}`];
  if (size[0] !== size[1]) return { size, rmse: null };
  let sum = 0;
  for (let i = 0; i < a.pixels.length; i += 4) for (let c = 0; c < 3; c++) sum += ((a.pixels[i + c] - b.pixels[i + c]) / 255) ** 2;
  return { size, rmse: Math.sqrt(sum / ((a.pixels.length / 4) * 3)) };
}

/** Two pictures side by side on magenta, with a grey border round each, no caption. */
function sideBySide(fileA, fileB, out) {
  const pics = [fileA, fileB].map((f) => flatten(readPng(f), [255, 0, 255]));
  const pad = 2;
  const w = pics.reduce((n, p) => n + p.width + pad * 2, 0);
  const h = Math.max(...pics.map((p) => p.height)) + pad * 2;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) px.set([0x44, 0x44, 0x44, 255], i);
  let x0 = 0;
  for (const p of pics) {
    for (let y = 0; y < p.height; y++) px.set(p.pixels.subarray(y * p.width * 4, (y + 1) * p.width * 4), ((y + pad) * w + x0 + pad) * 4);
    x0 += p.width + pad * 2;
  }
  writePng(out, { width: w, height: h, pixels: px });
}

module.exports = { readPng, writePng, flatten, rmse, sideBySide };
