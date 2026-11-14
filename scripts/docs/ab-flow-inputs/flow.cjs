// The Clip flow panel before and after inputs, and an arrow with a check on it. Each entry runs once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-flow-inputs --out brand/ab/flow-inputs/raw [--renderer <dir>]
// "Before" is shot from a build of development (--renderer), with the hero template's own flow. "After" needs this branch's build.
const L = require('../help/_lib.cjs');

const PANEL = [1000, 40, 360, 800];

/** The hero's clip flow with inputs: run on speed, jump only when grounded, hurt on a hit and die at no health, both from any clip. */
const demo = L.js(`(() => { const s = __frameling.store(); s.update('setup', (d) => { const id = (n) => d.clips.find((c) => c.name === n).id; let k = 0; const t = (from, to, when, extra) => ({ id: 'd' + k++, from, to, when, ...extra }); d.flow = { start: id('idle'), inputs: [{ name: 'speed', kind: 'number' }, { name: 'grounded', kind: 'toggle', start: true }, { name: 'health', kind: 'number', start: 3 }], transitions: [ t(id('idle'), id('run'), 'now', { conditions: [{ input: 'speed', op: '>', value: 0.5 }], blend: 0.2 }), t(id('run'), id('idle'), 'now', { conditions: [{ input: 'speed', op: '<=', value: 0.5 }] }), t(id('run'), id('jump'), 'trigger', { trigger: 'jump', conditions: [{ input: 'grounded', op: '==', value: true }] }), t(id('jump'), id('idle'), 'end'), t('*', id('hurt'), 'trigger', { trigger: 'hit' }), t(id('hurt'), id('idle'), 'end'), t('*', id('die'), 'now', { conditions: [{ input: 'health', op: '<=', value: 0 }] }) ], positions: { [id('idle')]: { x: 10, y: 90 }, [id('run')]: { x: 190, y: 10 }, [id('jump')]: { x: 190, y: 130 }, [id('hurt')]: { x: 10, y: 190 }, [id('die')]: { x: 190, y: 250 }, '*': { x: 10, y: 290 } } }; }); return true; })()`);
const open = [L.template('hero-sprites'), L.panel('clip-flow'), L.wait(500)];
const park = [{ move: [300, 20] }, L.wait(300)];
// The scroll box round the panel, taken to the arrow's settings.
const toEditor = L.js(`(() => { document.querySelector('.fl-edit').scrollIntoView({ block: 'end' }); return true; })()`);

module.exports = [
  { name: 'flow-before', size: [1400, 900], width: 700, steps: [...open, L.wait(300), ...park, { shot: '@', crop: PANEL }] },
  { name: 'flow-after', size: [1400, 900], width: 700, steps: [...open, demo, L.wait(600), ...park, { shot: '@', crop: PANEL }] },
  {
    name: 'flow-arrow',
    size: [1400, 900],
    width: 700,
    steps: [...open, demo, L.wait(500), { clickOn: '.fl-link', text: 'speed > 0.5', after: 400 }, toEditor, L.wait(400), ...park, { shot: '@', crop: PANEL }],
  },
];
