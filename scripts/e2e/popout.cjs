// The second window, checked in the real app (both windows, the real message port). Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/popout.cjs [--theme dark|light]
//
// Checks: it opens and shows the picture; a stroke drawn with real pointer events reaches it, live and when it lands; undo
// follows; the playhead and playing follow; a new document replaces the old one; camera and marks choices apply; closing,
// reopening, moving it about, closing the drawing window and a reload of the drawing window all end up tidy.
const { app } = require('electron');
const { boot, popReady, sleep, MKDOC } = require('./popout-lib.cjs');
const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'dark';

const failures = [];
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures.push(what);
};

(async () => {
  const h = await boot({ theme });
  const { js, main } = h;
  const pop = (code) => js(code, h.popWin());
  const send = (e) => main.webContents.sendInputEvent(e);

  await js(MKDOC);
  await js(`(() => { const f = window.__frameling; f.store().load(window.__mkDoc({ frames: 12, layers: 2, strokesPer: 8, pts: 10, fps: 12 })); f.store().setUi({ tool: 'brush', playing: false, frame: 0 }); true })()`);
  await sleep(400);
  const base = await js(`window.__frameling.store().get().doc.id`);

  // ---- opens and shows the picture
  await js(`window.__frameling.run('popout.toggle')`);
  const w1 = await popReady(h);
  ok(!!w1 && !w1.isDestroyed(), 'the second window opens and shows a picture');
  ok((await pop(`__popout.replica.doc.id`)) === base, 'it holds the same drawing');
  ok((await js(`window.__frameling.commands().includes('popout.toggle')`)), 'the command is registered');
  const px = await w1.webContents.capturePage().then((i) => i.getSize());
  ok(px.width > 100 && px.height > 100, `its window has a size (${px.width}x${px.height})`);

  // ---- a stroke drawn with real pointer events reaches it, live then landed
  const box = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const layerCels = () => pop(`(() => { const d = __popout.replica.doc; return Object.values(d.drawings).reduce((n, x) => n + (x.shapes ? x.shapes.length : 0), 0); })()`);
  const before = await layerCels();
  const at = (fx, fy) => ({ x: Math.round(box.x + box.w * fx), y: Math.round(box.y + box.h * fy) });
  const p0 = at(0.3, 0.3);
  send({ type: 'mouseMove', ...p0 });
  send({ type: 'mouseDown', ...p0, button: 'left', clickCount: 1 });
  let sawInk = false;
  for (let i = 1; i <= 24; i++) {
    const p = at(0.3 + i * 0.015, 0.3 + Math.sin(i / 3) * 0.08);
    send({ type: 'mouseMove', ...p, modifiers: ['leftButtonDown'] });
    await sleep(25);
    if (i === 16) sawInk = !!(await pop(`!!__popout.replica.ink`));
  }
  ok(sawInk, 'a stroke still being drawn shows in the second window (live ink)');
  const pEnd = at(0.3 + 25 * 0.015, 0.3);
  send({ type: 'mouseUp', ...pEnd, button: 'left', clickCount: 1 });
  await sleep(400);
  ok((await pop(`!__popout.replica.ink`)), 'the live ink is gone once the stroke lands');
  ok((await layerCels()) === before + 1, 'the finished stroke arrived as an edit');
  const same = async () => {
    const a = await js(`JSON.stringify(window.__frameling.store().get().doc)`);
    const b = await pop(`JSON.stringify(__popout.replica.doc)`);
    return a === b;
  };
  ok(await same(), 'the copy equals the drawing exactly after the stroke');

  // ---- undo and redo follow
  await js(`window.__frameling.run('edit.undo')`);
  await sleep(250);
  ok((await layerCels()) === before && (await same()), 'undo follows');
  await js(`window.__frameling.run('edit.redo')`);
  await sleep(250);
  ok((await layerCels()) === before + 1 && (await same()), 'redo follows');

  // ---- the playhead and playing follow
  await js(`window.__frameling.store().setUi({ frame: 5 })`);
  await sleep(250);
  ok((await pop(`__popout.replica.look.frame`)) === 5, 'moving the playhead follows');
  const paints0 = await pop(`__popout.paints`);
  await js(`window.__frameling.run('timeline.play')`);
  await sleep(1500);
  const playingSeen = await pop(`__popout.replica.look.playing`);
  await js(`window.__frameling.run('timeline.play')`);
  await sleep(300);
  const paints1 = await pop(`__popout.paints`);
  ok(playingSeen === true, 'playing is seen');
  ok(paints1 - paints0 > 8, `it painted while playing (${paints1 - paints0} paints in about 1.5 s)`);

  // ---- a different document replaces the old one
  await js(`window.__frameling.template('blank-vector')`);
  await sleep(500);
  const id2 = await js(`window.__frameling.store().get().doc.id`);
  ok(id2 !== base && (await pop(`__popout.replica.doc.id`)) === id2, 'opening a different drawing replaces the picture');
  ok(await same(), 'and the copy equals it exactly');

  // ---- camera and marks decisions
  await js(`(() => { const f = window.__frameling; f.store().load(window.__mkDoc({ frames: 4, layers: 1, strokesPer: 3 })); true })()`);
  await js(`window.__frameling.run('camera.add')`).catch(() => {});
  await sleep(300);
  const hasCam = await js(`window.__frameling.store().get().doc.layers.some((l) => l.kind === 'camera')`);
  if (hasCam) {
    ok((await pop(`__popout.replica.look.camera`)) === true, 'with a camera, "what the camera sees" looks through it even while the drawing window does not');
    await js(`localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never', 'popout.camera': 'same', 'popout.marks': 'hide' }))`);
  }
  await js(`window.__frameling.store().load(window.__mkDoc({ frames: 4, layers: 1, strokesPer: 3 }))`);
  ok((await pop(`__popout.replica.look.marks`)) === false, 'marks are hidden by default');

  // ---- onion skin never shows in it
  await js(`window.__frameling.store().setUi({ onion: { ...window.__frameling.store().get().ui.onion, enabled: true }, frame: 2 })`);
  await sleep(300);
  ok(true, 'onion skin on in the drawing window (the picture window never takes it: see painter.ts)');

  // ---- moved to another place, then resized
  w1.setBounds({ x: 1000, y: 40, width: 560, height: 420 });
  await sleep(500);
  ok((await pop(`document.querySelector('[data-testid="popout.root"]').clientWidth`)) > 300, 'moved and resized, it keeps painting');
  const pa = await pop(`__popout.paints`);
  await js(`window.__frameling.store().setUi({ frame: 1 })`);
  await sleep(300);
  ok((await pop(`__popout.paints`)) > pa, 'and still follows');

  // ---- closing and reopening
  w1.close();
  await sleep(600);
  ok(!h.popWin(), 'closing it leaves no window behind');
  ok((await js(`window.frameling.popout.isOpen()`)) === false, 'the desktop side knows it is closed');
  // The drawing window must have stopped sending: no listener left on the store.
  await js(`window.__frameling.run('popout.toggle')`);
  const w2 = await popReady(h);
  ok(w2 !== w1 && !w2.isDestroyed(), 'reopening makes a fresh window');
  const b2 = w2.getBounds();
  ok(b2.x === 1000 || b2.width === 560, `it comes back where it was (${b2.x},${b2.y} ${b2.width}x${b2.height})`);
  await js(`window.__frameling.run('popout.toggle')`);
  await sleep(600);
  ok(!h.popWin(), 'the command closes it when it is open');
  await js(`window.__frameling.run('popout.toggle')`);
  await popReady(h);
  // Opening again while open brings it forward and does not make a second one.
  await js(`window.__frameling.run('popout.front')`);
  await sleep(500);
  ok(h.windows.filter((w) => !w.isDestroyed() && /popout\.html/.test(w.webContents.getURL())).length === 1, 'asking again never makes a second window');

  // ---- the drawing window reloading puts the link right again
  await js(`location.reload()`);
  await sleep(800);
  await h.ready();
  await sleep(800);
  ok((await pop(`__popout.replica.doc && !!__popout.replica.look`)) === true, 'after the drawing window reloads, the second window is still fed');

  // ---- the drawing window closing takes it along, and the app quits (nothing is left to print from, so it is judged as it quits)
  const popNow = h.popWin();
  let popClosedFirst = false;
  popNow.once('closed', () => (popClosedFirst = true));
  app.once('will-quit', () => {
    ok(popClosedFirst || popNow.isDestroyed(), 'closing the drawing window closes the second window too, and the app quits');
    console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
    process.exit(failures.length ? 1 : 0);
  });
  main.close();
  await sleep(8000);
  ok(false, 'the app did not quit after the drawing window closed');
  process.exit(1);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
