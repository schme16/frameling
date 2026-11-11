// An example Frameling plugin: two exports that lay every frame out on one page, numbered. Frameling draws the frames
// and hands them over as RGBA pictures; this makes a PNG (Frameling encodes it) or a small PDF.

const THUMB = 240; // longest side of each little picture
const GAP = 16;
const LABEL = 22;
const HEAD = 44;

function layout(frames) {
  const n = frames.length;
  const w = frames[0].width;
  const h = frames[0].height;
  const s = Math.min(1, THUMB / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(h * s));
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * (th + LABEL) / tw))));
  const rows = Math.ceil(n / cols);
  return { tw, th, cols, rows, width: GAP + cols * (tw + GAP), height: HEAD + rows * (th + LABEL + GAP) };
}

// With OffscreenCanvas (always there in Frameling's sandbox): smooth scaling and numbers under each frame.
async function drawWithCanvas(frames, info, L) {
  const c = new OffscreenCanvas(L.width, L.height);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, L.width, L.height);
  g.fillStyle = '#1d1b26';
  g.font = 'bold 16px sans-serif';
  g.textBaseline = 'middle';
  g.fillText(info.name, GAP, HEAD / 2);
  g.font = '12px sans-serif';
  g.fillStyle = '#6b6878';
  const about = `${frames.length} frames at ${info.fps} fps`;
  g.fillText(about, L.width - GAP - g.measureText(about).width, HEAD / 2);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const x = GAP + (i % L.cols) * (L.tw + GAP);
    const y = HEAD + Math.floor(i / L.cols) * (L.th + LABEL + GAP);
    const bmp = await createImageBitmap(new ImageData(f.data, f.width, f.height));
    g.fillStyle = '#f1eff5';
    g.fillRect(x, y, L.tw, L.th);
    g.imageSmoothingEnabled = L.tw < f.width;
    g.drawImage(bmp, x, y, L.tw, L.th);
    bmp.close();
    g.strokeStyle = '#d9d6e0';
    g.strokeRect(x + 0.5, y + 0.5, L.tw - 1, L.th - 1);
    g.fillStyle = '#6b6878';
    g.fillText(String(info.frameNumbers[i] + 1), x, y + L.th + LABEL / 2 + 1);
  }
  return { width: L.width, height: L.height, data: g.getImageData(0, 0, L.width, L.height).data };
}

// Without a canvas: nearest-pixel scaling and no numbers. Same layout.
function drawPlain(frames, L) {
  const out = new Uint8ClampedArray(L.width * L.height * 4).fill(255);
  frames.forEach((f, i) => {
    const x0 = GAP + (i % L.cols) * (L.tw + GAP);
    const y0 = HEAD + Math.floor(i / L.cols) * (L.th + LABEL + GAP);
    for (let y = 0; y < L.th; y++) {
      const sy = Math.min(f.height - 1, Math.floor((y * f.height) / L.th));
      for (let x = 0; x < L.tw; x++) {
        const sx = Math.min(f.width - 1, Math.floor((x * f.width) / L.tw));
        const s = (sy * f.width + sx) * 4;
        const d = ((y0 + y) * L.width + x0 + x) * 4;
        const a = f.data[s + 3] / 255;
        for (let k = 0; k < 3; k++) out[d + k] = Math.round(f.data[s + k] * a + 241 * (1 - a));
      }
    }
  });
  return { width: L.width, height: L.height, data: out };
}

async function sheet(frames, info) {
  if (!frames.length) throw new Error('There are no frames to lay out.');
  const L = layout(frames);
  return typeof OffscreenCanvas === 'function' ? drawWithCanvas(frames, info, L) : drawPlain(frames, L);
}

// ---------------------------------------------------------------- a one-page PDF with the sheet as a picture

const enc = new TextEncoder();

async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function pdf(img) {
  // PDF pictures have no see-through, so drop the alpha (the sheet is on white already).
  const rgb = new Uint8Array(img.width * img.height * 3);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) {
    rgb[j] = img.data[i];
    rgb[j + 1] = img.data[i + 1];
    rgb[j + 2] = img.data[i + 2];
  }
  const pic = await deflate(rgb);
  // 96 pixels to the inch on screen, 72 points to the inch on paper.
  const W = (img.width * 0.75).toFixed(2);
  const H = (img.height * 0.75).toFixed(2);
  const draw = enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`);
  const parts = [];
  const offsets = [];
  let size = 0;
  const add = (b) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    size += u.length;
  };
  const obj = (n, head, stream) => {
    offsets[n] = size;
    add(`${n} 0 obj\n${head}\n`);
    if (stream) {
      add('stream\n');
      add(stream);
      add('\nendstream\n');
    }
    add('endobj\n');
  };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pic.length} >>`, pic);
  obj(5, `<< /Length ${draw.length} >>`, draw);
  const xref = size;
  add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

frameling.exporters.register(
  { id: 'png', label: 'Contact sheet (PNG)', description: 'Every frame on one numbered picture.', extension: 'png', transparent: false },
  async (frames, info) => [{ name: `${info.name}-contact-sheet.png`, image: await sheet(frames, info) }],
);

frameling.exporters.register(
  { id: 'pdf', label: 'Contact sheet (PDF)', description: 'Every frame on one numbered page, ready to print.', extension: 'pdf', transparent: false },
  async (frames, info) => [{ name: `${info.name}-contact-sheet.pdf`, bytes: await pdf(await sheet(frames, info)) }],
);
