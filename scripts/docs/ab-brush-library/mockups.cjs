// Layout mockups for a big brush library (brand/ab/brush-library), shot in the real app with the debug stand-in in
// src/brushes/debug.ts. Each entry runs once per theme. Names: <layout>-<small|large>[-open].
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-library --out <dir> [--only a-small,...]
const L = require('../help/_lib.cjs');
const mock = (patch) => L.js(`__brushMock.set(${JSON.stringify(patch)})`);
const FULL = process.env.FULL === '1';
// The options panel and what is beside it; the window is 1400 x 900 and the right dock starts near x 1000.
const CROP = [820, 40, 580, 500];
// The panel layout needs the whole column.
const TALL = [820, 40, 580, 820];

const entry = (name, patch, extra = []) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 900],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700),
    mock(patch), L.wait(500),
    ...extra, L.wait(500),
    { move: [300, 20] }, L.wait(300),
    FULL ? { shot: '@' } : { shot: '@', crop: name.startsWith('b-') ? TALL : CROP },
  ],
});

// The Brushes panel docked under the Tool options in the right column, as a person would place it.
const DOCK = L.js("__frameling.dock.placePanel('brushes-mock', { zone: 'right', group: 0, split: 'after' })");
const open = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const type = (q) => [L.js("document.querySelector('.mk-search input').focus()"), { type: q }];

module.exports = [
  entry('a-small', { layout: 'A', n: 4, activeId: 'starter:ink' }),
  entry('a-large', { layout: 'A', n: 999, activeId: 'mock:Inking:1' }),
  entry('a-large-open', { layout: 'A', n: 999, activeId: 'mock:Inking:1' }, [open('.mk-more'), L.wait(400)]),
  entry('b-small', { layout: 'B', n: 4, activeId: 'starter:ink' }, [DOCK, L.wait(700)]),
  entry('b-large', { layout: 'B', n: 999, activeId: 'mock:Inking:1' }, [DOCK, L.wait(700)]),
  entry('c-small', { layout: 'C', n: 4, activeId: 'starter:ink' }),
  entry('c-small-open', { layout: 'C', n: 4, activeId: 'starter:ink' }, [open('.mk-brushbtn'), L.wait(400)]),
  entry('c-large', { layout: 'C', n: 999, activeId: 'mock:Inking:1' }),
  entry('c-large-open', { layout: 'C', n: 999, activeId: 'mock:Inking:1' }, [open('.mk-brushbtn'), L.wait(400)]),
  entry('d-small', { layout: 'D', n: 4, activeId: 'starter:ink' }),
  entry('d-large', { layout: 'D', n: 999, activeId: 'mock:Inking:1' }),
  entry('d-large-typing', { layout: 'D', n: 999, activeId: 'mock:Inking:1' }, type('pen')),
];
