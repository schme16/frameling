// Help pictures and clips for Scripts: writing one and running it, putting it on a key, what a script can use, and the
// stop before a script from somewhere else. See help-media.cjs for the entry format. Steps are theme neutral.
const L = require('./_lib.cjs');
const { js, wait } = L;

const S = '__framelingScripts';
const RED = [
  "// Turn the picked shapes red",
  "const picked = await frameling.document.selected();",
  "const changes = picked.shapes.map((shape) => ({",
  "  op: 'setShapeStyle',",
  "  drawingId: picked.drawingId,",
  "  shapeId: shape.id,",
  "  color: '#e8403a',",
  "  fill: '#e8403a',",
  "}));",
  "await frameling.document.edit('Make red', changes);",
  "",
].join('\n');
/** The first n lines of the script, so a clip shows it being written. */
const upTo = (n) => RED.split('\n').slice(0, n).join('\n');
const focusBox = js(`(() => { const t = document.querySelector('[data-testid="scripts.code"]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return true; })()`);
const typeLines = (n, pause = 450) => [{ type: upTo(n) }, wait(pause)];
const click = (testid, after = 500) => ({ clickOn: `[data-testid="${testid}"]`, after });
const seed = (colours, x, y, pick = true) => js(`${S}.seed(${JSON.stringify(colours)}, { x: ${x}, y: ${y} }, ${pick}); true`);
const away = { move: [700, 760] };
/** Shows the Scripts panel with the page set up: three green circles on the canvas, picked. */
const setup = [L.template('blank-vector'), wait(500), seed(['#4fd1a5', '#4fd1a5', '#4fd1a5'], 300, 250), L.cmd('scripts.open'), wait(900)];

module.exports = [
  {
    name: 'scripts',
    prefs: { firstDrawn: true },
    choices: { 'scripts.home': 'app' },
    steps: [
      ...setup,
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      wait(900),
      click('scripts.new', 800),
      { eval: `${S}.open(${S}.state().app.at(-1).id); true` },
      wait(400),
      click('scripts.code', 300),
      focusBox,
      ...[3, 6, 8, 10].flatMap((n) => typeLines(n, 700)),
      away,
      wait(500),
      click('scripts.run', 1700),
      away,
      wait(1400),
      // Give it a key: the panel's own button, then the keys.
      click('scripts.setKey', 700),
      { key: 'F9', mods: ['control'] },
      wait(1300),
      // Different shapes, and the key.
      seed(['#4fd1a5', '#4fd1a5'], 380, 470),
      { eval: `document.activeElement && document.activeElement.blur(); true` },
      wait(1200),
      { key: 'F9', mods: ['control'] },
      wait(2200),
      { rec: 'stop' },
    ],
  },
  {
    name: 'scripts-reach',
    prefs: { firstDrawn: true },
    choices: { 'scripts.home': 'app' },
    steps: [
      ...setup,
      js(`(async () => { const s = await ${S}.make('Copy along a trail', ${JSON.stringify("// Copy the picked shapes three times, each a bit further along\nconst picked = await frameling.document.selected();\nfor (let i = 0; i < 3; i++) {\n  await frameling.app.run('edit.duplicate');\n  await frameling.app.run('select.nudgeRightMore');\n}\n")}); return s.id; })()`),
      wait(900),
      js(`(() => { document.querySelectorAll('.pt-section').forEach((d) => { if (d.textContent.startsWith('What you can use')) d.open = true; }); return true; })()`),
      wait(600),
      // Scroll the open section to the top of the panel, so the list of what a script has and the commands under it are what shows.
      js(`(() => { const d = [...document.querySelectorAll('.pt-section')].find((x) => x.textContent.startsWith('What you can use')); d.querySelector('summary').scrollIntoView({ block: 'start' }); return true; })()`),
      wait(500),
      { shot: '@', crop: [0, 0, 1280, 800] },
    ],
  },
  {
    name: 'scripts-safety',
    prefs: { firstDrawn: true, reduceMotion: true },
    choices: { 'scripts.home': 'app' },
    steps: [
      ...setup,
      js(`(async () => { const s = await ${S}.make('Found on a forum', ${JSON.stringify("// Found on a forum: tidies up\nawait frameling.app.run('select.all');\nawait frameling.app.run('edit.duplicate');\nawait frameling.app.run('layers.delete');\nawait frameling.app.run('file.save');\n")}, false); return s.id; })()`),
      wait(900),
      click('scripts.run', 900),
      wait(700),
      { shot: '@', crop: [0, 0, 1280, 800] },
    ],
  },
];
