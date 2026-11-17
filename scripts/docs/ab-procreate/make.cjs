// Draws the stroke Procreate drew for its own picture of a brush (QuickLook/Thumbnail.png in the file) again with Frameling's
// engine, and lays the two beside each other: the way the units for size, spacing and scatter were settled (see
// docs/brush-import.md). No Electron and no screen are needed: the real importer and the real stroke engine run in Node.
//   node scripts/docs/ab-procreate/make.cjs <bundled entry.cjs> <out dir>      (make.sh does the whole thing)
// Writes <out>/<brush>-<theme>-<panel>.png and layout.json for compose.py.
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync } = require('fflate');
const E = require(process.argv[2]);
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const FX = path.join(__dirname, '../../../test/fixtures/brushes/procreate');

const THEMES = { dark: { bg: [30, 29, 36], ink: [239, 233, 218] }, light: { bg: [250, 246, 238], ink: [29, 28, 33] } };

// Where each stroke ran in Procreate's thumbnail (centres of the dabs, read off the picture), in thumbnail pixels, and how big
// the visible part of one dab is there (the tip's longer side).
// `first` is the first guess from the research notes: the file's own spacing and scatter, used as they are.
const BRUSHES = {
  Sequins: { dab: 57, first: { spacing: 1.006, scatter: 0.877 }, strokes: [{ pts: [[18, 168], [372, 168]] }] },
  Plain_Stitch: {
    dab: 34,
    first: { spacing: 0.551, scatter: 0 },
    strokes: [
      { pts: [[41.5, 181], [69, 159], [100.5, 142], [134, 129], [167.5, 119], [203, 113.5]] },
      { pts: [[163.5, 170], [190, 146]] },
      { pts: [[199, 172], [235, 174], [270, 170.5], [305.5, 167.5], [341, 169], [376.5, 171]] },
    ],
  },
  Seed: { dab: 190, first: { spacing: 0.05, scatter: 0 }, strokes: [{ pts: null, seed: true }] },
};

// Seed's thumbnail is a ribbon: the path and the press are read from how thick and how faint it is, column by column.
function seedStroke(thumb) {
  const { width: W, height: H, pixels: px } = thumb;
  const colInfo = (x) => {
    let top = -1, bot = -1, mx = 0;
    for (let y = 0; y < H; y++) {
      const a = px[(y * W + x) * 4 + 3] / 255;
      if (a > 0.05) { if (top < 0) top = y; bot = y; }
      if (a > mx) mx = a;
    }
    return { y: (top + bot) / 2, a: mx };
  };
  const half = 95;
  const pts = [];
  for (let c = 116; c <= 949; c += 8) {
    const here = colInfo(c);
    // A column's faintness is the brightest dab that reaches it: the one on the side the press is rising toward.
    const a = c < 540 ? colInfo(c - half).a : colInfo(Math.min(W - 1, c + half)).a;
    pts.push([c, here.y, a]);
  }
  return pts;
}

/** Points along a line a pixel or two apart, so the engine sees a steady hand. */
function along(pts, step = 2) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0, p0 = 1] = pts[i];
    const [x1, y1, p1 = 1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, p0 + ((p1 - p0) * k) / n]);
  }
  return out;
}

function render(dab, strokes, W, H, ink) {
  const px = new Uint8ClampedArray(W * H * 4);
  const surf = E.bufferSurface(px, W, H);
  for (const st of strokes) {
    const s = new E.DabStroke(surf, { brush: dab, color: [...ink, 255], edge: 'smooth', seed: 7 });
    for (const [x, y, p] of along(st)) s.moveTo({ x, y }, dab.size, 1, { pressure: p, speed: 0.4 });
    s.finish();
  }
  return px;
}

const over = (rgba, W, H, bg, ink, asAlpha) => {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const c = asAlpha ? ink : [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(bg[k] * (1 - a) + c[k] * a);
    out[i * 4 + 3] = 255;
  }
  return out;
};

const layout = {};
for (const [name, b] of Object.entries(BRUSHES)) {
  const file = path.join(FX, `${name}.brush`);
  const bytes = new Uint8Array(fs.readFileSync(file));
  const res = E.readBrushFile(bytes, `${name}.brush`);
  if (!res.ok) throw new Error(`${name}: ${res.error}`);
  const imported = res.brushes[0].dab;
  const zip = unzipSync(bytes);
  const thumb = E.decodePng(new Uint8Array(zip['QuickLook/Thumbnail.png']));
  const { width: W, height: H } = thumb;
  const strokes = b.strokes.map((s) => (s.seed ? seedStroke(thumb) : s.pts.map(([x, y]) => [x, y, 1])));
  // B: the brush as it comes in, size and all. The size is measured off this same thumbnail now, so nothing is forced:
  // `b.dab` stays here only as the size that was read off the picture by hand, to check the measuring against.
  const settled = imported;
  // A: the first guess from the research notes, at the same size.
  const guess = { ...settled, size: b.dab, spacing: Math.min(4, Math.max(0.05, b.first.spacing)), scatter: b.first.scatter };
  layout[name] = { dab: b.dab, measured: imported.size, imported: { size: imported.size, spacing: imported.spacing, scatter: imported.scatter, follow: imported.follow, dynamics: imported.dynamics.length }, first: b.first, thumb: { w: W, h: H } };
  for (const [theme, t] of Object.entries(THEMES)) {
    const save = (panel, rgba) => fs.writeFileSync(path.join(OUT, `${name}-${theme}-${panel}.png`), E.encodePng({ width: W, height: H, pixels: rgba }));
    save('thumb', over(thumb.pixels, W, H, t.bg, t.ink, true));
    save('first', over(render(guess, strokes, W, H, t.ink), W, H, t.bg, t.ink, true));
    save('ours', over(render(settled, strokes, W, H, t.ink), W, H, t.bg, t.ink, true));
  }
}
fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, 1));
