// Scripts in the real app (vitest has no sandbox frames or workers): a script runs in the real sandbox, one run is one
// Undo step, an error says its line, a loop that never ends is stopped without taking the app with it, a saved script is a
// command that can be put on a key, and a script that was pasted stops and asks first.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/scripts.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, '../..');
const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
  if (!ok) failures.push(name);
};

app.whenReady().then(async () => {
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(root, 'dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  const load = () => win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
  await load();
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, onboarded: true })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'scripts.home': 'app' })); true`);
  await load();
  await sleep(2500);
  const js = (code) => win.webContents.executeJavaScript(code);
  const S = '__framelingScripts';
  const press = (k, modifiers) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers });
  };
  const stepsNow = () => js(`__frameling.store().historyList().done.length`);
  const fills = () => js(`(() => { const { doc, ui } = __frameling.store().get(); const l = doc.layers.find((x) => x.id === ui.activeLayerId) ?? doc.layers[doc.layers.length - 1]; const c = l.cels[0]; const d = c && doc.drawings[c.drawingId]; return d && d.shapes ? d.shapes.map((s) => s.fill) : []; })()`);
  const make = (name, code, reviewed = true) => js(`${S}.make(${JSON.stringify(name)}, ${JSON.stringify(code)}, ${reviewed}).then((s) => s.id)`);
  const run = (id) => js(`${S}.run(${JSON.stringify(id)}).then((o) => o && ({ ok: o.ok, message: o.message, line: o.line, ended: o.ended, changes: o.changes, printed: o.printed.map((p) => p.text) }))`);

  check('the Scripts panel and its commands are registered', (await js(`__frameling.panels().includes('scripts') && __frameling.commands().includes('scripts.open') && __frameling.commands().includes('scripts.new')`)) === true);

  // ---------------------------------------------------------------- a script runs, as one step
  await js(`${S}.seed(['#00aa00', '#00aa00', '#00aa00'])`);
  const RED = `// Turn the picked shapes red
