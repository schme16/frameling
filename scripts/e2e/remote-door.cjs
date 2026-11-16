// The remote door, end to end, in the real built app: shut by default with nothing listening, opened by the person's
// switch, the key required, a web page refused, a request mid-dialog refused, a driven run that is one step in Undo,
// Stop everything closing it, and the commands it may not press staying out of reach. Run inside xvfb, never on the desktop:
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remote-door.cjs
//
// Exits non-zero when anything fails.
const { app } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const { start, sleep } = require('./remote-door-lib.cjs');

let failed = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  ' + JSON.stringify(extra)}`);
  if (!ok) failed++;
};

(async () => {
  const h = await start({ choices: { 'audience.strictness': 'balanced', 'audience.view': 'screen' } });
  const { js, wc } = h;
  // A person closes a dialog with Escape.
  const escape = async () => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await sleep(400);
  };
  await js(`window.__frameling.template('bouncing-ball')`);
  await sleep(500);

  // ---------------------------------------------------------------- shut by default
  check('no remote-door files before it is switched on', !fs.existsSync(h.dataFile('remote-door.json')) && !fs.existsSync(h.dataFile('remote-door-key.txt')));
  check('nothing is listening on the usual port', await h.shut(47231));
  check('the pill is not there', (await js(`!document.querySelector('[data-testid="remote.badge"]')`)) === true);

  // ---------------------------------------------------------------- switched on
  const { port, key, door } = await h.switchOn();
  check('the key file is private', (fs.statSync(h.dataFile('remote-door-key.txt')).mode & 0o077) === 0);
  check('the address file never holds the key', !fs.readFileSync(h.dataFile('remote-door.json'), 'utf8').includes(key));
  await sleep(300);
  check('the pill says the door is open', (await js(`!!document.querySelector('[data-testid="remote.badge"]')`)) === true);

  const bare = await h.request(port, {});
  check('no key: 401', bare.status === 401, bare);
  check('wrong key: 401', (await h.request(port, { headers: { Authorization: 'Bearer nope' } })).status === 401);
  check('an Origin header: 403 (a web page)', (await door('GET', '/v1', undefined, { Origin: 'https://evil.example' })).status === 403);
  check('hello: 200', (await door('GET', '/v1')).status === 200);
  const bad = await h.request(port, { method: 'POST', path: '/v1/run', body: '{oops', headers: { Authorization: `Bearer ${key}` } });
  check('bad JSON: 400', bad.status === 400, bad);
  check('a command it may not press: 403 refused', (await door('POST', '/v1/commands/file.save')).status === 403);
  for (const id of ['view.streamSafe', 'audience.kill', 'remote.roll', 'edit.undo']) check(`${id}: 403`, (await door('POST', `/v1/commands/${id}`)).status === 403);
  const list = await door('GET', '/v1/commands');
  check('the list has no audience, stream-safe or remote commands', list.status === 200 && !list.body.commands.some((c) => /^(audience\.|stream|view\.streamSafe|remote\.|file\.)/.test(c.id)), list.body.commands?.length);

  // ---------------------------------------------------------------- one step in Undo
  const steps = () => js(`window.__frameling.store().historyList().done.length`);
  const shapes = () => js(`(() => { const { doc, ui } = window.__frameling.store().get(); let n = 0; for (const d of Object.values(doc.drawings)) n += (d.shapes || []).length; return n; })()`);
  const n0 = await steps();
  const s0 = await shapes();
  const run = await door('POST', '/v1/run', { label: 'Copy it', steps: [{ command: 'select.all' }, { command: 'edit.duplicate' }, { set: { frame: 1 } }] });
  check('a run of three steps: 200', run.status === 200 && run.body.ok, run);
  check('it is ONE step in Undo', (await steps()) === n0 + 1, [n0, await steps()]);
  check('and it did something', (await shapes()) > s0, [s0, await shapes()]);
  await sleep(200);
  const logged = await js(`window.__frameling.overlays.openPrefs('plugins', undefined, 'What it has done'), new Promise((r) => setTimeout(() => r(document.querySelector('[data-testid="remote.log"]')?.innerText ?? ''), 500))`);
  check('the log in the app says what was driven', /Ran 3 steps/.test(logged), logged);
  await escape();
  await js(`window.__frameling.store().undo()`);
  check('one Undo takes it all back', (await shapes()) === s0 && (await steps()) === n0, [await shapes(), await steps()]);

  // ---------------------------------------------------------------- a failed run leaves nothing
  const fail = await door('POST', '/v1/run', { steps: [{ command: 'select.all' }, { command: 'edit.duplicate' }, { command: 'timeline.nextFrame' }, { command: 'view.nothingHere' }] });
  check('a command that does not exist is refused up front', fail.status === 403 || fail.status === 400 || fail.status === 422, fail);
  check('and nothing was changed', (await steps()) === n0, await steps());

  // ---------------------------------------------------------------- not at a bad moment
  await js(`window.__frameling.overlays.openPrefs('general')`);
  await sleep(400);
  const dialog = await door('POST', '/v1/commands/edit.duplicate');
  check('with a dialog open: 409 busy, dialog', dialog.status === 409 && dialog.body.detail === 'dialog', dialog);
  check('reading still works with a dialog open', (await door('GET', '/v1/state')).status === 200);
  await escape();
  await sleep(300);
  await js(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await js(`window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  const stroke = await door('POST', '/v1/commands/select.all');
  check('mid-stroke: 409 busy, stroke', stroke.status === 409 && stroke.body.detail === 'stroke', stroke);
  await js(`window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
  check('and once it ends the same request goes through', (await door('POST', '/v1/commands/select.all')).status === 200);

  // ---------------------------------------------------------------- Stop everything
  await js(`window.__frameling.run('audience.kill')`);
  await sleep(600);
  check('Stop everything closes the door: nothing listening', await h.shut(port));
  check('and the pill is gone and the address file with it', (await js(`!document.querySelector('[data-testid="remote.badge"]')`)) === true && !fs.existsSync(h.dataFile('remote-door.json')));

  // ---------------------------------------------------------------- off again from the switch, and a reload
  const again = await h.switchOn();
  check('it can be switched on again', (await again.door('GET', '/v1')).status === 200);
  await js(`location.reload()`);
  await sleep(2500);
  check('a reload shuts it: the page that answers it is gone', await h.shut(again.port));
  check('and it starts off after a reload', (await js(`!document.querySelector('[data-testid="remote.badge"]')`)) === true);

  console.log(failed ? `${failed} failed` : 'all passed');
  app.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
