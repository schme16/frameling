// What picking a brush from the other side does today (logged, no picture).
const { L, start } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';
const state = (tag) => ({ log: `(() => { const s = ${F}.store().get(); const l = s.doc.layers.find((x) => x.id === s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]; return ${JSON.stringify(tag)} + ': layer=' + l?.kind + ' tool=' + s.ui.tool + ' brush.size=' + s.ui.brush.size + ' tip=' + (s.ui.brush.tip?.kind ?? 'plain') + ' pixelBrushSize=' + ${F}.toolSettings.get().pixelBrushSize + ' dab.size=' + __framelingDab.settings().size; })()` });
module.exports = [
  { name: 'swap', prefs: { firstDrawn: true, showTips: false, showQuill: false }, size: [1400, 1000], width: 1400, steps: [
    L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
    L.js(`${F}.store().setUi({ tool: 'brush' })`), L.wait(300), state('pixel layer, Brush picked'),
    L.js(`${F}.run('brush.pick.starter:chalk')`), L.wait(400), state('after Brush: Chalk (a vector brush) on a pixel layer'),
    L.js(`${F}.run('brush.pick.starter:px-round6')`), L.wait(400), state('after Brush: Round 6 (a pixel brush)'),
    L.template('blank-vector'), L.wait(700), L.js(`${F}.store().setUi({ tool: 'brush' })`), L.wait(300), state('vector layer, Brush picked'),
    L.js(`${F}.run('brush.pick.starter:px-round6')`), L.wait(400), state('after Brush: Round 6 (a pixel brush) on a vector layer'),
    { shot: '@', crop: [0, 0, 10, 10] },
  ] },
];