const picked = await frameling.document.selected();
for (const shape of picked.shapes) {
  await frameling.document.edit('One', [{ op: 'setShapeStyle', drawingId: picked.drawingId, shapeId: shape.id, fill: '#ff0000' }]);
}
console.log('painted ' + picked.shapes.length);`;
  const red = await make('Make red', RED);
  const before = await stepsNow();
  const r1 = await run(red);
  check('a script runs in the real sandbox', r1 && r1.ok === true, r1);
  check('it printed what it logged', r1 && r1.printed.join() === 'painted 3', r1);
  check('three shapes are red', (await fills()).join() === '#ff0000,#ff0000,#ff0000', await fills());
  check('three edits are one step in Undo', (await stepsNow()) === before + 1, [before, await stepsNow()]);
  await js(`__frameling.store().undo()`);
  check('one Undo puts all three back', (await fills()).join() === '#00aa00,#00aa00,#00aa00', await fills());

  // ---------------------------------------------------------------- errors say their line
  const bad = await run(await make('Typo', `const a = 1;\nconst b = nothingHere.x;\n`));
  check('a mistake says what it was and the line', bad && bad.ok === false && /nothingHere/.test(bad.message) && bad.line === 2, bad);
  const syntax = await run(await make('Syntax', `const a = 1;\nconst b = ;\n`));
  check('a typo in the code is reported (line when the browser gives it)', syntax && syntax.ok === false && !!syntax.message, syntax);
  console.log(`      syntax error line: ${syntax && syntax.line}  message: ${syntax && syntax.message}`);
  const halfway = await run(await make('Half done', `${RED}\nthrow new Error('stop right there');`));
  check('a script that fails halfway leaves the drawing as it was', halfway.ok === false && (await fills()).join() === '#00aa00,#00aa00,#00aa00', [halfway, await fills()]);
  check('and no step is left in Undo for it', (await stepsNow()) === before, [before, await stepsNow()]);

  // ---------------------------------------------------------------- what is off limits
  const noFile = await run(await make('Save', `await frameling.app.run('file.save');`));
  check('a script may not press Save', noFile.ok === false && /can't press/.test(noFile.message), noFile);
  const net = await run(await make('Net', `try { await fetch('https://example.com'); console.log('reached'); } catch (e) { console.log('blocked'); }`));
  check('a script has no internet', net.ok === true && net.printed.join() === 'blocked', net);
  const cmds = await run(await make('List', `const c = await frameling.app.commands(); console.log(c.length > 300, c.some((x) => x.id === 'edit.duplicate'), c.some((x) => x.id.startsWith('file.')));`));
  check('a script can list hundreds of commands and none of the file ones', cmds.ok && cmds.printed.join() === 'true true false', cmds);
  const dup = await run(await make('Dup', `const p = await frameling.document.selected();\nawait frameling.app.run('edit.duplicate');`));
  check('a script can press a command', dup.ok === true && dup.changes === 1, dup);
  await js(`__frameling.store().undo()`);

  // ---------------------------------------------------------------- a loop that never ends
  await js(`${S}.watchdog.scriptStuckMs = 1500; ${S}.watchdog.pingEveryMs = 200; true`);
  const t0 = Date.now();
  const loopId = await make('Loop', `${RED}\nwhile (true) {}`);
  const loop = await run(loopId);
  check('a loop that never ends is stopped by the watchdog', loop.ok === false && loop.ended === 'stuck', loop);
  check('and it was stopped in a few seconds', Date.now() - t0 < 8000, Date.now() - t0);
  check('and the drawing is back how it was', (await fills()).join() === '#00aa00,#00aa00,#00aa00', await fills());
  check('and the app still answers', (await js(`1 + 1`)) === 2);
  const again = await run(red);
  check('and the next script runs as usual', again.ok === true, again);
  await js(`__frameling.store().undo()`);

  // The Stop button, on a loop that blocks its worker completely.
  const stopId = await make('Loop 2', `while (true) {}`);
  const started = js(`${S}.run(${JSON.stringify(stopId)}).then((o) => o && ({ ok: o.ok, ended: o.ended, message: o.message }))`);
  await sleep(600);
  check('while it runs, the app knows', (await js(`!!${S}.running()`)) === true);
  const t1 = Date.now();
  await js(`${S}.stop()`);
  const stopped = await started;
  check('Stop ends a loop that blocks its worker, quickly', stopped.ended === 'stopped' && Date.now() - t1 < 1500, [stopped, Date.now() - t1]);
  await js(`${S}.watchdog.scriptStuckMs = 5000; ${S}.watchdog.pingEveryMs = 1000; true`);

  // ---------------------------------------------------------------- a saved script is a command, and can have a key
  const cmdId = `script.${red}`;
  check('a saved script is a command in the palette list', (await js(`__frameling.commands().includes(${JSON.stringify(cmdId)})`)) === true);
  await js(`__frameling.store().setUi({ selection: [] }); ${S}.open(${JSON.stringify(red)}); __frameling.showPanel('scripts'); true`);
  await sleep(800);
  check('the editor shows the script', (await js(`document.querySelector('[data-testid="scripts.code"]')?.value.startsWith('// Turn the picked shapes red')`)) === true);
  await js(`document.querySelector('[data-testid="scripts.setKey"]').click(); true`);
  await sleep(200);
  press('F9', ['control']);
  await sleep(400);
  const label = await js(`document.querySelector('[data-testid="scripts.setKey"]').textContent`);
  check('Set a key takes the keys pressed', /Ctrl\+F9/i.test(label), label);
  await js(`document.activeElement && document.activeElement.blur(); ${S}.seed(['#00aa00', '#00aa00'], { x: 330, y: 520 }); true`);
  const keyBefore = await stepsNow();
  press('F9', ['control']);
  await sleep(1500);
  check('pressing the key runs the script', (await stepsNow()) === keyBefore + 1 && (await fills()).slice(-2).join() === '#ff0000,#ff0000', [keyBefore, await stepsNow(), await fills()]);

  // ---------------------------------------------------------------- typing and pasting
  await js(`${S}.open(null); true`);
  await js(`document.querySelector('[data-testid="scripts.new"]').click(); true`);
  await sleep(600);
  check('New makes a script and opens it in the editor', (await js(`!!document.querySelector('[data-testid="scripts.code"]')`)) === true);
  check('a script made here starts as your own', (await js(`!document.querySelector('[data-testid="scripts.unreviewed"]')`)) === true);
  const pasted = `// found on a forum\nawait frameling.app.run('edit.duplicate');\nconsole.log('pasted ran');`;
  clipboard.writeText(pasted);
  await js(`(() => { const t = document.querySelector('[data-testid="scripts.code"]'); t.focus(); t.select(); return true; })()`);
  win.webContents.paste();
  await sleep(700);
  check('pasting code in marks the script as from somewhere else', (await js(`!!document.querySelector('[data-testid="scripts.unreviewed"]')`)) === true);
  check('the pasted words are in the box', (await js(`document.querySelector('[data-testid="scripts.code"]').value === ${JSON.stringify(pasted)}`)) === true);
  const pastedBefore = await stepsNow();
  await js(`document.querySelector('[data-testid="scripts.run"]').click(); true`);
  await sleep(700);
  check('running it stops and asks first', (await js(`!!document.querySelector('[data-testid="ask.scripts.lookFirst.cancel"]')`)) === true && (await stepsNow()) === pastedBefore);
  const sheet = await js(`document.querySelector('.ask-dialog, [role=dialog], [role=alertdialog]')?.textContent || ''`);
  check('the sheet names what it presses', /Duplicate/.test(sheet), sheet.slice(0, 300));
  await js(`document.querySelector('[data-testid="ask.scripts.lookFirst.cancel"]').click(); true`);
  await sleep(400);
  check('Cancel runs nothing', (await stepsNow()) === pastedBefore);
  await js(`document.querySelector('[data-testid="scripts.run"]').click(); true`);
  await sleep(700);
  await js(`document.querySelector('[data-testid="ask.scripts.lookFirst.trust"]').click(); true`);
  await sleep(1500);
  check('trusting it runs it', (await js(`${S}.lastRun()?.outcome?.ok`)) === true);
  check('and the script is no longer marked', (await js(`!document.querySelector('[data-testid="scripts.unreviewed"]')`)) === true);

  // ---------------------------------------------------------------- the console
  const noisy = errors.filter((e) => !/Autofill|favicon|GPU|Electron Security Warning/i.test(e));
  check('no errors in the console', noisy.length === 0, noisy.slice(0, 5));

  win.destroy();
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
