// Help picture for importing Aseprite files. See help-media.cjs for the entry format.
const fs = require('node:fs');
const path = require('node:path');
const { js, wait } = require('./_lib.cjs');

const F = '__frameling';
const sample = () => Array.from(fs.readFileSync(path.join(__dirname, 'assets', 'slime-bounce.aseprite')));

module.exports = [
  {
    // The little slime from assets/slime-bounce.aseprite (made by make-slime.lua), just opened: layers, tags as clips.
    name: 'aseprite-import',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`__framelingAseprite.open(${JSON.stringify(sample())}, 'slime-bounce.aseprite')`),
      wait(800),
      js(`${F}.run('view.zoom100')`),
      ...Array.from({ length: 5 }, () => js(`${F}.run('view.zoomIn')`)),
      js(`${F}.run('view.center')`),
      wait(600),
      { move: [640, 762] },
      { shot: '@' },
    ],
  },
];
