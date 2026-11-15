// Help pictures for the chat commands topics. Frameling can't show Firebot or Streamer.bot, so each picture is what the
// setup is for: the thing a typed !vote, !guess or !prompt lands in. The requests go through the real audience gate, the
// same call the actions door makes. Stills, with motion off.
const { template, wait, js, cmd } = require('./_lib.cjs');

const mark = (sel, pad) => [
  js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('nothing to shoot: ${sel}'); document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); el.setAttribute('data-shot', '1'); return true; })()`),
  { shot: '@', el: '[data-shot]', pad },
];

module.exports = [
  // Votes arriving: the panel mid-vote, bars grown, the clock still running.
  {
    name: 'chat-commands',
    size: [1280, 800],
    prefs: { reduceMotion: true, showExplanations: false },
    steps: [
      template('flour-sack-hop'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      js(`__framelingVotes.start({ question: 'Which colour next?', options: ['Sunset orange', 'Sky blue', 'Mint green'], seconds: 120 })`),
      wait(900),
      js(`__framelingVotes.crowd(31, (i) => { const r = i % 10; return r < 2 ? 1 : r < 7 ? 2 : 3; })`),
      wait(1400),
      ...mark('[data-testid="votes.panel"]', 12),
    ],
  },
  // A guessing round mid-play: blanks, a warmth meter, nobody has it yet.
  {
    name: 'chat-commands-firebot',
    size: [1280, 800],
    prefs: { reduceMotion: true, showExplanations: false },
    steps: [
      template('flour-sack-hop'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      js(`__framelingGuess.start({ word: 'elephant', seconds: 120 })`),
      wait(900),
      js(`__framelingGuess.guess('giraffe', 'p1')`),
      wait(500),
      js(`__framelingGuess.guess('an elefunt', 'p2')`),
      wait(1400),
      ...mark('[data-testid="guess.panel"]', 12),
    ],
  },
  // The jar with a few prompts in it, open.
  {
    name: 'chat-commands-streamerbot',
    size: [1280, 800],
    prefs: { reduceMotion: true, showQuill: false, showTips: false },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      js(`__framelingJar.add('a frog in a teacup')`),
      js(`__framelingJar.add('a very sleepy dragon')`),
      js(`__framelingJar.add('a castle on a cloud')`),
      wait(600),
      { clickOn: '.jar-btn', after: 1200 },
      ...mark('[data-testid="promptjar.card"]', 10),
    ],
  },
];
