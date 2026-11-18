// The Tool options of each brush tool with every fold open, tall enough to show all of it, for the before and after of the shared
// panel (card pixel-brush-parity, piece 4). Run on two renderers (`--renderer <dir>`) into two folders, then sheets-panel.py puts them side by side.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only ps-vector,ps-pixel,ps-soft,ps-dry [--renderer <dir>] --out <dir>
const { L, start } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';
const openAll = L.js(`(async () => { for (let i = 0; i < 5; i++) { document.querySelectorAll('#ui-panel-tool-options [data-fold][aria-expanded="false"]').forEach((b) => b.click()); document.querySelectorAll('#ui-panel-tool-options details').forEach((d) => (d.open = true)); await new Promise((r) => setTimeout(r, 200)); } })()`);
const showOpts = L.js(`${F}.showPanel('tool-options')`);
const entry = (name, steps) => ({ name, prefs: { firstDrawn: true, showTips: false, showQuill: false, rightSide: 'tabs' }, size: [1400, 5200], width: 1400, steps: [...steps, L.wait(500), { shot: '@', el: '#ui-panel-tool-options', pad: 0 }] });
const pixel = (tool, brush) => [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), L.js(`${F}.run('brush.pick.${brush}')`), L.js(`${F}.store().setUi({ tool: ${JSON.stringify(tool)} })`), showOpts, L.wait(500), openAll, L.wait(500)];
module.exports = [
  entry('ps-vector', [L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.cmd('tools.brush'), L.js(`${F}.run('brush.pick.starter:sketch-pencil')`), showOpts, L.wait(500), openAll, L.wait(500)]),
  entry('ps-pixel', pixel('pixel-brush', 'starter:px-round6')),
  entry('ps-soft', pixel('soft-brush', 'starter:px-soft-brush')),
  entry('ps-dry', pixel('charcoal', 'starter:chalk')),
];
