// Each new pixel brush laid beside the vector brush of the same name (card pixel-brush-parity, piece 3), one entry a group.
// Same path, same pen pressure, same colour, on white, both at 100%. Writes <group>-v.png (the vector brush on a vector
// layer) and <group>-p.png (the pixel brush on a pixel layer), four lanes a picture, top to bottom in the order of GROUPS.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only presets-pencils,... --out <dir> --theme light
// scripts/docs/ab-brush-parity/sheets.py turns the pictures into one sheet a group.
const { L } = require('../ab-pixel-brush/_draw.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const F = '__frameling';
const GROUPS = {
  pencils: ['mechanical', 'colour-pencil', 'sketch-pencil'],
  pens: ['gel', 'ballpoint', 'brush-pen', 'dip-pen'],
  markers: ['fine-marker', 'block-marker', 'brush-marker'],
  paint: ['tapered', 'round-brush', 'dry-brush'],
  'chalk-and-charcoal': ['charcoal', 'oil-pastel'],
  'stamps-and-texture': ['leaves', 'falling-leaves', 'paw-prints', 'dashed-line'],
  calligraphy: ['broad', 'round-nib'],
  'pen-and-speed': ['pressure-pencil', 'pressure-spray'],
  'scatter-and-spray': ['speckle', 'sprinkle'],
  shapes: ['slash'],
};
// The pixel brush that pairs with each vector brush (the ones whose ids differ).
const PIXEL_ID = { 'sketch-pencil': 'sketch-pencil-medium', 'dry-brush': 'dry-brush-crayon', broad: 'broad-nib' };
const px = (v) => `starter:px-${PIXEL_ID[v] ?? v}`;
// An S curve with a bell of pressure: light, hard in the middle, light.
const path = (cy) => Array.from({ length: 64 }, (_, i) => { const t = i / 63; return [Math.round(36 + t * 440), Math.round(cy + 16 * Math.sin(t * Math.PI * 2)), Math.round((0.2 + 0.8 * Math.sin(Math.PI * t)) * 100) / 100]; });
const draw = (cy) => L.js(`__sp.stroke(${JSON.stringify(path(cy))}, { pen: true, delay: 8 })`);
const ink = L.js(`${F}.store().setUi({ color: '#1b1a20' })`);
const white = L.js(`${F}.store().update('paper', (d) => { d.background = '#ffffff'; })`);
const stage = (name) => ({ shot: name, el: '.cv-layer', pad: 0 });
const lanes = (ids, make) => ids.flatMap((v, i) => [L.js(`${F}.run(${JSON.stringify(make(v))})`), L.wait(150), ink, draw(64 + 128 * i), L.wait(100)]);
const entry = (g, ids) => ({
  name: `presets-${g}`,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  size: [1400, 1000],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`),
    L.js(`${F}.store().update('size', (d) => { d.width = 512; d.height = 512; d.background = '#ffffff'; })`), L.js(HELPER), L.cmd('view.zoom100'), L.wait(400),
    ...lanes(ids, (v) => `brush.pick.starter:${v}`), L.wait(300), stage(`${g}-v`),
    L.js(`__framelingPixel.newSprite('picture', 512)`), L.wait(900), white, L.js(HELPER), L.js(`__framelingSoft.edge('smooth')`), L.cmd('view.zoom100'), L.wait(400),
    ...lanes(ids, (v) => `brush.pick.${px(v)}`), L.wait(300), stage(`${g}-p`),
    { shot: '@', crop: [0, 0, 10, 10] },
  ],
});
module.exports = Object.entries(GROUPS).map(([g, ids]) => entry(g, ids));
