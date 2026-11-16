// Help picture for saved selections: the list, with a few kept and the name box ready for the next.
const { F, S, js, wait, start } = require('../ab-selection-edge/_scene.cjs');

module.exports = [
  {
    name: 'saved-selections',
    prefs: { showTips: false, firstDrawn: true, showQuill: false },
    steps: [
      ...start(),
      js(`${S}.disc(16, 18, 12)`),
      js(`${S}.save('Sun and sky')`),
      js(`${S}.box(0, 0, 31, 39)`),
      js(`${S}.save('Sky side')`),
      js(`${S}.box(34, 4, 60, 36)`),
      js(`${S}.save('Purple field')`),
      js(`${F}.run('select.saved')`),
      wait(900),
      { shot: '@', el: '.io-modal', pad: 0 },
    ],
  },
];
