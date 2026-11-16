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

// Krita: one lone preset (a generated tip), and presets from a small bundle copied from Krita's own CC0 default brushes.
// A lone preset carries no tip pictures, so every picture tip comes from the bundle, as it would for a person.
const KRITA = [
  { file: fx('krita/Basic-5_Size_default.kpp'), label: 'Basic-5 Size (.kpp)' },
  { file: fx('krita/small-set.bundle'), index: 1, label: 'Pencil-1 Hard (.bundle)' },
  { file: fx('krita/small-set.bundle'), index: 2, label: 'Basic-6 Details (.bundle)' },
  { file: fx('krita/small-set.bundle'), index: 3, label: 'Pencil-4 Soft (.bundle)' },
  { file: fx('krita/small-set.bundle'), index: 4, label: 'Stamp Sparkles (.bundle)' },
  { file: fx('krita/small-set.bundle'), index: 5, label: 'Eraser Circle (.bundle)' },
];

/** Which sets to make: BRUSH_AB_SETS=krita,gimp (default: all). */
const want = (process.env.BRUSH_AB_SETS || 'gimp,photoshop,krita').split(',');
const pick = (name, list) => (want.includes(name) ? list : []);

module.exports = { GIMP: pick('gimp', GIMP), PHOTOSHOP: pick('photoshop', PHOTOSHOP), KRITA: pick('krita', KRITA) };
