// Help clip for Quill reacting to chat: a cheer, a hop and a snack, then a sign with the question before it. The
// reactions come from the debug hook, the sign goes through the real gate, so the question is the real one. Motion is
// left on (no reduceMotion) because Quill moving is the whole point.
const { template, wait, js } = require('./_lib.cjs');

// The strip at the bottom middle of the window where the toasts rise.
const TOASTS = [330, 640, 620, 140];
const react = (w) => js(`__framelingQuillReacts.react('${w}')`);

module.exports = [
  {
    name: 'quill-reacts',
    size: [1280, 800],
    prefs: { showQuill: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      { rec: '@', crop: TOASTS, every: 80 },
      wait(300),
      react('cheer'),
      wait(3000),
      react('hop'),
      wait(2800),
      react('snack'),
      wait(3000),
      js(`__framelingQuillReacts.submit('quill.sign', { text: 'You are brilliant!' })`),
      wait(2200),
      { clickOn: '.ui-toast-action', text: 'Hold it up', after: 4200 },
      { rec: 'stop' },
    ],
  },
  {
    // A follower welcomed by name with no question (the default answer), then a crowd that arrives while he is busy,
    // welcomed together as a first name and a count, then a raid. All through the real gate, with made-up names.
    name: 'quill-welcomes',
    size: [1280, 800],
    prefs: { showQuill: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      // The harness has no Twitch app, so switching audience features on leaves a note about that. Clear it before filming.
      { clickOn: '.ui-toast-x', after: 600 },
      { rec: '@', crop: TOASTS, every: 80 },
      wait(300),
      js(`__framelingQuillReacts.submit('quill.welcome.follow', { name: 'Mika' })`),
      wait(4600),
      js(`for (const n of ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay']) __framelingQuillReacts.submit('quill.welcome.follow', { name: n })`),
      wait(9200),
      js(`__framelingQuillReacts.submit('quill.welcome.raid', { name: 'Mika', amount: 40 })`),
      wait(6400),
      { rec: 'stop' },
    ],
  },
];
