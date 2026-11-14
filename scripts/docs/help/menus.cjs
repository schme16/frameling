// Help clip for changing the menus: Preferences > Menus, the Edit menu opened, one entry dragged to the top, and put back.
const L = require('./_lib.cjs');

const CALM = { reduceMotion: true, showTips: false };
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const openMenusPage = L.js(`__frameling.overlays.openPrefs('menus')`);

module.exports = [
  {
    name: 'change-the-menus',
    prefs: CALM,
    // A press that lands beside the dialog while dragging must not raise the ask-once question over the clip.
    choices: { 'ui.backdropClick': 'stay' },
    width: 760,
    steps: [
      L.template('bouncing-ball'),
      L.wait(800),
      openMenusPage,
      L.wait(900),
      ...settle,
      { clickOn: '.ui-me-name', text: 'Edit', after: 900 },
      { rec: '@', el: '.ui-prefs', pad: 0, every: 70 },
      L.wait(1300),
      // Cut is dragged up to the top of the Edit menu.
      { dragOn: '[data-entry="edit.cut"] .ui-me-grip', to: '[data-entry="edit.undo"]', toDy: -14, steps: 16, delay: 45, hold: 900, after: 1500 },
      // And put back with the button under the list.
      { clickOn: '[data-testid="menus.put-this-back"]', after: 1800 },
      L.wait(1500),
      { rec: 'stop' },
    ],
  },
];
