// Help clip for turning and flipping the view: a lopsided face, the view flipped to show it, turned with Alt and a drag,
// drawn on while it is turned, then put straight with the Straighten button. The stage is measured from the running app (view(), at() and STAGE in _shapes.cjs), so no window numbers are kept here.
const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const cmd = (id) => ({ eval: `__frameling.run(${JSON.stringify(id)})` });
const away = { move: [720, 28] };
const { view, at, STAGE } = require('./_shapes.cjs');
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = () => `v${++nid}`;
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const shape = (paths, fill, stroke = INK, width = 6) => ({ id: hid(), type: 'path', paths, fill, stroke: stroke ? { color: stroke, width, join: 'round', cap: 'round' } : null, opacity: 1 });
const ell = (x, y, w, h, fill, stroke, width) => shape([ellPath(x, y, w, h)], fill, stroke, width);
const line = (x1, y1, x2, y2, color = INK, width = 8) => shape([{ closed: false, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }], null, color, width);
const put = (shapes) => ({ eval: `(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); })()` });
// A face that is off balance: the left eye is big and high, the right small and low, and the mouth runs uphill.
const FACE = [
  ell(380, 140, 520, 470, '#ffd9a8', INK, 8),
  ell(470, 260, 120, 120, '#ffffff', INK, 6), ell(515, 305, 40, 40, INK, null),
  ell(720, 330, 64, 64, '#ffffff', INK, 6), ell(740, 350, 24, 24, INK, null),
  line(520, 520, 780, 470, '#d3445f', 12),
  line(640, 380, 625, 450, INK, 6),
];
// Points round the middle of the stage at radius 460 stage points (230 on screen at half size), from one angle to another, for an Alt drag.
const ARC = (from, to, n) => Array.from({ length: n }, (_, i) => { const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180; return at(640 + 460 * Math.cos(a), 360 + 460 * Math.sin(a)); });
const fitHalf = view(0.5);

module.exports = [
  {
    name: 'turn-flip-view',
    width: 800,
    steps: [
      T('blank-vector'), put(FACE), cmd('tools.brush'), UI({ color: '#5b4bd6', brush: { size: 10, thinning: 0.1, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } }),
      { wait: 600 }, fitHalf, away, { wait: 300 },
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: STAGE, every: 70 }, { wait: 900 },
      // Flip: the eyes and the mouth look lopsided at once.
      cmd('view.flip'), { wait: 1800 }, cmd('view.flip'), { wait: 900 },
      // Hold Alt and drag round the middle: the page turns to any angle with the pointer.
      { drag: ARC(0, 38, 7), mods: ['alt'], steps: 3, delay: 28 }, { wait: 900 },
      // Draw a stroke while it is turned, then press Straighten on the note.
      { drag: [at(440, 422), at(510, 302), at(630, 252), at(770, 302), at(840, 422)], steps: 8, delay: 20 }, { wait: 1300 },
      { clickOn: '.tv-chip-reset', text: 'Straighten', after: 1800 },
      { rec: 'stop' },
    ],
  },
];
