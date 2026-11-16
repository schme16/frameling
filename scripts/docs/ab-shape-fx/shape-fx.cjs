// The look for effects on one shape (brand/ab/shape-fx): a soft shadow under a character and a glow round a title, each the old
// way (the shape alone on a layer of its own, with the layer's effect) and the new way (the shape picked, with the effect on the
// shape). The same picture either way; the new way needs no extra layer, and the layers list in each picture shows it.
// `-panel` is the Effects panel with the shape picked (the new way only).
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-shape-fx --out brand/ab/shape-fx
const { scene } = require('./_scene.cjs');

const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
// Window coordinates (1280 x 800): the canvas and the layers list on the left, Properties on the right.
const CANVAS_AND_LAYERS = [140, 45, 735, 640];
const PANEL = [885, 40, 320, 730];

const entries = [];
for (const kind of ['shadow', 'glow']) {
  for (const way of ['old', 'new']) {
    entries.push({ name: `${kind}-${way}`, prefs: PREFS, steps: scene(kind, way, [{ shot: '@', crop: CANVAS_AND_LAYERS }]) });
  }
  entries.push({ name: `${kind}-panel`, prefs: PREFS, steps: scene(kind, 'new', [{ shot: '@', crop: PANEL }]) });
}
module.exports = entries;
