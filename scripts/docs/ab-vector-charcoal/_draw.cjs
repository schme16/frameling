// Shared by the vector chalk and charcoal entries: the same scene the pixel dry media were judged on (a firm stroke, a light
// stroke, a pressure ramp and three passes over each other, drawn with a pretend pen through real pointer events), but drawn
// with the vector Brush and the starter brushes, on a 400 x 400 page at the same size. Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const { PATHS, INK, PAPER, DARK, ballPaths } = require('../ab-charcoal/_draw.cjs');
const F = '__frameling';

const draw = (path, o) => L.js(`__sp.stroke(${JSON.stringify(path)}, ${JSON.stringify(o ?? {})})`);

/** A fresh vector page 400 x 400 on paper, with the brush tool and a starter brush picked. `fx` is JS run on the page after the brush is picked. */
function start(id, o = {}) {
  return [
    L.template('blank-vector'),
    L.wait(700),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.width = 400; d.height = 400; d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.cmd('tools.brush'),
    L.wait(300),
    L.js(`${F}.run(${JSON.stringify(`brush.pick.starter:${id}`)})`),
    L.wait(300),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'brush', color: dark ? ${JSON.stringify(INK[id][1])} : ${JSON.stringify(INK[id][0])} }); })()`),
    ...(o.size ? [L.js(`${F}.store().setUi((u) => ({ brush: { ...u.brush, size: ${o.size} } }))`)] : []),
    ...(o.holes ? [L.js(`${F}.store().setUi((u) => ({ brush: { ...u.brush, tip: { ...u.brush.tip, dry: undefined } } }))`)] : []),
    L.wait(300),
  ];
}

/** The four marks for one brush. */
function scene(id, o = {}) {
  return [
    ...start(id, o),
    draw(PATHS.firm, { pen: true, delay: 10 }),
    draw(PATHS.light, { pen: true, delay: 10 }),
    draw(PATHS.ramp, { pen: true, delay: 12 }),
    draw(PATHS.passA, { pen: true, delay: 10 }),
    draw(PATHS.passB, { pen: true, delay: 10 }),
    draw(PATHS.passC, { pen: true, delay: 10 }),
    { move: [640, 780] },
    L.wait(500),
  ];
}

/** The ball, shaded with hatching. */
function ball(id, o = {}) {
  return [...start(id, o), ...ballPaths().map((p) => draw(p, { pen: true, delay: 3 })), { move: [640, 780] }, L.wait(500)];
}

module.exports = { scene, ball, start, draw, INK };
