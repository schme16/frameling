// Help picture for Stream-safe mode: Open recent with the mode on, so every file shows as a stand-in and the pill is up.
const { cmd, template, wait, js } = require('./_lib.cjs');

module.exports = [
  {
    name: 'stream-safe',
    prefs: { reduceMotion: true, streamSafe: true },
    steps: [
      template('blank-vector'),
      js(`__framelingIo.demoRecent([{ template: 'bouncing-ball', name: 'Secret client logo' }, { template: 'walk-cycle', name: 'Birthday card for Mum' }, { template: 'title-card', name: 'Tax diagram' }])`),
      wait(1500),
      cmd('file.openRecent'),
      wait(1800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      { shot: '@' },
    ],
  },
];
