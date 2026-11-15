// Live review, checked in the real built app: a sharer's drawing window and a reviewer's window joined by the real main-process
// bridges and the real share handshake, over the in-memory peer network (no sockets). Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review.cjs [--theme dark|light]
//
// Checks: the card shows a code; a reviewer knocks and is let in; the reviewer's copy follows strokes (and holds no notes of
// the sharer's); the reviewer's pointer shows on the sharer's drawing and the sharer's on theirs; a reviewer's note and mark
// go straight into the drawing without touching the sharer's undo or redo; while streaming they wait covered and go in when
// it is safe; show me first still works (Keep is one undo step); Stop ends it and the reviewer's window says so and saves the
// last picture as a PNG.
const { app } = require('electron');
const { boot, sleep, DOC, reviewWin, startReview, joinAndAdmit } = require('./review-lib.cjs');
const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'dark';

const failures = [];
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures.push(what);
};
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn().catch(() => false)) return true;
    await sleep(100);
  }
  return false;
};

(async () => {
  const h = await boot({ theme, width: 900, height: 800 });
  const { js, main } = h;
  await js(DOC);
  await js(`(() => { const S = window.__frameling.store(); S.update('note', (d) => { d.notes = [{ id: 'mine', x: 5, y: 5, text: 'my private note' }]; }); return true; })()`);
  await sleep(300);
  const send = (e) => main.webContents.sendInputEvent(e);
  const view = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const u = window.__frameling.store().get().ui; return { x: r.left, y: r.top, zoom: u.zoom, panX: u.panX, panY: u.panY }; })()`);
  const scr = (x, y) => ({ x: Math.round(view.x + view.panX + x * view.zoom), y: Math.round(view.y + view.panY + y * view.zoom) });
  async function draw(points) {
    send({ type: 'mouseMove', ...scr(...points[0]) });
    send({ type: 'mouseDown', ...scr(...points[0]), button: 'left', clickCount: 1 });
    for (const q of points.slice(1)) {
      send({ type: 'mouseMove', ...scr(...q), modifiers: ['leftButtonDown'] });
      await sleep(20);
    }
    send({ type: 'mouseUp', ...scr(...points[points.length - 1]), button: 'left', clickCount: 1 });
    await sleep(300);
  }

  // ---- off by default and obvious when live
  ok(!(await js(`!!document.querySelector('[data-testid="review.chip"]')`)), 'off by default: no chip, no card');
  const code = await startReview(h);
  ok(code.split('-').length === 4, `the card shows a four word code (${code.replace(/-\w+$/, '-...').replace(/-\w+-/, '-...-')})`);
  ok(await js(`!!document.querySelector('[data-testid="review.chip"]')`), 'a chip shows in the title bar while it is on');

  // ---- a reviewer knocks and is let in
  const rw = await joinAndAdmit(h, code, 'Sam');
  ok(!!rw && !rw.isDestroyed(), 'the reviewer is let in and the picture arrives');
  const rjs = (c) => js(c, rw);
  const drawingId = await js(`window.__frameling.store().get().doc.id`);
  ok((await rjs(`__popout.replica.doc.id`)) === drawingId, 'their copy is the same drawing');
  ok((await rjs(`__popout.replica.doc.notes === undefined`)), 'their copy holds none of the sharer\'s own notes');
  ok(await js(`document.querySelectorAll('[data-testid="review.seat"]').length === 1`), 'the card lists them as here');

  // ---- strokes follow
  const lines = () => `(() => { const d = %D%; return Object.values(d.drawings).reduce((n, x) => n + (x.shapes ? x.shapes.length : 0), 0); })()`;
  const mine = await js(lines().replace('%D%', 'window.__frameling.store().get().doc'));
  await draw(Array.from({ length: 30 }, (_, i) => [100 + i * 18, 200 + Math.sin(i / 3) * 40]));
  ok(await until(async () => (await rjs(lines().replace('%D%', '__popout.replica.doc'))) === mine + 1), 'a stroke the sharer draws reaches their copy');

  // ---- the reviewer's pointer shows on the sharer's drawing
  const rbox = await rjs(`(() => { const r = document.querySelector('[data-testid="review.surface"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const rsend = (e) => rw.webContents.sendInputEvent(e);
  for (let i = 0; i < 12; i++) {
    rsend({ type: 'mouseMove', x: Math.round(rbox.x + rbox.w / 2 + i * 12), y: Math.round(rbox.y + rbox.h / 2 - i * 4) });
    await sleep(40);
  }
  ok(await until(async () => js(`!!document.querySelector('[data-testid="review.pointers"] .rv-pointer')`)), 'the reviewer\'s pointer shows on the sharer\'s drawing');
  ok(await js(`document.querySelector('[data-testid="review.pointers"] .rv-pointer span')?.textContent === 'Sam'`), 'with their name, since nothing is streaming');
  // ...and the sharer's on theirs
  for (let i = 0; i < 8; i++) {
    send({ type: 'mouseMove', ...scr(300 + i * 10, 300 + i * 6) });
    await sleep(40);
  }
  ok(await until(async () => rjs(`!!document.querySelector('[data-testid="review.sharerPointer"]')`)), 'the sharer\'s pointer shows on theirs');

  // ---- a note and a mark go straight into the drawing, and the sharer's undo and redo are untouched
  const state = () => js(`(() => { const S = window.__frameling.store(); const d = S.get().doc; return { notes: (d.notes || []).map((n) => [n.text, n.by, n.id]), marks: (d.marks || []).map((m) => [m.kind, m.by, m.id]), undo: S.undoLabel(), redo: S.redoLabel(), canRedo: S.canRedo() }; })()`);
  const sendNote = async (text, fx, fy) => {
    await rjs(`document.querySelector('[data-testid="review.tool.note"]').click()`);
    await sleep(100);
    const p = { x: Math.round(rbox.x + rbox.w * fx), y: Math.round(rbox.y + rbox.h * fy) };
    rsend({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 });
    rsend({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
    await sleep(300);
    await rw.webContents.insertText(text);
    rsend({ type: 'keyDown', keyCode: 'Enter' });
    rsend({ type: 'keyUp', keyCode: 'Enter' });
  };
  // Give the sharer something to Redo, so a note that wiped it would show.
  await js(`window.__frameling.run('edit.undo')`);
  await sleep(200);
  const before = await state();
  ok(before.canRedo, 'the sharer has something to Redo before a reviewer writes');
  await sendNote('the line wobbles here', 0.5, 0.5);
  await rjs(`document.querySelector('[data-testid="review.tool.circle"]').click()`);
  rsend({ type: 'mouseMove', x: Math.round(rbox.x + 100), y: Math.round(rbox.y + 100) });
  rsend({ type: 'mouseDown', x: Math.round(rbox.x + 100), y: Math.round(rbox.y + 100), button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { rsend({ type: 'mouseMove', x: Math.round(rbox.x + 100 + i * 15), y: Math.round(rbox.y + 100 + i * 10), modifiers: ['leftButtonDown'] }); await sleep(30); }
  rsend({ type: 'mouseUp', x: Math.round(rbox.x + 190), y: Math.round(rbox.y + 160), button: 'left', clickCount: 1 });
  ok(await until(async () => (await state()).notes.length === before.notes.length + 1 && (await state()).marks.length === before.marks.length + 1), 'their note and their circle are in the drawing with no press');
  const after = await state();
  ok(after.notes.some(([t, by]) => t === 'the line wobbles here' && by === 'Sam') && after.marks.some(([k, by]) => k === 'circle' && by === 'Sam'), 'with their name on');
  ok(after.undo === before.undo && after.redo === before.redo && after.canRedo, 'the sharer\'s Undo and Redo are exactly as they were');
  ok(await js(`document.querySelector('[data-testid="review.words"]')?.textContent === 'the line wobbles here' && /in your drawing/.test(document.querySelector('[data-testid="review.entry"]').textContent)`), 'the card lists it as in your drawing');
  ok(await js(`document.querySelector('[data-testid="review.keepAll"]') === null`), 'there is nothing to press Keep on');
  ok(await until(async () => rjs(`document.querySelector('[data-testid="review.pin"] .rv-pin-text')?.textContent === 'the line wobbles here'`)), 'they see their own note on their side, marked as sent');
  await js(`window.__frameling.run('edit.redo')`);
  await sleep(150);
  await js(`window.__frameling.run('edit.undo')`);
  await sleep(150);
  ok((await state()).notes.some(([t]) => t === 'the line wobbles here'), 'Undo and Redo of the sharer\'s own stroke leave a reviewer\'s note where it is');

  // ---- names and words are covered while streaming: a note then waits in the card, and goes in when the cover lifts
  await js(`window.__frameling.run('view.streamSafe')`);
  await sleep(500);
  ok(await js(`document.querySelector('[data-testid="review.seat"] .rv-seat-name')?.textContent === 'A reviewer'`), 'streaming: their name is covered');
  ok(await js(`!(document.querySelector('[data-testid="review.pointers"] .rv-pointer span'))`), 'streaming: their pointer is a nameless dot');
  const quiet = await state();
  await sendNote('and this edge too', 0.3, 0.6);
  ok(await until(async () => js(`document.querySelectorAll('[data-testid="review.entry"]').length === 3`)), 'streaming: the new comment reaches the card');
  ok((await state()).notes.length === quiet.notes.length, 'streaming: and waits there, out of the drawing');
  ok(await js(`[...document.querySelectorAll('[data-testid="review.entry"]')].every((e) => !e.querySelector('[data-testid="review.words"]') && !!e.querySelector('[data-testid="review.read"]'))`), 'streaming: every comment\'s words are covered until you press Read it');
  ok(/new comment/.test(await js(`document.querySelector('[data-testid="review.count"]')?.textContent || ''`)), 'streaming: the card says how many new comments, not what they say');
  await js(`[...document.querySelectorAll('[data-testid="review.read"]')].pop().click()`);
  await sleep(200);
  ok(await js(`[...document.querySelectorAll('[data-testid="review.words"]')].some((w) => w.textContent === 'and this edge too')`), 'pressing Read it shows the words (they cover again by themselves)');
  await js(`window.__frameling.run('view.streamSafe')`);
  ok(await until(async () => (await state()).notes.some(([t]) => t === 'and this edge too')), 'when the cover lifts the comment goes in by itself');
  ok(await js(`document.querySelectorAll('[data-testid="review.read"]').length === 0`), 'and nothing is covered any more');

  // ---- the old way is still there: show me first, then Keep is one undo step
  await js(`window.__frameling.run('review.addAsTheyCome')`);
  await sleep(300);
  ok(await js(`document.querySelector('[data-testid="review.auto"] input').checked === false`), 'the card shows that comments are being held for you');
  const held = await state();
  await sendNote('a third thing', 0.7, 0.3);
  ok(await until(async () => js(`!!document.querySelector('[data-testid="review.keepAll"]')`)), 'show me first: the comment waits with a Keep button');
  ok((await state()).notes.length === held.notes.length, 'and the drawing is untouched');
  await js(`document.querySelector('[data-testid="review.keepAll"]').click()`);
  await sleep(300);
  ok((await state()).notes.some(([t]) => t === 'a third thing'), 'Keep writes it in');
  await js(`window.__frameling.run('edit.undo')`);
  await sleep(200);
  ok(!(await state()).notes.some(([t]) => t === 'a third thing'), 'one Undo takes a kept comment back (and only that way)');
  await js(`window.__frameling.run('review.addAsTheyCome')`);

  // A layer the sharer switched off, covering the whole page in red: the reviewer's copy holds it, a saved picture must not show it.
  await js(`(() => { const S = window.__frameling.store(); S.update('secret', (d) => { const dr = { id: 'dr-secret', kind: 'vector', shapes: [{ id: 'sh-secret', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 800 }, { x: 0, y: 800 }] }], fill: '#ff0000', stroke: null, opacity: 1 }] }; d.drawings[dr.id] = dr; d.layers.push({ id: 'l-secret', name: 'Secret', kind: 'vector', visible: false, locked: false, opacity: 1, cels: [{ id: 'c-secret', start: 0, length: 12, drawingId: dr.id }] }); }); return true; })()`);
  ok(await until(async () => rjs(`__popout.replica.doc.layers.some((l) => l.id === 'l-secret')`)), 'their copy holds a layer the sharer switched off (so the save has to leave it out)');

  // ---- Stop ends it, and the reviewer's window says so plainly
  await js(`document.querySelector('[data-testid="review.stop"]').click()`);
  ok(await until(async () => rjs(`document.querySelector('[data-testid="review.win"]')?.dataset.link === 'ended'`)), 'Stop tells the reviewer it ended');
  ok(!(await js(`!!document.querySelector('[data-testid="review.chip"]')`)), 'the chip goes when the review does');
  ok(await rjs(`/This review has ended/.test(document.querySelector('[data-testid="review.over"]')?.textContent || '')`), 'the ended window has a strip that says so');
  ok(await rjs(`/^Review ended/.test(document.title)`), 'its title bar says Review ended');
  ok(await rjs(`!!document.querySelector('[data-testid="review.veil"]')`), 'the picture is greyed and still');
  ok(await rjs(`['note', 'text', 'arrow', 'circle', 'scribble'].every((t) => document.querySelector('[data-testid="review.tool.' + t + '"]').disabled) && !document.querySelector('[data-testid="review.tool.look"]').disabled`), 'the tools that would send something are off, Look is not');
  ok(await rjs(`!!document.querySelector('[data-testid="review.save"]') && !!document.querySelector('[data-testid="review.savePicture"]')`), 'it offers Save this picture and Save my comments');

  // ---- saving the picture: a real PNG at the drawing's size, without what the sharer hid
  const { dialog } = require('electron');
  const fs = require('node:fs');
  const os = require('node:os');
  const out = require('node:path').join(os.tmpdir(), `review-picture-${process.pid}.png`);
  let asked = null;
  dialog.showSaveDialog = async (_w, o) => ((asked = o), { canceled: false, filePath: out });
  await rjs(`document.querySelector('[data-testid="review.savePicture"]').click()`);
  ok(await until(async () => fs.existsSync(out)), 'Save this picture writes a file');
  const png = fs.readFileSync(out);
  ok(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', 'it is a PNG');
  ok(/bouncing-ball-review\.png$/.test(asked?.defaultPath || ''), 'offered under a plain name made from the drawing\'s');
  const px = await rjs(`(async () => { const b = await createImageBitmap(new Blob([Uint8Array.from(atob('${png.toString('base64')}'), (c) => c.charCodeAt(0))], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0); const d = g.getImageData(5, 5, 1, 1).data; return { w: b.width, h: b.height, rgb: [d[0], d[1], d[2]] }; })()`);
  ok(px.w === 800 && px.h === 800, 'at the drawing\'s own size');
  ok(px.rgb.join() === '255,246,229', 'with the page\'s own background and none of the layer the sharer switched off');
  ok(await until(async () => rjs(`document.querySelector('[data-testid="review.over.note"]')?.textContent.includes('Picture saved')`)), 'the window says it was saved');
  fs.rmSync(out, { force: true });
  // the palette command in the drawing window asks the review window to do the same
  await js(`window.__frameling.run('review.savePicture')`);
  ok(await until(async () => fs.existsSync(out)), 'the command in the drawing window saves it too');
  fs.rmSync(out, { force: true });

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
  app.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
