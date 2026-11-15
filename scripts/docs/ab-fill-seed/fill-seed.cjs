// Clicking a frying pan's narrow handle with the paint bucket (brand/ab/fill-seed). The pan is a round body of thick
// lines with a small break in the rim at the top, and a handle that is a narrow corridor. Before, the bucket quietly
// threw away most of the gap setting to start in the handle and then reported the pan as not closed. After, it keeps
// as much of the setting as the handle has room for (or says plainly that there is not enough room).
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-fill-seed --renderer <dir> --out <dir>
const L = require('../help/_lib.cjs');
const away = { move: [720, 28] };
const INK = '#25233a';
let n = 0;
const stroke = (pts) => ({ id: `fs${++n}`, type: 'stroke', points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), brush: { size: 16, thinning: 0, smoothing: 0.5, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: INK, opacity: 1 });
const arc = (cx, cy, r, a0, a1) => { const k = Math.ceil(((a1 - a0) * r) / 4); return Array.from({ length: k + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / k; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; }); };
// Same pan as test/geometry/helpers.ts, moved to the middle of the 1280 x 720 page.
const pan = (g) => [
  stroke(arc(640, 360, 100, 0.18, 1.5 * Math.PI - g)),
  stroke(arc(640, 360, 100, 1.5 * Math.PI + g, 2 * Math.PI - 0.18)),
  stroke([[735, 342], [820, 342]]), stroke([[735, 378], [820, 378]]), stroke([[820, 342], [820, 378]]),
];
// View: zoom 1 with stage point (700, 360) at the viewport middle (495, 269).
const view = L.js('__frameling.store().setUi({ zoom: 1, panX: 382 - 700, panY: 222 - 360 })');
// The page sits 31px right of where the pan/zoom maths puts it (measured from a shot), so the click is nudged to match.
const at = (x, y) => [Math.round(526 + (x - 700)), Math.round(269 + (y - 360))];
const put = (shapes) => L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); S.setUi({ activeLayerId: S.get().doc.layers[0].id, fillColor: '#e0788f' }); })()`);
const medium = L.js("[...document.querySelectorAll('.fl-fill-seg button')].find((b) => b.textContent.trim() === 'Medium').click()");
const entry = (name, g) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, showWelcome: false, reduceMotion: true },
  steps: [L.template('blank-vector'), view, put(pan(g)), L.cmd('tools.fill'), L.wait(700), medium, L.wait(500), away, L.wait(400),
    { click: at(790, 360) }, L.wait(1400), { shot: '@', crop: [113, 47, 764, 444] }],
});
module.exports = [entry('handle-fits', 0.15), entry('handle-cramped', 0.2)];
