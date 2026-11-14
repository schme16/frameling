// Help clip for marks drawn over the picture: an arrow dragged at one eye, a ring round the mouth, a few words typed,
// a quick sketch, then the switch that hides them all and brings them back. The face is the one the notes picture uses.
// Window coordinates as in drawing.cjs: the canvas viewport is 764 x 444 at (113, 47).
const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const away = { move: [720, 28] };
const L = require('./_lib.cjs');
// Window: canvas 764 x 444 at (113, 47) with the tool options on the right; the view is zoom 0.5, panned so a stage point (x, y) lands at (175 + x/2, 89 + y/2).
const at = (x, y) => [Math.round(175 + x / 2), Math.round(89 + y / 2)];
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
const view = UI({ zoom: 0.5, panX: 62, panY: 42, tool: 'marks' });
const slow = (pts, delay = 14) => ({ drag: pts.map(([x, y]) => at(x, y)), steps: 4, delay });

module.exports = [
  {
    name: 'canvas-marks',
    choices: { 'marks.pin': 'frame' },
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      T('blank-vector'), put, view, L.cmd('marks.arrow'), L.wait(900), away, L.wait(500),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 560], every: 80 },
      L.wait(900),
      slow([[1010, 215], [818, 340]], 30),
      L.wait(700),
      L.cmd('marks.circle'), L.wait(300),
      slow([[470, 425], [650, 500], [835, 575]], 30),
      L.wait(700),
      L.cmd('marks.text'), L.wait(300),
      { click: at(930, 140) }, L.wait(300),
      { type: 'Raise this eye' }, L.wait(600), { key: 'Enter' }, L.wait(700),
      L.cmd('marks.scribble'), L.wait(300),
      slow([[420, 215], [450, 160], [475, 225], [505, 150], [530, 220], [560, 155], [585, 215]], 40),
      L.wait(900),
      L.cmd('marks.toggleShow'), L.wait(1100),
      L.cmd('marks.toggleShow'), L.wait(1400),
      { rec: 'stop' },
    ],
  },
];
