// Help clip for the guessing game: the box that starts a round (a word typed, the winner's name switched on), the panel
// with blanks and a warmth meter while people guess through the real audience gate (the same call the actions door
// makes), a hint, a near miss that makes Quill hop, then a right guess: Quill cheers and the word flips up with who got
// it. The word is dots in the start box until the eye is pressed, and never on screen while the round runs, and the drawing is not touched. Motion is left on: it is the point.
const { template, wait, js, cmd } = require('./_lib.cjs');

const guess = (text, player, name) => js(`__framelingGuess.guess(${JSON.stringify(text)}, ${JSON.stringify(player)}${name ? `, ${JSON.stringify(name)}` : ''})`);

module.exports = [
  {
    name: 'guess',
    size: [1280, 800],
    prefs: { reduceMotion: false, showExplanations: false },
    steps: [
      template('flour-sack-hop'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      wait(500),
      cmd('guess.start'),
      wait(1100),
      { type: 'elephant' },
      wait(900),
      // The word is dots while you type; the eye shows it for a moment and covers it again.
      js(`document.querySelector('[data-testid="guess.setup.show"]').click()`),
      wait(1100),
      js(`document.querySelector('[data-testid="guess.setup.show"]').click()`),
      wait(900),
      js(`document.querySelector('[data-testid="guess.setup.names"]').click()`),
      wait(1000),
      js(`document.querySelector('[data-testid="guess.setup.start"]').click()`),
      wait(1600),
      guess('giraffe', 'p1'),
      wait(700),
      guess('a rhino', 'p2'),
      wait(500),
      guess('zebra', 'p3'),
      wait(1000),
      guess('hippo', 'p4'),
      wait(900),
      cmd('guess.hint'),
      wait(1400),
      guess('elegant', 'p5'),
      wait(2600),
      guess('mouse', 'p6'),
      wait(1200),
      guess('is it an elefant?', 'p7', 'Mika'),
      wait(5200),
      js(`__framelingGuess.close()`),
      wait(900),
      { rec: 'stop' },
    ],
  },
];
