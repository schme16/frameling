// The look for soft paint (brand/ab/soft-paint): each tool drawing a firm stroke, a light stroke, a pen pressure ramp and two
// strokes that cross, in both themes. `smooth` is a real soft edge; `crisp` is the same strokes with the edge dithered (what a
// locked palette, or Pixel perfect left on, gives). The clips show the same scene being drawn.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-soft-paint --out brand/ab/soft-paint
const { TOOLS, scene } = require('./_draw.cjs');

const entries = [];
for (const kind of Object.keys(TOOLS)) {
  for (const edge of ['smooth', 'crisp']) {
    entries.push({
      name: `${kind}-${edge}`,
      prefs: { firstDrawn: true, showTips: false },
      width: 800,
      steps: [...scene(kind, edge), { shot: '@', el: '.cv-root', pad: 0 }],
    });
  }
  entries.push({
    name: `${kind}-clip`,
    prefs: { firstDrawn: true, showTips: false },
    width: 640,
    steps: [...scene(kind, 'smooth').slice(0, 6), { rec: '@', el: '.cv-root', pad: 0, every: 70 }, ...scene(kind, 'smooth').slice(6), { wait: 900 }, { rec: 'stop' }],
  });
}
module.exports = entries;
