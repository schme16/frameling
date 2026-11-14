// Looks for the canvas-view branch: the turned view with a pen and the pixel grid, align and spread out as before and after,
// and a see-through artboard on screen. The exported file beside the screen, and the 200% shots, are composed by hand with
// ImageMagick from these and the e2e outputs (see brand/ab/canvas-view/note.md).
// Run: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --out brand/ab/canvas-view --only turned-pixel,turned-vector,...
const L = require('../help/_lib.cjs');
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const rect = (x, y, w, h, fill) => ({ id: `cv${++nid}`, type: 'path', paths: [rectPath(x, y, w, h)], fill, stroke: { color: INK, width: 5, join: 'round', cap: 'round' }, opacity: 1 });
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const ell = (x, y, w, h, fill, sw = 6) => ({ id: `cv${++nid}`, type: 'path', paths: [ellPath(x, y, w, h)], fill, stroke: sw ? { color: INK, width: sw, join: 'round', cap: 'round' } : null, opacity: 1 });
const away = { move: [720, 28] };
const turnRight = (n) => Array.from({ length: n }, () => [L.cmd('view.turnRight'), L.wait(110)]).flat();
const putOn = (shapes) => L.js(`(() => { const S = __frameling.store(); S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...${JSON.stringify(shapes)}); }); })()`);
const scrollTo = (text, pad = 8) => L.js(`(() => { const el = [...document.querySelectorAll('h3')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); const sc = document.querySelector('.rd-scroll'); if (!el || !sc) return 'missing'; sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - ${pad}; return 'ok'; })()`);

// Pixel art, turned 45 degrees, with the pixel grid on: the pencil, its square and the grid all follow the turn.
const pixelClip = {
  name: 'turned-pixel',
  prefs: { showTips: false },
  steps: [
    L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(500), L.template('blank-pixel'), L.wait(300),
    { key: 'p' }, L.cmd('view.zoom100'), L.cmd('view.zoomIn'), L.cmd('view.zoomIn'), L.cmd('view.center'), L.wait(300),
    L.js(`__frameling.store().setUi({ color: '#ff6f91' })`), { move: [640, 762] }, L.wait(400),
    { shot: 'warm', crop: [0, 0, 32, 32] },
    { rec: '@', crop: [403, 47, 526, 418], every: 70 }, L.wait(800),
    ...turnRight(3), L.wait(600),
    { drag: [[600, 200], [640, 230], [680, 250], [720, 245]], steps: 6, delay: 30 }, L.wait(500),
    { drag: [[620, 320], [660, 300], [700, 310]], steps: 5, delay: 30 }, L.wait(900),
    L.cmd('view.flip'), L.wait(1400), L.cmd('view.resetTurn'), L.wait(1500),
    { rec: 'stop' },
  ],
};

// A vector page with a guide, turned, with Snapping on: the stroke meets the guide where it is shown.
const vectorClip = {
  name: 'turned-vector',
  prefs: { showTips: false },
  steps: [
    L.template('blank-vector'),
    putOn([ell(460, 200, 360, 320, '#ffd9a8', 8), ell(540, 300, 60, 60, '#ffffff', 5), ell(680, 300, 60, 60, '#ffffff', 5)]),
    L.js(`__frameling.store().update('guide', (d) => { d.guides = [{ id: 'g1', axis: 'y', at: 560 }]; }); __frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })`),
    L.cmd('tools.brush'), L.js(`__frameling.store().setUi({ color: '#5b4bd6', brush: { size: 10, thinning: 0.1, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } })`),
    L.wait(500), away, L.wait(300),
    { shot: 'warm', crop: [0, 0, 32, 32] },
    { rec: '@', crop: [113, 47, 764, 444], every: 70 }, L.wait(800),
    ...turnRight(2), L.wait(500),
    { drag: [[330, 330], [400, 300], [490, 283], [580, 296], [650, 340]], steps: 8, delay: 25 }, L.wait(900),
    ...turnRight(2), L.wait(400),
    { drag: [[360, 360], [430, 330], [520, 320], [600, 335]], steps: 8, delay: 25 }, L.wait(1100),
    L.cmd('view.resetTurn'), L.wait(1500),
    { rec: 'stop' },
  ],
};

// Align and spread out, three stills from one start: scattered, lined up on their middles, then spread out evenly.
const SHAPES = [rect(150, 120, 170, 120, '#ff8fb1'), rect(400, 330, 90, 90, '#8fd0ff'), rect(560, 90, 130, 70, '#ffd36b'), rect(760, 260, 60, 150, '#9be0b4'), rect(960, 140, 110, 110, '#b79cff')];
const alignStart = [
  L.template('blank-vector'), putOn(SHAPES),
  L.js(`__frameling.store().setUi({ tool: 'select', selection: ${JSON.stringify(SHAPES.map((s) => s.id))}, zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })`),
  L.panel('symbol-props'), L.wait(900), scrollTo('Align and space out', 40), L.wait(400), away, L.wait(300),
];
const ALIGN_CROP = [112, 44, 1084, 448];
const alignStill = (name, ...after) => ({ name, prefs: { showTips: false }, steps: [...alignStart, ...after, L.wait(900), { shot: '@', crop: ALIGN_CROP }] });

// A see-through artboard: three boards, the open one with no colour (a checkerboard), the Artboards panel beside it.
const BOARDS = `(async () => {
  const E = window.__framelingExport, A = window.__framelingArtboards, S = window.__frameling.store();
  await E.load('blank-vector');
  const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
  const layer = (id, name, drawingId, len) => ({ id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: len, drawingId }] });
  S.update('setup', (d) => {
    d.name = 'Film'; d.width = 320; d.height = 180; d.background = null; d.length = 4; d.fps = 12; d.clips = []; d.markers = [];
    d.drawings = { dA: { id: 'dA', kind: 'vector', shapes: [rect('sa', 100, 60, 120, 60, '#4a8dff')] } };
    d.layers = [layer('LA', 'Layer A', 'dA', 4)];
    const id = A.model.addArtboard(d, { name: 'Square', width: 200, height: 200, length: 2, background: '#00aa00' });
    d.drawings.dB = { id: 'dB', kind: 'vector', shapes: [rect('sb1', 50, 50, 100, 100, '#ffff00')] };
    d.artboards.find((a) => a.id === id).content.layers = [layer('LB', 'Layer B', 'dB', 2)];
    A.model.renameArtboard(d, d.artboards[0].id, 'Wide');
    const id2 = A.model.addArtboard(d, { name: 'Clear', width: 200, height: 200, length: 2, background: null });
    d.drawings.dC = { id: 'dC', kind: 'vector', shapes: [rect('sc1', 50, 50, 100, 100, '#ff00ff')] };
    d.artboards.find((a) => a.id === id2).content.layers = [layer('LC', 'Layer C', 'dC', 2)];
  });
  return true;
})()`;
const seeThroughStill = {
  name: 'see-through-screen',
  prefs: { showTips: false },
  steps: [L.js(BOARDS), L.wait(1200), L.panel('artboards'), L.wait(800), L.cmd('artboards.fitAll'), L.wait(900), away, L.wait(400), { shot: '@', crop: [112, 44, 1084, 450] }],
};

module.exports = [
  pixelClip,
  vectorClip,
  alignStill('align-before'),
  alignStill('align-middle', L.cmd('select.alignMiddle')),
  alignStill('align-spread', L.cmd('select.alignMiddle'), L.cmd('select.spreadAcross')),
  seeThroughStill,
];
