// Shared by the clone stamp, curves and blur pictures and clips: a pixel sprite with a small painted scene put straight into
// its pixels (so every look starts from the very same picture), real pointer events for the strokes (Alt held when asked), and
// the retouch settings set through __framelingRetouch. Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const F = '__frameling';

/** True in the dark theme, from the page itself, so one list of steps serves both. */
const DARK = `(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); return (c[0] + c[1] + c[2]) / 3 < 128; })()`;

// Strokes in art pixels, sent as real pointer events. Like the soft paint helper, with Alt and a hover added.
const HELPER = `(() => {
  const root = () => document.querySelector('.cv-root');
  const client = (x, y) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root().getBoundingClientRect(); return [r.left + x * zoom + panX, r.top + y * zoom + panY]; };
  const send = (type, x, y, pressure, pen, alt, down) => { const [cx, cy] = client(x, y); root().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: pen ? 7 : 1, pointerType: pen ? 'pen' : 'mouse', isPrimary: true, clientX: cx, clientY: cy, pressure, button: 0, buttons: down ? 1 : 0, altKey: !!alt, tiltX: 0, tiltY: 0 })); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__sp = {
    async stroke(pts, o = {}) { const pen = !!o.pen; const d = o.delay ?? 10; send('pointerdown', pts[0][0], pts[0][1], pts[0][2] ?? 0.5, pen, o.alt, true); await wait(d); for (let i = 1; i < pts.length; i++) { send('pointermove', pts[i][0], pts[i][1], pts[i][2] ?? 0.5, pen, o.alt, true); await wait(d); } if (o.hold) await wait(o.hold); const l = pts[pts.length - 1]; send('pointerup', l[0], l[1], 0, pen, o.alt, false); await wait(60); },
    async hover(x, y) { send('pointermove', x, y, 0, false, false, false); await wait(80); },
    wait,
  };
})()`;

/** The picture, written into the active drawing's pixels. `scene` names one of the pictures below; `tone` washes it out or darkens it. */
const SCENES = `
const S = {
  w: 128, h: 128,
  mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  // A sunny hillside: a sky going from blue to cream, soft clouds, a sun, two rows of hills, a few trees.
  hillside(x, y) {
    const { w, h } = S;
    const horizon = h * 0.62;
    let c = S.mix([96, 170, 236], [255, 233, 190], Math.min(1, y / horizon));
    const cloud = (cx, cy, rx, ry) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; return d < 1 ? 1 - d : 0; };
    const k = Math.min(1, 0.95 * Math.max(cloud(8, 14, 16, 6), cloud(14, 20, 10, 5), cloud(120, 18, 14, 5), cloud(112, 14, 9, 5)));
    c = S.mix(c, [255, 255, 255], k * 0.9);
    const sun = Math.hypot(x - 116, y - 32);
    if (sun < 10) c = [255, 214, 90]; else if (sun < 14) c = S.mix(c, [255, 224, 140], 0.45);
    const far = h * 0.62 + Math.sin(x / 11) * 5;
    if (y > far) c = [76, 142, 96];
    const near = h * 0.76 + Math.sin(x / 7 + 1.4) * 4 + Math.sin(x / 23) * 3;
    if (y > near) c = [44, 104, 70];
    const trunk = [[24, 0], [58, 0], [84, 0]].some(([tx]) => Math.abs(x - tx) < 1.5 && y > h * 0.7 && y < h * 0.84);
    if (trunk) c = [96, 66, 44];
    const crown = [[24, 0], [58, 0], [84, 0]].some(([tx]) => Math.hypot(x - tx, (y - h * 0.66) * 1.2) < 7);
    if (crown) c = [34, 120, 62];
    return c;
  },
  // Dust and a hair across the sky: what a retoucher takes out.
  blemishes: [[40, 14, 3], [41, 15, 3], [50, 30, 2], [51, 31, 2], [22, 36, 4], [34, 12, 2]],
  scratch(x, y) { return y > 9 && y < 41 && Math.abs((x - 30) - (y - 9) * 0.7) < 0.9; },
  dirt(x, y) { return S.blemishes.some(([bx, by, r]) => Math.hypot(x - bx, y - by) <= r) || S.scratch(x, y); },
  // A shape with hard edges, for the blur and sharpen brushes: bars and a ring.
  shapes(x, y) {
    const bg = [236, 232, 222];
    const bar = x >= 14 && x < 52 && y >= 12 && y < 84 && ((x - 14) >> 3) % 2 === 0;
    const ring = Math.abs(Math.hypot(x - 92, y - 48) - 24) < 4.5;
    return bar || ring ? [38, 44, 70] : bg;
  },
};`;

