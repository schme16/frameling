// Help picture for "Grow, shrink and feather a selection": the card with Feather picked and its live look at the edge.
const { F, S, js, wait, start } = require('../ab-selection-edge/_scene.cjs');

module.exports = [
  {
    name: 'selection-edge',
    prefs: { showTips: false, firstDrawn: true, showQuill: false },
    steps: [...start(), js(`${S}.disc(16, 18, 12)`), js(`${F}.run('select.edge')`), wait(900), { shot: '@', el: '.io-modal', pad: 0 }],
  },
];
