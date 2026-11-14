// Help pictures for bringing in work from elsewhere: a folder or zip of pictures, an SVG, a layered file. See
// help-media.cjs for the entry format. The files are made by scripts/fixtures/make-import-fixtures.ts (the scene) and
// assets/import-logo.svg; the frames are drawn in the page.
const fs = require('node:fs');
const path = require('node:path');
const { js, wait } = require('./_lib.cjs');

const asset = (name) => path.join(__dirname, 'assets', name);
const bytes = (name) => JSON.stringify(Array.from(fs.readFileSync(asset(name))));
const text = (name) => JSON.stringify(fs.readFileSync(asset(name), 'utf8'));

// Twelve frames of a slime bouncing, drawn on a canvas in the page, as PNG bytes; run_7 is missing, run_13 is damaged,
// and notes.txt comes along, so the dialog has something to say it left out.
const FRAMES = `(async () => {
  const mk = async (i) => {
    const c = new OffscreenCanvas(96, 72);
    const g = c.getContext('2d');
    g.fillStyle = '#79b8ff'; g.fillRect(0, 0, 96, 72);
    g.fillStyle = '#4f9d69'; g.fillRect(0, 58, 96, 14);
    const t = Math.abs(Math.sin((i / 12) * Math.PI));
    const y = 52 - t * 26, rx = 14 - t * 3, ry = 11 + t * 4;
    g.fillStyle = '#2d7d5a'; g.beginPath(); g.ellipse(48, y, rx + 2, ry + 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6fd3a0'; g.beginPath(); g.ellipse(48, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillRect(41, y - 5, 4, 5); g.fillRect(51, y - 5, 4, 5);
    g.fillStyle = '#1c2b24'; g.fillRect(42, y - 3, 2, 3); g.fillRect(52, y - 3, 2, 3);
    const b = await c.convertToBlob({ type: 'image/png' });
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  };
  const files = [];
  for (let i = 1; i <= 12; i++) if (i !== 7) files.push({ path: 'run_' + i + '.png', bytes: await mk(i) });
  files.push({ path: 'run_13.png', bytes: [137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2] });
  files.push({ path: 'notes.txt', bytes: [104, 105] });
  void __framelingImport.sequence(files, 'run');
})(); 0`;

module.exports = [
  {
    // The dialog, before anything is brought in: what it found, what it left out, how it plays.
    name: 'import-sequence',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(FRAMES), wait(1500), { shot: '@', el: '.im-modal', pad: 12 }],
  },
  {
    // A badge from Inkscape: layers and shapes in, a toast saying what couldn't come across.
    name: 'import-svg',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.svg(${text('import-logo.svg')}, 'badge.svg', false); 0`), wait(1500), { shot: '@' }],
  },
  {
    // A small Photoshop scene: layers in order, the folder, the blend mode; a toast saying the adjustment layer was left out.
    name: 'import-layered',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.layered(${bytes('import-scene.psd')}, 'scene.psd', false); 0`), wait(1500), { shot: '@' }],
  },
];
