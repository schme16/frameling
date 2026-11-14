// The same strokes drawn with each brush tip (brand/ab/brush-tips), shot in the real app, once per theme. Names: <tip>.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-tips --out <dir> [--only chalk,...]
// Three strokes on a white page at 100%: a long wave, a hatching zigzag drawn as one line that crosses itself, and a
// short fat dab. The canvas is 764 x 444 at (113, 47) in a 1000 wide window, the page centre at its middle.
const L = require('../help/_lib.cjs');
const at = (x, y) => [Math.round(x - 145), Math.round(y - 91)];
const fit = L.js('__frameling.store().setUi({ zoom: 1, panX: 382 - 640, panY: 222 - 360 })');
const away = { move: [720, 28] };
const wave = { drag: Array.from({ length: 36 }, (_, i) => at(300 + i * 15, 230 + 46 * Math.sin((i / 35) * Math.PI * 2.2))), steps: 3, delay: 10 };
const zig = { drag: Array.from({ length: 13 }, (_, i) => at(330 + i * 22 + (i % 2 ? 6 : 0), i % 2 ? 330 : 440)), steps: 4, delay: 10 };
const loop = { drag: Array.from({ length: 36 }, (_, i) => { const a = (i / 35) * Math.PI * 2.6; return at(740 + Math.cos(a) * 70 + i * 3, 385 + Math.sin(a) * 52); }), steps: 3, delay: 10 };
const dab = { drag: [at(870, 235), at(900, 236), at(935, 240)], steps: 4, delay: 12 };
const blue = '#2d3f6e';
// In the dark theme the page is slate and the lines are cream, like chalk on a board; in the light theme, ink on white paper.
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);

const entry = (name, brush) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  width: 1000,
  steps: [
    L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700),
    PAPER, L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, ${brush} } }))`), L.wait(500),
    away, L.wait(300),
    wave, L.wait(250), zig, L.wait(250), loop, L.wait(250), dab, L.wait(500), away, L.wait(500),
    { shot: '@', crop: [150, 52, 720, 435] },
  ],
});

// A paw print drawn as five filled ellipses, selected, and turned into a brush with Make a brush from the selection.
const K = 0.5522847498307936;
const ell = (id, x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = K * rx, ky = K * ry;
  return { id, type: 'path', fill: '#000000', stroke: null, opacity: 1, paths: [{ closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] }] };
};
const paw = [ell('p1', 0, 24, 40, 34), ell('p2', -14, 4, 14, 20), ell('p3', 6, -8, 14, 20), ell('p4', 22, -8, 14, 20), ell('p5', 42, 4, 14, 20)];
const makePaw = [
  L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(paw)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.kind === 'vector'); S.setUi({ activeLayerId: l.id, selection: shapes.map((x) => x.id) }); })()`),
  L.wait(400), L.cmd('brush.fromSelection'), L.wait(600),
  L.js("(() => { const S = __frameling.store(); S.update('cleanup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); const dr = d.drawings[l.cels[0].drawingId]; dr.shapes = dr.shapes.filter((x) => !x.id.startsWith('p')); }); S.setUi({ selection: [], tool: 'brush' }); })()"),
  L.wait(400),
];

const base = 'size: 20, thinning: 0.5, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true';
const yours = {
  name: 'stamp-yours',
  prefs: { firstDrawn: true, showTips: false },
  width: 1000,
  steps: [
    L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700),
    PAPER,
    ...makePaw,
    L.js("__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 26, tip: { ...u.brush.tip, spacing: 1.6, jitter: 0.2, scatter: 0.05, angle: 'follow' } } }))"), L.wait(500),
    away, L.wait(300),
    wave, L.wait(250), zig, L.wait(250), loop, L.wait(250), dab, L.wait(500), away, L.wait(500),
    { shot: '@', crop: [150, 52, 720, 435] },
  ],
};

module.exports = [
  entry('plain', base),
  entry('chalk', `${base}, tip: { kind: 'chalk', amount: 0.6, grain: 1 }`),
  entry('charcoal', `${base}, tip: { kind: 'charcoal', amount: 0.75, grain: 1.2 }`),
  entry('watercolour', `${base}, size: 30, thinning: 0, tip: { kind: 'watercolour', amount: 0.6 }`),
  entry('stamp-leaf', `${base}, size: 24, thinning: 0, tip: { kind: 'stamp', shape: 'leaf', spacing: 0.9, jitter: 0.35, angle: 'follow', scatter: 0.3 }`),
  yours,
  entry('stamp-star', `${base}, size: 22, thinning: 0, tip: { kind: 'stamp', shape: 'star', spacing: 1.2, jitter: 0.3, angle: 'random', scatter: 0.15 }`),
];
