// The real brush files the look draws with, one row each. Files from GIMP and Photoshop kept as test fixtures
// (test/fixtures/brushes), plus, if you have them, the ones in BRUSH_AB_EXTRA (a folder of your own .abr or .gbr files).
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../..');
const fx = (p) => path.join(root, 'test/fixtures/brushes', p);
const extra = process.env.BRUSH_AB_EXTRA;
const have = (p) => fs.existsSync(p);

/** `index` is which brush of the file; `size` is how many art pixels the sprite needs. */
const GIMP = [
  { file: fx('gimp/Charcoal-01.gbr'), label: 'Charcoal 01 (.gbr)' },
  { file: fx('gimp/Oils-01.gbr'), label: 'Oils 01 (.gbr)' },
  { file: fx('gimp/confetti.gih'), label: 'Animated Confetti (.gih)' },
  { file: fx('gimp/Hardness-050.vbr'), label: '2. Hardness 050 (.vbr)' },
  { file: fx('gimp/Star.vbr'), label: '2. Star (.vbr)' },
];
const PHOTOSHOP = [
  { file: fx('abr/soft-round.abr'), label: 'Soft Round' },
  { file: fx('abr/tilt-size.abr'), label: 'test2 (size follows tilt)' },
  { file: fx('abr/photoshop_dynamics.abr'), label: 'Patchy Dynamics Probe Dyn' },
  { file: fx('abr/photoshop_dual_brush.abr'), label: 'Patchy Dual Probe' },
  ...(extra && have(path.join(extra, 'special.abr')) ? [3, 5, 4].map((i) => ({ file: path.join(extra, 'special.abr'), index: i, label: `Photoshop preset ${i}` })) : []),
];

module.exports = { GIMP, PHOTOSHOP };
