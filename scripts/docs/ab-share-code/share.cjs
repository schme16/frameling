// Proof pictures for Send with a code (brand/ab/share-code): the sender's code, the receiver typing, a code that did not
// match, and a connection that never opens. The pretend network is the one in scripts/ipc-stubs.cjs.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-share-code --out brand/ab/share-code/raw
const L = require('../help/_lib.cjs');

const CROP = [360, 130, 560, 540];
const base = { prefs: { firstDrawn: true, showTips: false, showQuill: false }, width: 560 };
const start = [L.template('blank-vector'), L.cmd('view.fit'), L.wait(500)];
const typeCode = (text) => ({ type: text, after: 300 });

module.exports = [
  { ...base, name: 'sender-code', steps: [...start, L.cmd('file.shareCode'), L.wait(1800), { shot: '@', crop: CROP }] },
  { ...base, name: 'receiver-typing', steps: [...start, L.cmd('file.receiveCode'), L.wait(700), typeCode('ocean-tiger'), L.wait(300), { shot: '@', crop: CROP }] },
  { ...base, name: 'receiver-typed', steps: [...start, L.cmd('file.receiveCode'), L.wait(700), typeCode('ocean-tiger-maple-spoon'), L.wait(300), { shot: '@', crop: CROP }] },
  { ...base, name: 'receiver-unknown-word', steps: [...start, L.cmd('file.receiveCode'), L.wait(700), typeCode('ocean-tigre-maple-spoon'), L.wait(300), { shot: '@', crop: CROP }] },
  {
    ...base,
    name: 'receiver-wrong-code',
    steps: [...start, L.cmd('file.receiveCode'), L.wait(700), typeCode('ocean-tiger-maple-piano'), { clickOn: '[data-testid="share.go"]', after: 3600 }, { shot: '@', crop: CROP }],
  },
  {
    ...base,
    name: 'connection-failed',
    steps: [...start, L.cmd('file.receiveCode'), L.wait(700), typeCode('ocean-tiger-maple-spoon'), { clickOn: '[data-testid="share.go"]', after: 5200 }, { shot: '@', crop: CROP }],
  },
];
