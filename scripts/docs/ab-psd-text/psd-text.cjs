// Before and after looks for PSD text that stays editable (brand/ab/psd-text): the same Photoshop file brought in, with the
// title selected so the text options show (or don't), and the list of what was left out, which names the font that is not
// here. The same entries run against the old build (--renderer) and this one; each is made in dark and light.
//   npm run help:media -- --entries scripts/docs/ab-psd-text --out <dir> [--renderer <dir>]
const fs = require('node:fs');
const path = require('node:path');
const { js, wait } = require('../help/_lib.cjs');

const bytes = JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, '../help/assets/import-text.psd'))));
const toastButton = (label) => js(`[...document.querySelectorAll('[data-testid^="toast."]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click(); 0`);
const bring = js(`void __framelingImport.layered(${bytes}, 'slime-title.psd', false); 0`);
/** Select the Title layer, and its words when they are text, with the Select tool. */
const pickTitle = js(`(() => {
  const s = __frameling.store();
  const { doc } = s.get();
  const layer = doc.layers.find((l) => l.name === 'Title');
  const d = layer && doc.drawings[layer.cels[0]?.drawingId];
  const shape = d && d.kind === 'vector' ? d.shapes.find((x) => x.type === 'text') : null;
  s.setUi({ tool: 'select', activeLayerId: layer.id, frame: 0, selection: shape ? [shape.id] : [] });
  return shape ? 'text' : 'picture';
})()`);
/** The text options in the Properties panel, scrolled to the top of the panel when there are any. */
const showTextOptions = js(`(() => { const el = document.getElementById('rd-sec-text'); if (el) el.scrollIntoView({ block: 'start' }); return el ? 'text options' : 'none'; })()`);
const base = { prefs: { showTips: false, firstDrawn: true }, size: [1400, 900], width: 1200 };

module.exports = [
  { name: 'in', ...base, steps: [bring, wait(1800), { shot: '@' }] },
  { name: 'selected', ...base, steps: [bring, wait(1800), pickTitle, wait(900), showTextOptions, wait(500), { shot: '@' }] },
  { name: 'left-out', ...base, steps: [bring, wait(1500), toastButton('See what was left out'), wait(600), { shot: '@', el: '.io-modal', pad: 12 }] },
];
