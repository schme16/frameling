// Shared by the selection edge entries: a pale sky with a sun on the left, a dark purple field on the right, and a round
// selection round the sun (the sun and a ring of sky). `copyAcross` copies it and drops the copy on the purple.
const F = '__frameling';
const S = '__framelingSelect';
const js = (code) => ({ eval: code });
const wait = (ms) => ({ wait: ms });

const start = () => [
  js(`${F}.dock.applyWorkspace('pixel')`),
  wait(600),
  js(`${S}.scene(64, 40)`),
  wait(500),
  js(`${F}.run('view.fit')`),
  js(`${F}.store().setUi({ tool: 'pixel-select' })`),
  { move: [640, 780] },
  wait(700),
];
const copyAcross = () => [js(`${S}.paste()`), wait(400), js(`${S}.move(32, 0)`), wait(400), js(`${S}.drop()`), wait(600)];

module.exports = { F, S, js, wait, start, copyAcross };
