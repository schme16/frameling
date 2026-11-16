// Pictures to convert, for the Turn into pixels and Turn into shapes help and A/B entries (files starting with _ aren't entries).
// Each export is a string of page code (L.js) that sets the document up.
const L = require('./_lib.cjs');
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const shape = (paths, fill, stroke, width = 8) => ({ id: `cv${++nid}`, type: 'path', paths, fill, stroke: stroke ? { color: stroke, width, join: 'round', cap: 'round' } : null, opacity: 1 });
const ell = (x, y, w, h, fill, sw = 8) => shape([ellPath(x, y, w, h)], fill, sw ? INK : null, sw);
const smile = shape([{ closed: false, points: [{ x: 590, y: 400, c1: { x: 590, y: 400 }, c2: { x: 590, y: 400 } }, { x: 690, y: 400, c1: { x: 610, y: 450 }, c2: { x: 670, y: 450 } }] }], null, INK, 9);

// A round blue character with a leaf on its head, drawn as shapes.
const CHARACTER = [
  ell(500, 220, 280, 260, '#8fd0ff'),
  ell(560, 300, 52, 66, '#ffffff', 6),
  ell(668, 300, 52, 66, '#ffffff', 6),
  ell(580, 322, 16, 28, INK, 0),
  ell(688, 322, 16, 28, INK, 0),
  ell(528, 380, 46, 28, '#ff9db5', 0),
  ell(706, 380, 46, 28, '#ff9db5', 0),
  smile,
  ell(610, 168, 60, 80, '#5fcf7a', 7),
];

/** The character on the Lines layer of a blank vector document, that layer picked. */
const vectorCharacter = L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(CHARACTER)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.name === 'Lines') ?? S.get().doc.layers[0]; S.setUi({ activeLayerId: l.id, frame: 0 }); })()`);

// A 16 by 16 mushroom for the pixel art case.
const MUSH = [
  '.....DDDDDD.....',
  '...DDRRRRRRDD...',
  '..DRRWWRRRRRRD..',
  '.DRRWWWRRRWWRRD.',
  '.DRRRWRRRRWWRRD.',
  'DRRRRRRRRRRRRRRD',
  'DRWWRRRWWRRRWWRD',
  'DRWWRRRWWRRRWWRD',
  'DRRRRRRRRRRRRRRD',
  '.DDDDDDDDDDDDDD.',
  '....DSSSSSSD....',
  '....DSSKSSSD....',
  '....DSSKSSSD....',
  '....DSSSSSSD....',
  '...DDSSSSSSDD...',
  '...DDDDDDDDDD...',
];
const COLOURS = { D: '#3b2a3a', R: '#d6453d', W: '#fff3d6', S: '#f4d6a6', K: '#d3ae7c' };
/** The mushroom on the Sprite layer of a blank pixel document (a 32 by 32 grid; the mushroom sits in the middle), that layer picked. */
const pixelMushroom = L.js(`(() => {
  const S = __frameling.store(); const rows = ${JSON.stringify(MUSH)}; const col = ${JSON.stringify(COLOURS)};
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  S.update('setup', (d) => {
    const l = d.layers.find((x) => x.kind === 'pixel'); const id = l.cels[0].drawingId;
    const gw = Math.ceil(d.width / l.pixelSize), gh = Math.ceil(d.height / l.pixelSize);
    const px = new Uint8ClampedArray(gw * gh * 4);
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '.') return; const i = ((y + 8) * gw + (x + 8)) * 4; px.set([...hex(col[c]), 255], i); }));
    d.drawings[id] = { id, kind: 'pixel', width: gw, height: gh, pixels: px };
  });
  const l = S.get().doc.layers.find((x) => x.kind === 'pixel'); S.setUi({ activeLayerId: l.id, frame: 0 });
})()`);

/** A made-up photo: a sky, a sun, hills and film grain, at one page pixel to the art pixel, so it has thousands of colours. */
const pixelPhoto = L.js(`(() => {
  const S = __frameling.store(); const W = 144, H = 96;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const d0 = structuredClone(S.get().doc); const l0 = d0.layers.find((x) => x.kind === 'pixel'); l0.pixelSize = 1; d0.width = W; d0.height = H; S.load(d0);
  S.update('setup', (d) => {
    const l = d.layers.find((x) => x.kind === 'pixel'); const id = l.cels[0].drawingId; const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y / H; let r = 255 - 120 * t, g = 190 - 40 * t, b = 120 + 100 * t;
      const sun = Math.hypot(x - 100, y - 30); if (sun < 14) { const k = 1 - sun / 14; r += 40 * k; g += 60 * k; b -= 30 * k; }
      const hill = 62 + 10 * Math.sin(x / 13) + 6 * Math.sin(x / 5 + 1); if (y > hill) { const k = (y - hill) / (H - hill); r = 40 + 30 * k; g = 90 + 50 * k; b = 50 + 20 * k; }
      const n = (rnd() - 0.5) * 36; px.set([r + n, g + n * 1.1, b + n * 0.8, 255].map((v) => Math.max(0, Math.min(255, v))), (y * W + x) * 4);
    }
    d.drawings[id] = { id, kind: 'pixel', width: W, height: H, pixels: px };
  });
  const l = S.get().doc.layers.find((x) => x.kind === 'pixel'); S.setUi({ activeLayerId: l.id, frame: 0 });
})()`);

/** Presses a button of the open dialog by its test id. */
const press = (id) => L.js(`document.querySelector('[data-testid="${id}"]')?.click()`);

module.exports = { vectorCharacter, pixelMushroom, pixelPhoto, press };
