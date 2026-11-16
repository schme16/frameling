// The run checks of scripts.cjs (a script runs in the real sandbox, three edits are one step in Undo, an error says its
// line, a script that fails halfway leaves nothing, what a script may not press, no internet, a loop that never ends is
// stopped), driven through the remote door instead of the __frameling debug hooks. Everything the checks do to the app and
// read back goes over HTTP with the key. What still goes through the page is listed at the bottom, and is the honest part.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/scripts-door.cjs
//
// Exits non-zero when anything fails. scripts.cjs stays for the parts that are about the panel (the editor, keys, pasting).
const { app } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const { start, sleep } = require('./remote-door-lib.cjs');

let failed = 0;
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
  if (!ok) failed++;
};

const RED = `// Turn the picked shapes red
const picked = await frameling.document.selected();
for (const shape of picked.shapes) {
  await frameling.document.edit('One', [{ op: 'setShapeStyle', drawingId: picked.drawingId, shapeId: shape.id, color: '#ff0000' }]);
}
console.log('painted ' + picked.shapes.length);`;

(async () => {
  const h = await start();
  // The one page reach left in this file: a document to work on (the door has no File menu, by design).
  await h.js(`window.__frameling.template('bouncing-ball')`);
  await sleep(500);
  const { door } = await h.switchOn();

  const script = async (name, code) => {
    const r = await door('POST', '/v1/script', { name, code });
    if (process.env.DOOR_DEBUG) console.log('   script', name, r.status, JSON.stringify(r.body).slice(0, 200));
    return r.body;
  };
  const state = async () => (await door('GET', '/v1/state')).body;
  const fills = async () => {
    // What colour the shapes on the open frame are: read through a script, which is how the door reads a drawing.
    const r = await script('Read', `const p = await frameling.document.selected(); const d = (await frameling.document.get()).drawings[p.drawingId]; const ids = new Set(p.shapes.map((s) => s.id)); console.log(JSON.stringify(d.shapes.filter((s) => ids.has(s.id)).map((s) => s.color)));`);
    return r.ok ? JSON.parse(r.printed[0].text) : null;
  };

  await door('POST', '/v1/run', { steps: [{ command: 'select.all' }] });
  const startFills = await fills();
  check('the drawing has shapes picked to work on', Array.isArray(startFills) && startFills.length >= 2, startFills);
  const before = (await state()).undoSteps;

  // ---------------------------------------------------------------- a script runs, as one step
  const r1 = await script('Make red', RED);
  check('a script runs in the real sandbox', r1.ok === true, r1);
  check('it printed what it logged', r1.printed && r1.printed[0].text === `painted ${startFills.length}`, r1.printed);
  check('every shape is red', (await fills()).every((f) => f === '#ff0000'), await fills());
  check('all the edits are one step in Undo', (await state()).undoSteps === before + 1, [before, (await state()).undoSteps]);
  check('and the script said how many changes it folded', r1.changes === startFills.length, r1.changes);
  await h.js(`window.__frameling.store().undo()`);
  check('one Undo puts them all back', JSON.stringify(await fills()) === JSON.stringify(startFills), await fills());

  // ---------------------------------------------------------------- errors say their line
  const bad = await script('Typo', `const a = 1;\nconst b = nothingHere.x;\n`);
  check('a mistake says what it was and the line', bad.ok === false && /nothingHere/.test(bad.message) && bad.line === 2, bad);
  const syntax = await script('Syntax', `const a = 1;\nconst b = ;\n`);
  check('a typo in the code is reported', syntax.ok === false && !!syntax.message, syntax);
  const halfway = await script('Half done', `${RED}\nthrow new Error('stop right there');`);
  check('a script that fails halfway leaves the drawing as it was', halfway.ok === false && JSON.stringify(await fills()) === JSON.stringify(startFills), halfway);
  check('and no step is left in Undo for it', (await state()).undoSteps === before, (await state()).undoSteps);

  // ---------------------------------------------------------------- what a script may and may not do
  const noFile = await script('Save', `await frameling.app.run('file.save');`);
  check('a script may not press Save', noFile.ok === false && /can't press/.test(noFile.message), noFile);
  const net = await script('Net', `try { await fetch('https://example.com'); console.log('reached'); } catch (e) { console.log('blocked'); }`);
  check('a script has no internet', net.ok === true && net.printed[0].text === 'blocked', net);
  const cmds = await script('List', `const c = await frameling.app.commands(); console.log(c.length > 300, c.some((x) => x.id === 'edit.duplicate'), c.some((x) => x.id.startsWith('file.')));`);
  check('a script can list hundreds of commands and none of the file ones', cmds.ok && cmds.printed[0].text === 'true true false', cmds);
  const dup = await script('Dup', `await frameling.app.run('edit.duplicate');`);
  check('a script can press a command', dup.ok === true && dup.changes === 1, dup);
  await h.js(`window.__frameling.store().undo()`);

  // ---------------------------------------------------------------- a loop that never ends
  await door('POST', '/v1/run', { steps: [{ command: 'select.all' }] });
  const t0 = Date.now();
  const loop = await script('Loop', `${RED}\nwhile (true) {}`);
  const took = Date.now() - t0;
  check('a loop that never ends is stopped by the watchdog', loop.ok === false && loop.ended === 'stuck', loop);
  check('and it was stopped in the real limit, not a shortened one', took > 4000 && took < 15000, took);
  check('and the drawing is back how it was', JSON.stringify(await fills()) === JSON.stringify(startFills), await fills());
  check('and the app still answers', (await door('GET', '/v1')).status === 200);
  const again = await script('Again', RED);
  check('and the next script runs as usual', again.ok === true, again);
  await h.js(`window.__frameling.store().undo()`);

  console.log(failed ? `${failed} failed` : 'all passed');
  app.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

// What scripts.cjs does that this cannot, and why:
//   - Stop on a loop that blocks its worker: the door can't press scripts.stop (a script is not to stop scripts), and the
//     request that started the loop is still waiting. A second channel would be needed; the page's own button is the point of that check.
//   - Shortening the watchdog (scriptStuckMs = 1500) so the loop check takes two seconds: that is a debug hook, and the door
//     has no business changing limits. The loop check here takes the real five seconds.
//   - Making the three green circles to work on: the door has no "add a shape" op and no File menu, so the document is
//     opened through the page. Everything after that is over HTTP.
//   - Saved scripts as commands, keys, the editor, pasting: those are the Scripts panel, not a way in for another program.
