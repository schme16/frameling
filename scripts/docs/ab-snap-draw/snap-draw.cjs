// A zigzag drawn in three strokes, each one starting a few pixels off where the last one ended and the last one stopping
// a little short of a guide: before (no snapping for the brush) and after (start and end pulled onto line ends and the
// guide). Shot in the real app, once per theme. One entry, run against two builds:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-snap-draw --renderer <vite build --outDir dir> --out <raw dir>
// then scripts/docs/ab-snap-draw/caption.sh <raw before> <raw after> <out dir> burns the captions in and lays them side by side.
// The document at 100%, so the pull (8 screen pixels) is 8 document pixels and the lines are thin enough for a gap to show.
const L = require('../help/_lib.cjs');
const at = (x, y) => [Math.round(495 + (x - 700)), Math.round(269 + (y - 360))];
// The stage point (700, 360) goes to window point (495, 269) wherever the canvas really sits in this layout.
const fit = L.js('(() => { const r = document.querySelector(".cv-root").getBoundingClientRect(); __frameling.store().setUi({ zoom: 1, panX: 495 - r.left - 700, panY: 269 - r.top - 360 }); })()');
const away = { move: [720, 28] };
const blue = '#2d3f6e';
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; d.guides = [{ id: 'g-end', axis: 'x', at: 900 }]; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);
const BRUSH = L.js('__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 3, thinning: 0, smoothing: 0.4, streamline: 0.3, taperStart: 0, taperEnd: 0 } }));');
// The first stroke is already there (as if drawn a moment ago), ending at (560, 330).
const FIRST = L.js(`(() => { const S = __frameling.store(); S.update('first line', (d) => { const l = d.layers[d.layers.length - 1]; const dr = d.drawings[l.cels[0].drawingId]; const pts = Array.from({ length: 30 }, (_, i) => { const t = i / 29; return { x: 390 + 170 * t, y: 480 - 150 * t + 12 * Math.sin(t * Math.PI * 2), p: 0.5 }; }); dr.shapes.push({ id: 'first', type: 'stroke', points: pts, brush: { size: 3, thinning: 0, smoothing: 0.4, streamline: 0.3, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: d.background === '#ffffff' ? '${blue}' : '#f3ecd9', opacity: 1 }); }); })()`);
// A drawn stroke from a to b (with a bend), held still at the end for `rest` ms before the pen lifts, so the pull and its ring can be seen.
const stroke = (a, b, bend = 0, rest = 900) => {
  const pts = Array.from({ length: 24 }, (_, i) => { const t = i / 23; return at(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + bend * Math.sin(t * Math.PI)); });
  // Hovers a moment first, so the ring where the line would start can be seen.
  return [{ move: pts[0] }, { wait: 800 }, { down: pts[0] }, ...pts.slice(1).flatMap((p) => [{ held: p }, { wait: 14 }]), { wait: rest }, { up: pts[pts.length - 1] }];
};

module.exports = [
  {
    name: 'zigzag',
    prefs: { firstDrawn: true, showTips: false, reduceMotion: false },
    width: 840,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700), PAPER, BRUSH, FIRST, L.wait(500), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [140, 50, 626, 380], every: 80 },
      L.wait(700),
      // Starts a few pixels off the end of the first line, up and over.
      ...stroke([565, 335], [720, 250], -22, 900), L.wait(500),
      // Starts a few pixels off the end of that one, down and across, stopping a little short of the guide.
      ...stroke([724, 254], [894, 420], 18, 1200), L.wait(1400),
      { rec: 'stop' },
    ],
  },
];
