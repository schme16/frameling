// Round two of the brush library mockups (brand/ab/brush-library-v2): the dropdown picker, shot in the real app with the
// debug stand-in in src/brushes/mock/Picker.tsx. Each entry runs once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-picker --out <dir> [--only main-large-open,...]
const L = require('../help/_lib.cjs');
const mock = (patch) => L.js(`__brushMock.set(${JSON.stringify(patch)})`);
// The options column and the panel dropping from the brush button; the window is 1400 x 900.
const OPEN_CROP = [885, 40, 450, 780];
const WIDE_CROP = [700, 40, 640, 860];
const REST_CROP = [1000, 40, 400, 300];

const base = { layout: 'P', rows: 'tip', rowScale: 1, opened: null, query: '' };
const entry = (name, patch, extra = [], crop = OPEN_CROP) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 900],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700),
    mock({ ...base, ...patch }), L.wait(500),
    ...extra, L.wait(600),
    { move: [300, 20] }, L.wait(300),
    { shot: '@', crop },
  ],
});
const open = L.js("document.querySelector('.pk-btn')?.click()");
const typeIn = (q) => [L.js("document.querySelector('.pk-search input').focus()"), { type: q }];

const FRESH = { n: 999, activeId: 'mock:Inking:1' };
module.exports = [
  // The button at rest, which is what sits in the Brush options all the time.
  entry('rest-small', { n: 4, activeId: 'starter:ink' }, [], REST_CROP),
  entry('rest-large', FRESH, [], REST_CROP),
  entry('rest-large-changed', FRESH, [L.js('__brushMock.tweak({ size: 19 })')], REST_CROP),
  // The main picker.
  entry('main-small-open', { n: 4, activeId: 'starter:ink' }, [open], OPEN_CROP),
  entry('main-large-open', FRESH, [open]),
  entry('main-large-recent', { ...FRESH, opened: ['Recent'] }, [open]),
  entry('main-large-folded', { ...FRESH, opened: [] }, [open]),
  entry('main-large-typing', FRESH, [open, L.wait(300), ...typeIn('pen')]),
  // Dragged wider and taller from the bottom-left grip, with the two-column rows (the panel grows left and down from the dock).
  entry('main-large-wide', { ...FRESH, rows: 'two', opened: ['Inking', 'Calligraphy'] }, [open, L.wait(300), { dragOn: '.pk-grip', to: '.pk-grip', toDx: -170, toDy: 110 }], WIDE_CROP),
  // The three rows, same library, same open group, so only the row differs.
  entry('row-sample', { ...FRESH, rows: 'sample', opened: ['Inking'] }, [open]),
  entry('row-tip', { ...FRESH, rows: 'tip', opened: ['Inking'] }, [open]),
  entry('row-two', { ...FRESH, rows: 'two', opened: ['Inking'] }, [open]),
];
