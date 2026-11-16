// Before and after for saved selections: the sun is saved as "Sun and sky", something else is picked, and then the sun comes
// back with one press of Bring back. Run with
//   help-media.cjs --entries scripts/docs/ab-saved-selections --out <dir>
const { F, S, js, wait, start } = require('../ab-selection-edge/_scene.cjs');

const CROP = [478, 272, 412, 262];
const prefs = { showTips: false, firstDrawn: true, showQuill: false };
const saveAll = () => [
  js(`${S}.disc(16, 18, 12)`),
  js(`${S}.edge('feather', 2)`),
  js(`${S}.save('Sun and sky')`),
  js(`${S}.box(34, 4, 60, 36)`),
  js(`${S}.save('Purple field')`),
  wait(300),
];

module.exports = [
  // Something else is selected now.
  { name: 'saved-before', prefs, steps: [...start(), ...saveAll(), js(`${S}.box(34, 4, 60, 36)`), wait(600), { shot: '@', crop: CROP }] },
  // The sun, brought back by name.
  { name: 'saved-after', prefs, steps: [...start(), ...saveAll(), js(`${S}.bringBack('Sun and sky')`), wait(600), { shot: '@', crop: CROP }] },
];
