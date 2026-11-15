// The tester's frying pan split across two layers (brand/ab/fill-layers). The body is outlined in paint on the "Paint
// outline" layer, a line closing the break in its rim is on "Ink", and the bucket is on the empty "Colour" layer underneath,
// with Use lines from all layers on. Before, only lines on other layers were walls, so the paint rim did not count and
// the colour leaked ("not closed in"). After, paint on a layer above is a wall too, so just the inside of the pan fills.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-fill-layers --renderer <dir> --out <dir>
const L = require('../help/_lib.cjs');
const away = { move: [720, 28] };
const INK = '#25233a';
const CX = 640;
const CY = 360;
const arc = (r, a0, a1) => { const k = Math.ceil((Math.abs(a1 - a0) * r) / 3); return Array.from({ length: k + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / k; return { x: CX + Math.cos(t) * r, y: CY + Math.sin(t) * r }; }); };
const a0 = 1.5 * Math.PI + 0.3;
const a1 = 1.5 * Math.PI - 0.3 + 2 * Math.PI;
const rim = { id: 'rim', type: 'fill', color: INK, opacity: 1, paths: [{ closed: true, points: [...arc(108, a0, a1), ...arc(92, a1, a0)] }] };
let n = 0;
const line = (pts) => ({ id: `ln${++n}`, type: 'stroke', points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), brush: { size: 16, thinning: 0, smoothing: 0.5, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: INK, opacity: 1 });
const s = 100 * Math.sin(0.3);
const ink = [line([[CX - s - 6, CY - 92], [CX + s + 6, CY - 92]]), line([[CX + 108, CY - 10], [CX + 190, CY - 10]]), line([[CX + 108, CY + 10], [CX + 190, CY + 10]]), line([[CX + 190, CY - 10], [CX + 190, CY + 10]])];
const view = L.js('__frameling.store().setUi({ zoom: 1, panX: 382 - 700, panY: 222 - 360 })');
const at = (x, y) => [Math.round(526 + (x - 700)), Math.round(269 + (y - 360))];
const put = L.js(`(() => {
  const S = __frameling.store();
  const rim = ${JSON.stringify(rim)};
  const ink = ${JSON.stringify(ink)};
  S.update('setup', (d) => {
    const len = d.length;
    const mk = (id, name, shapes) => {
      d.drawings['d-' + id] = { id: 'd-' + id, kind: 'vector', shapes };
      return { id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c-' + id, start: 0, length: len, drawingId: 'd-' + id }] };
    };
    d.layers = [mk('colour', 'Colour', []), mk('paint', 'Paint outline', [rim]), mk('ink', 'Ink', ink)];
  });
  S.setUi({ activeLayerId: 'colour', fillColor: '#e0788f' });
  __frameling.fill.set({ allLayers: true, gap: 'small' });
})()`);
module.exports = [
  {
    name: 'two-layer-pan',
    prefs: { firstDrawn: true, showTips: false, showWelcome: false, reduceMotion: true },
    steps: [L.template('blank-vector'), view, put, L.cmd('tools.fill'), L.wait(700), away, L.wait(400), { click: at(CX, CY) }, L.wait(1400), { shot: '@', crop: [113, 47, 764, 444] }],
  },
];
