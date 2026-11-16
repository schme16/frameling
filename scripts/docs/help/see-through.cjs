// Help picture for see-through pages: a little sprite on a page with no background colour, so the checkerboard shows.
// The stage is measured from the running app, so no window numbers are kept here.
const L = require('./_lib.cjs');
const { view, STAGE } = require('./_shapes.cjs');
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
const ell = (x, y, w, h, fill, sw = 8) => ({ id: `st${++nid}`, type: 'path', paths: [ellPath(x, y, w, h)], fill, stroke: sw ? { color: INK, width: sw, join: 'round', cap: 'round' } : null, opacity: 1 });
const D = 100;
const SPRITE = [ell(500, 120 + D, 280, 260, '#8fd0ff'), ell(560, 210 + D, 50, 60, '#ffffff', 6), ell(670, 210 + D, 50, 60, '#ffffff', 6), ell(580, 230 + D, 14, 24, INK, 0), ell(690, 230 + D, 14, 24, INK, 0), ell(600, 300 + D, 80, 36, '#ff8fb1', 6)];
const put = L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(SPRITE)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); })()`);

module.exports = [
  {
    name: 'see-through-page',
    steps: [L.template('blank-vector'), put, L.cmd('document.seeThrough'), L.wait(900), view(0.55), { move: [720, 28] }, L.wait(3900), { shot: '@', crop: STAGE }],
  },
];