/** Writes the scene into the active pixel drawing. `opts`: { scene, dirt, tone: [gain, lift] } (tone squeezes the range: out = lift + in * gain). */
const paint = (opts) =>
  L.js(`(() => {
    ${SCENES}
    const o = ${JSON.stringify(opts)};
    const st = ${F}.store().get();
    const layer = st.doc.layers.find((l) => l.id === st.ui.activeLayerId) ?? st.doc.layers[st.doc.layers.length - 1];
    const cel = layer.cels.find((c) => st.ui.frame >= c.start && st.ui.frame < c.start + c.length) ?? layer.cels[0];
    const W = Math.ceil(st.doc.width / layer.pixelSize), H = Math.ceil(st.doc.height / layer.pixelSize);
    const px = new Uint8ClampedArray(W * H * 4);
    const [gain, lift] = o.tone ?? [1, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = S[o.scene ?? 'hillside'](x, y);
      if (o.dirt && S.dirt(x, y)) c = [52, 46, 58];
      px.set([lift + c[0] * gain, lift + c[1] * gain, lift + c[2] * gain, 255], (y * W + x) * 4);
    }
    ${F}.store().update('scene', (d) => { const dr = d.drawings[cel.drawingId]; dr.x = 0; dr.y = 0; dr.width = W; dr.height = H; dr.pixels = px; });
    return [W, H];
  })()`);

/** A fresh pixel sprite, sized so one art pixel is whole screen pixels, with the helper in place and the page left alone. */
function start(size = 128) {
  PS = Math.max(1, Math.floor(512 / Math.max(1, size)));
  return [
    L.js(`__framelingPixel.newSprite('picture', ${size})`),
    L.wait(700),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.js(`${F}.store().setUi({ tool: 'hand' })`),
    L.wait(300),
  ];
}

// Paths are in art pixels; the page's pointer events are in document pixels, which are PS times bigger (see pixelSizeFor in src/pixel/way.ts).
let PS = 1;
const draw = (path, o) => L.js(`__sp.stroke(${JSON.stringify(path.map(([x, y, p]) => [(x + 0.5) * PS, (y + 0.5) * PS, p]))}, ${JSON.stringify(o ?? {})})`);
const hover = (x, y) => L.js(`__sp.hover(${(x + 0.5) * PS}, ${(y + 0.5) * PS})`);
const retouch = (kind, patch) => L.js(`__framelingRetouch.store(${JSON.stringify(kind)}).set(${JSON.stringify(patch)})`);
const pick = (tool) => L.js(`${F}.store().setUi({ tool: ${JSON.stringify(tool)} })`);
const away = { move: [1200, 780] };
const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 0.5]; });

module.exports = { L, F, DARK, HELPER, SCENES, paint, start, draw, hover, retouch, pick, away, line };

// ---- the Curves and Levels dialog, driven with real pointer events and clicks on its own controls

/** Clicks the button in the open dialog with this text. */
const clickText = (text) => L.js(`(() => { const b = [...document.querySelectorAll('.io-modal button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ' + ${JSON.stringify(text)}); b.click(); })()`);
/** Clicks the colour choice (all, r, g, b) in the open dialog. */
const clickChannel = (c) => L.js(`document.querySelector('.tn-chan[data-channel=${JSON.stringify(c)}]').click()`);
/** Puts points on the curve in the open dialog by pressing and letting go at each (x, y), 0 to 255 each way, y going up. */
const curvePoints = (pts) =>
  L.js(`(async () => {
    const svg = document.querySelector('[data-testid="tone-curve"]');
    const pause = () => new Promise((r) => setTimeout(r, 90));
    const r = svg.getBoundingClientRect();
    const at = (x, y) => [r.left + ((x + 8) / 272) * r.width, r.top + ((255 - y + 8) / 272) * r.height];
    const send = (type, x, y, down) => { const [cx, cy] = at(x, y); svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: down ? 1 : 0 })); };
    for (const [x, y] of ${JSON.stringify(pts)}) { send('pointerdown', x, y, true); await pause(); send('pointerup', x, y, false); await pause(); }
  })()`);

module.exports.clickText = clickText;
module.exports.clickChannel = clickChannel;
module.exports.curvePoints = curvePoints;
