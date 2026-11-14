// Help picture for notes on the canvas: a lopsided face with three notes, one of them open with an answer on it.
// Window coordinates as in drawing.cjs: the canvas viewport is 764 x 444 at (113, 47).
const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const away = { move: [720, 28] };
const CV = [113, 47, 764, 444];
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = () => `n${++nid}`;
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
const FACE = [
  ell(380, 140, 520, 470, '#ffd9a8', INK, 8),
  ell(470, 260, 120, 120, '#ffffff', INK, 6), ell(515, 305, 40, 40, INK, null),
  ell(720, 330, 64, 64, '#ffffff', INK, 6), ell(740, 350, 24, 24, INK, null),
  line(520, 520, 780, 470, '#d3445f', 12),
  line(640, 380, 625, 450, INK, 6),
];
const put = { eval: `(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(FACE)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); })(); 0` };
const H = 3600000;
const add = { eval: `(() => { const now = Date.now(); __framelingNotes.add([
  { id: 'a', x: 780, y: 340, text: 'The right eye sits too low here. Can we raise it a little?', pin: 'frame', frame: 0, by: 'Sam', at: now - 2 * ${H}, replies: [{ id: 'r1', text: 'Raised it by a few pixels.', by: 'Alex', at: now - 30 * 60000 }] },
  { id: 'b', x: 470, y: 560, text: 'Ask Priya about the mouth colour', by: 'Sam', at: now - 26 * ${H} },
  { id: 'c', x: 360, y: 160, text: 'Outline weight fixed', done: true, by: 'Alex', at: now - 50 * ${H} },
]); __framelingNotes.open('a'); })(); 0` };

module.exports = [
  {
    name: 'canvas-notes',
    width: 800,
    steps: [
      T('blank-vector'), put, UI({ zoom: 0.5, panX: 270 - 640 * 0.5, panY: 222 - 360 * 0.5 }), add,
      { wait: 700 }, away, { wait: 500 },
      { shot: '@', crop: CV },
    ],
  },
];
