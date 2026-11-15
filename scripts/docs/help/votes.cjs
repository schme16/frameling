// Help clip for chat votes: a vote starts, votes come in through the real audience gate (the same call the actions door
// makes), the bars grow and the lead changes, the clock runs out and the result shows. Then Close. The drawing is not
// touched at any point, and that is the point. Motion is left on: votes arriving is what the clip is about.
const { template, wait, js } = require('./_lib.cjs');

// The panel sits at the right, below the title bar, with some of the drawing beside it.
const PANEL = [600, 80, 680, 580];
let next = 0;
/** `n` new people vote, `a` of every 10 for option 1, `b` for option 2, the rest for option 3. */
const wave = (n, a, b) => {
  const from = next;
  next += n;
  return js(`__framelingVotes.crowd(${n}, (i) => { const r = i % 10; return r < ${a} ? 1 : r < ${a + b} ? 2 : 3; }, ${from})`);
};

module.exports = [
  {
    name: 'votes',
    size: [1280, 800],
    prefs: { reduceMotion: false, showExplanations: false },
    steps: [
      template('flour-sack-hop'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      { rec: '@', crop: PANEL, every: 80 },
      wait(500),
      js(`__framelingVotes.start({ question: 'Which colour next?', options: ['Sunset orange', 'Sky blue', 'Mint green'], seconds: 11 })`),
      wait(1200),
      wave(6, 5, 3),
      wait(1000),
      wave(9, 6, 2),
      wait(1100),
      wave(12, 2, 6),
      wait(1100),
      wave(14, 1, 7),
      wait(1100),
      wave(10, 3, 5),
      wait(1000),
      wave(12, 2, 6),
      wait(1200),
      wave(8, 3, 5),
      wait(2400),
      // The clock has run out by now: the result is on screen. Hold it long enough to read.
      wait(5600),
      js(`__framelingVotes.close()`),
      wait(900),
      { rec: 'stop' },
    ],
  },
];
