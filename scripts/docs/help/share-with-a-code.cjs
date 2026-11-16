// Help clip for Send with a code: the sender's window showing a code and what holds it up, then the receiver typing a code
// in, and what a failed connection looks like (the pretend network in scripts/ipc-stubs.cjs never answers, so the clip
// ends on the plain "couldn't connect" with the way round it). Window 1280 x 800, cropped to the dialog.
const L = require('./_lib.cjs');

const CROP = [360, 130, 560, 540];
const typed = (text) => ({ type: text, after: 220 });

module.exports = [
  {
    name: 'share-with-a-code',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.template('blank-vector'),
      L.cmd('view.fit'),
      L.wait(600),
      { rec: '@', crop: CROP, every: 80 },
      L.cmd('file.shareCode'),
      L.wait(2600),
      { clickOn: '[data-testid="share.copy"]', hover: true, after: 900 },
      L.wait(1200),
      { clickOn: '.io-foot .io-btn-primary, .io-foot .io-primary', after: 700 },
      L.cmd('file.receiveCode'),
      L.wait(900),
      typed('ocean'),
      typed('ocean-tiger'),
      typed('ocean-tiger-maple'),
      typed('ocean-tiger-maple-spoon'),
      L.wait(700),
      { clickOn: '[data-testid="share.go"]', after: 1200 },
      L.wait(4200),
      { rec: 'stop' },
    ],
  },
];
