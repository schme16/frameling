// The brushes you build yourself (brand/ab/own-brushes), shot in the real app, once per theme. Names: <kind>-<variant>.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-own-brushes --out <dir> [--only nib-italic,...]
// The same page as the brush tips look (scripts/docs/ab-brush-tips): a wave, a zigzag, a loop and a dab on a plain page at 100%.
// The "yours" entries make the brush from drawn shapes with the real commands, so what is shot is what a person gets.
const L = require('../help/_lib.cjs');
const at = (x, y) => [Math.round(x - 145), Math.round(y - 91)];
const fit = L.js('__frameling.store().setUi({ zoom: 1, panX: 382 - 640, panY: 222 - 360 })');
const away = { move: [720, 28] };
const wave = { drag: Array.from({ length: 36 }, (_, i) => at(300 + i * 15, 230 + 46 * Math.sin((i / 35) * Math.PI * 2.2))), steps: 3, delay: 10 };
const zig = { drag: Array.from({ length: 13 }, (_, i) => at(330 + i * 22 + (i % 2 ? 6 : 0), i % 2 ? 330 : 440)), steps: 4, delay: 10 };
const loop = { drag: Array.from({ length: 36 }, (_, i) => { const a = (i / 35) * Math.PI * 2.6; return at(740 + Math.cos(a) * 70 + i * 3, 385 + Math.sin(a) * 52); }), steps: 3, delay: 10 };
const dab = { drag: [at(870, 235), at(900, 236), at(935, 240)], steps: 4, delay: 12 };
// A box drawn in four straight runs, turning clockwise at three corners: for the edged brushes.
const box = { drag: [at(300, 200), at(520, 200), at(520, 320), at(300, 320)], steps: 8, delay: 10 };
const box2 = { drag: [at(600, 200), at(820, 200), at(820, 330)], steps: 8, delay: 10 };
const blue = '#2d3f6e';
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);
const shot = { shot: '@', crop: [150, 52, 720, 435] };
const setBrush = (b) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, ${b} } }))`);
const start = [L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700), PAPER];

const entry = (name, brush, strokes = [wave, zig, loop, dab], pre = []) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  width: 1000,
  steps: [...start, ...pre, setBrush(brush), L.wait(500), away, L.wait(300), ...strokes.flatMap((s) => [s, L.wait(250)]), L.wait(250), away, L.wait(500), shot],
});
const base = 'size: 20, thinning: 0, smoothing: 0.6, streamline: 0.6, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true';

// ---- drawing shapes for the "yours" brushes (paths in document pixels; the brush only keeps their outline)
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
const poly = (id, pts) => ({ id, type: 'path', fill: '#000000', stroke: null, opacity: 1, paths: [{ closed: true, points: pts.map(([x, y]) => ({ x, y })) }] });
const rect = (id, x, y, w, h) => poly(id, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
// A leafy vine: a long thin stem with leaves coming off either side.
const vine = [ell('q0', 0, 0, 300, 12)];
for (let i = 0; i < 6; i++) vine.push(ell(`q${i + 1}`, 14 + i * 46, i % 2 ? 6 : -34, 22, 40));
// Battlements: a wall block with a raised piece on top; a tower-ish end; two corner pieces. All 30 tall so they sit together.
const wall = [rect('q0', 0, 10, 64, 20), rect('q1', 20, 0, 24, 10)];
const cap = [rect('q0', 0, 0, 30, 30)];
const capHole = [rect('q0', 0, 0, 30, 30)];
const outer = [poly('q0', [[0, 0], [30, 0], [30, 14], [14, 14], [14, 30], [0, 30]])];
const inner = [poly('q0', [[0, 0], [30, 0], [0, 30]])];

// Puts drawn shapes on the page, selects them, runs a command, and takes them off again.
const make = (shapes, cmd) => [
  L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.kind === 'vector'); S.setUi({ activeLayerId: l.id, selection: shapes.map((x) => x.id) }); })()`),
  L.wait(400), L.cmd(cmd), L.wait(600),
  L.js("(() => { const S = __frameling.store(); S.update('cleanup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); const dr = d.drawings[l.cels[0].drawingId]; dr.shapes = dr.shapes.filter((x) => !/^q\\d+$/.test(x.id)); }); S.setUi({ selection: [], tool: 'brush' }); })()"),
  L.wait(400),
];
const yours = (name, parts, brush, strokes) => ({
  name,
  choices: { 'brush.alongFit': 'repeat' },
  prefs: { firstDrawn: true, showTips: false },
  width: 1000,
  steps: [...start, ...parts, setBrush(brush), L.wait(500), away, L.wait(300), ...strokes.flatMap((s) => [s, L.wait(250)]), L.wait(250), away, L.wait(500), shot],
});

module.exports = [
  entry('plain', base),
  entry('nib-italic', `${base}, size: 22, tip: { kind: 'nib', roundness: 0.18, nibAngle: 40, angle: 'upright' }`),
  entry('nib-follow', `${base}, size: 22, tip: { kind: 'nib', roundness: 0.2, nibAngle: 90, angle: 'follow' }`),
  entry('nib-round', `${base}, size: 14, thinning: 0.6, tip: { kind: 'nib', roundness: 1 }`),
  entry('bristle-hog', `${base}, size: 36, thinning: 0.4, tip: { kind: 'bristle', count: 18, stiffness: 0.7, amount: 0.2, seed: 5 }`),
  entry('bristle-dry', `${base}, size: 40, thinning: 0.5, tip: { kind: 'bristle', count: 24, stiffness: 0.5, amount: 0.65, seed: 5 }`),
  entry('along-ribbon', 'size: 22, thinning: 0.6', undefined, [L.cmd('brush.tip.along'), L.wait(300)]),
  entry('edged-chain', 'size: 26, thinning: 0', [wave, zig, box2, dab], [L.cmd('brush.tip.edged'), L.wait(300)]),
  entry('stamp-spin', `${base}, size: 22, tip: { kind: 'stamp', shape: 'leaf', spacing: 1.2, jitter: 0.3, angle: 'follow', scatter: 0.4, turn: 0.35, gapVary: 0.6, seed: 4 }`),
  yours('along-yours', make(vine, 'brush.makeAlong'), 'thinning: 0, smoothing: 0.6, streamline: 0.6', [wave, zig, loop, dab]),
  yours('edged-yours', [...make(wall, 'brush.edged.sides'), ...make(cap, 'brush.edged.start'), ...make(cap, 'brush.edged.end'), ...make(outer, 'brush.edged.outer'), ...make(inner, 'brush.edged.inner')], 'size: 30, smoothing: 0.4, streamline: 0.2', [box, wave, box2, dab]),
];
