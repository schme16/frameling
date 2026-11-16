// Help picture for "Add animation to a drawing": a new plain drawing with the Animation menu open on Add animation, and the same
// words waiting in the status bar. See help-media.cjs for the entry format.
const L = require('./_lib.cjs');
const closeToasts = L.js("document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())");
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];

module.exports = [
  {
    name: 'animation-add',
    prefs: { showTips: false, reduceMotion: true },
    steps: [
      L.js('__frameling.blank(false)'),
      L.wait(600),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'Animation', after: 700 },
      { clickOn: '[data-command="animation.add"]', hover: true, after: 500 },
      closeToasts, L.wait(300), ...settle,
      { shot: '@' },
    ],
    width: 800,
  },
];
