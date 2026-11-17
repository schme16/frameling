// The Tool options of the three brush states a person meets, with every fold open, and the two brush lists open (card pixel-brush-parity).
//   vector   the Brush on a vector layer
//   pixel    the Pixel brush tool on a pixel layer (the one with the saved brushes)
//   plain    the Brush (B) on a pixel layer, which is a different, much smaller panel
//   lists-*  the brush list open on the vector side and on the pixel side
const { L, start } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';
const openAll = L.js(`(async () => { for (let i = 0; i < 5; i++) { document.querySelectorAll('#ui-panel-tool-options [data-fold][aria-expanded="false"]').forEach((b) => b.click()); document.querySelectorAll('#ui-panel-tool-options details').forEach((d) => (d.open = true)); await new Promise((r) => setTimeout(r, 200)); } })()`);
const showOpts = L.js(`${F}.showPanel('tool-options')`);
const H = 5200;
const entry = (name, steps, shot) => ({ name, prefs: { firstDrawn: true, showTips: false, showQuill: false, rightSide: 'tabs' }, size: [1400, H], width: 1400, steps: [...steps, L.wait(500), shot ? shot : { shot: '@', el: '#ui-panel-tool-options', pad: 0 }] });
const pixelSetup = (tool) => [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), L.js(`${F}.store().setUi({ tool: ${JSON.stringify(tool)} })`), showOpts, L.wait(500), openAll, L.wait(500)];
const vectorSetup = [L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.cmd('tools.brush'), showOpts, L.wait(500), openAll, L.wait(500)];
const openList = L.js("document.querySelector('#ui-panel-tool-options .pk-btn').click()");
module.exports = [
  entry('panel-vector', vectorSetup),
  entry('panel-pixel', pixelSetup('pixel-brush')),
  entry('panel-plain', pixelSetup('brush')),
  entry('list-vector', [L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.cmd('tools.brush'), showOpts, L.wait(500), openList, L.wait(1500), L.js("[...document.querySelectorAll('.pk-group')].find((h) => h.querySelector('.pk-group-name').textContent === 'Pens')?.click()"), L.wait(2500)], { shot: '@', el: '.pk-pop', pad: 6 }),
  entry('list-pixel', [...pixelSetup('pixel-brush').slice(0, -2), openList, L.wait(2500)], { shot: '@', el: '.pk-pop', pad: 6 }),
];
