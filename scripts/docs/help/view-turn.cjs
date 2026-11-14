// Help clip for turning and flipping the view: a lopsided face, the view flipped to show it, turned with Alt and a drag,
// drawn on while it is turned, then put straight with the Straighten button. Window coordinates as in drawing.cjs: the canvas viewport is 764 x 444 at (113, 47).
const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const cmd = (id) => ({ eval: `__frameling.run(${JSON.stringify(id)})` });
const away = { move: [720, 28] };
const CV = [113, 47, 764, 444];
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
// Points round the middle of the canvas (495, 269) at radius 230, from one angle to another, for an Alt drag.
const ARC = (from, to, n) => Array.from({ length: n }, (_, i) => { const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180; return [Math.round(495 + 230 * Math.cos(a)), Math.round(269 + 230 * Math.sin(a))]; });
const fitHalf = UI({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 });

module.exports = [
  {
    name: 'turn-flip-view',
    width: 800,
    steps: [
      T('blank-vector'), put(FACE), fitHalf, cmd('tools.brush'), UI({ color: '#5b4bd6', brush: { size: 10, thinning: 0.1, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } }),
      { wait: 600 }, away, { wait: 300 },
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: CV, every: 70 }, { wait: 900 },
      // Flip: the eyes and the mouth look lopsided at once.
      cmd('view.flip'), { wait: 1800 }, cmd('view.flip'), { wait: 900 },
      // Hold Alt and drag round the middle: the page turns to any angle with the pointer.
      { drag: ARC(0, 38, 7), mods: ['alt'], steps: 3, delay: 28 }, { wait: 900 },
      // Draw a stroke while it is turned, then press Straighten on the note.
      { drag: [[395, 300], [430, 240], [490, 215], [560, 240], [595, 300]], steps: 8, delay: 20 }, { wait: 1300 },
      { clickOn: '.tv-chip-reset', text: 'Straighten', after: 1800 },
      { rec: 'stop' },
    ],
  },
];
