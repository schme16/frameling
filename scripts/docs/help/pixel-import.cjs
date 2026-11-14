// Help pictures for bringing in pictures and sprite sheets. See help-media.cjs for the entry format.
const fs = require('node:fs');
const path = require('node:path');
const { js, wait } = require('./_lib.cjs');

const F = '__frameling';
const bytes = (name) => JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, 'assets', name))));
// Clicks the button (or radio) in the open dialog whose text is exactly `text`.
const press = (text) =>
  js(`[...document.querySelectorAll('.im-modal button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);

module.exports = [
  {
    // The little slime as an animated GIF, in the dialog: frames, delays, the way it becomes.
    name: 'pixel-import',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`void __framelingPicture.open(${bytes('slime-bounce.gif')}, 'slime-bounce.gif'); 0`),
      wait(900),
      press('Animation'),
      wait(300),
      { shot: '@', el: '.im-modal', pad: 12 },
    ],
  },
  {
    // The colours of a picture: the limit set, the swatches of what will be taken.
    name: 'palette-picture',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`localStorage.removeItem('frameling.import.v1'); void __framelingPicture.palette(${bytes('scenery.png')}, 'scenery.png'); 0`),
      wait(1200),
      js(`(() => { const i = document.querySelector('.im-modal input[data-testid="palette.max"]'); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, '12'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`),
      wait(900),
      { shot: '@', el: '.im-modal', pad: 12 },
    ],
  },
  {
    // A sprite sheet cut by a grid: the cells outlined and numbered, the margin and spacing set.
    name: 'pixel-import-sheet',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`void __framelingPicture.open(${bytes('slime-sheet.png')}, 'slime-sheet.png'); 0`),
      wait(900),
      press('Grid'),
      wait(300),
      js(`(() => { const set = (label, v) => { const i = [...document.querySelectorAll('.im-field')].find((f) => f.textContent.startsWith(label))?.querySelector('input'); if (!i) return; const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('Cell width', 28); set('Cell height', 24); set('Margin', 1); set('Spacing', 1); })()`),
      wait(500),
      { shot: '@', el: '.im-modal', pad: 12 },
    ],
  },
  {
    // The slime with two slices: a body with a pivot at its feet and a 9-patch panel, the Slices list beside them.
    name: 'pixel-slices',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`void __framelingPicture.open(${bytes('slime-sheet.png')}, 'slime-sheet.png'); 0`),
      wait(900),
      press('Grid'),
      js(`(() => { const set = (label, v) => { const i = [...document.querySelectorAll('.im-field')].find((f) => f.textContent.startsWith(label))?.querySelector('input'); if (!i) return; const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('Cell width', 28); set('Cell height', 24); set('Margin', 1); set('Spacing', 1); })()`),
      wait(300),
      press('Bring it in'),
      wait(900),
      js(`(() => { const st = ${F}.store(); const l = st.get().doc.layers.find((x) => x.kind === 'pixel'); st.update('Slices', (d) => { const lay = d.layers.find((x) => x.id === l.id); lay.slices = [ { id: 'a', name: 'body', x: 4, y: 5, w: 20, h: 17, pivot: { x: 14, y: 22 } }, { id: 'b', name: 'panel', x: 0, y: 0, w: 28, h: 24, center: { x: 6, y: 6, w: 16, h: 12 } } ]; }); })()`),
      js(`${F}.run('tools.slice')`),
      js(`${F}.showPanel('slices')`),
      js(`${F}.run('view.zoom100')`),
      ...Array.from({ length: 5 }, () => js(`${F}.run('view.zoomIn')`)),
      js(`${F}.run('view.center')`),
      wait(800),
      { shot: '@' },
    ],
  },
];
