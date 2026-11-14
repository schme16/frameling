// The "before" looks: what the app at the base of this branch does. It has no entry for these files, so each is handed to the
// nearest thing it has, the picture reader. Same names as after.cjs.
const fs = require('node:fs');
const path = require('node:path');
const { cmd, js, wait } = require('../help/_lib.cjs');

const asset = (name) => path.join(__dirname, '../help/assets', name);

// The first of the twelve frames, brought in the only way there was: one picture at a time.
const ONE = `(async () => {
  const c = new OffscreenCanvas(96, 72);
  const g = c.getContext('2d');
  g.fillStyle = '#79b8ff'; g.fillRect(0, 0, 96, 72);
  g.fillStyle = '#4f9d69'; g.fillRect(0, 58, 96, 14);
  g.fillStyle = '#6fd3a0'; g.beginPath(); g.ellipse(48, 52, 14, 11, 0, 0, Math.PI * 2); g.fill();
  const b = await c.convertToBlob({ type: 'image/png' });
  void __framelingPicture.open(Array.from(new Uint8Array(await b.arrayBuffer())), 'run_1.png');
})(); 0`;

module.exports = [
  {
    // The command palette searched for "import": the way in to every importer (they are in File > Import too).
    name: 'palette-import',
    prefs: { showTips: false, firstDrawn: true },
    steps: [cmd('view.commandPalette'), wait(700), { type: 'import', after: 700 }, wait(500), { shot: '@', el: '.ui-palette', pad: 12 }],
  },
  { name: 'sequence-dialog', prefs: { showTips: false, firstDrawn: true }, steps: [js(ONE), wait(1500), { shot: '@', el: '.im-modal', pad: 12 }] },
  {
    name: 'svg-in',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingPicture.open(${JSON.stringify(Array.from(fs.readFileSync(asset('import-logo.svg'))))}, 'badge.svg'); 0`), wait(1500), { shot: '@' }],
  },
  {
    name: 'layered-in',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingPicture.open(${JSON.stringify(Array.from(fs.readFileSync(asset('import-scene.psd'))))}, 'scene.psd'); 0`), wait(1500), { shot: '@' }],
  },
];
