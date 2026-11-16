// Before and after looks for fn-image-sequence-import, fn-svg-import and fn-psd-import (brand/ab/import-batch). The "after"
// entries run on this branch; before.cjs does the closest thing the old app could. Names are `<name>`; each is made in dark
// and light. Run through help-media.cjs with --entries, --renderer and --out (see docs/testing.md).
const fs = require('node:fs');
const path = require('node:path');
const { cmd, js, wait } = require('../help/_lib.cjs');

const asset = (name) => path.join(__dirname, '../help/assets', name);
const bytes = (name) => JSON.stringify(Array.from(fs.readFileSync(asset(name))));
const text = (name) => JSON.stringify(fs.readFileSync(asset(name), 'utf8'));
const help = require('../help/import.cjs');
const FRAMES = help[0].steps[0];

const toastButton = (label) => js(`[...document.querySelectorAll('[data-testid^="toast."]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click(); 0`);

module.exports = [
  {
    // The command palette searched for "import": the way in to every importer (they are in File > Import too).
    name: 'palette-import',
    prefs: { showTips: false, firstDrawn: true },
    steps: [cmd('view.commandPalette'), wait(700), { type: 'import', after: 700 }, wait(500), { shot: '@', el: '.ui-palette', pad: 12 }],
  },
  { name: 'sequence-dialog', prefs: { showTips: false, firstDrawn: true }, steps: [FRAMES, wait(1500), { shot: '@', el: '.im-modal', pad: 12 }] },
  {
    name: 'svg-in',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.svg(${text('import-logo.svg')}, 'badge.svg', false); 0`), wait(1500), { shot: '@' }],
  },
  {
    name: 'svg-left-out',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.svg(${text('import-logo.svg')}, 'badge.svg', false); 0`), wait(1200), toastButton('See what was left out'), wait(500), { shot: '@', el: '.io-modal', pad: 12 }],
  },
  {
    name: 'svg-broken',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.svg('<svg xmlns="http://www.w3.org/2000/svg" width="10"><g><path d="M0 0"></svg>', 'broken.svg', false); 0`), wait(900), { shot: '@' }],
  },
  {
    name: 'layered-in',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.layered(${bytes('import-scene.psd')}, 'scene.psd', false); 0`), wait(1500), { shot: '@' }],
  },
  {
    name: 'layered-left-out',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.layered(${bytes('import-scene.psd')}, 'scene.psd', false); 0`), wait(1200), toastButton('See what was left out'), wait(500), { shot: '@', el: '.io-modal', pad: 12 }],
  },
  {
    name: 'layered-broken',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.layered(${JSON.stringify(Array.from(fs.readFileSync(asset('import-scene.psd')).subarray(0, 300)))}, 'scene.psd', false); 0`), wait(900), { shot: '@' }],
  },
  {
    name: 'ora-in',
    prefs: { showTips: false, firstDrawn: true },
    steps: [js(`void __framelingImport.layered(${bytes('import-scene.ora')}, 'scene.ora', false); 0`), wait(1500), { shot: '@' }],
  },
];
