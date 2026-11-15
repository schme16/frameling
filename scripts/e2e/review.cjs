// Live review, checked in the real built app: a sharer's drawing window and a reviewer's window joined by the real main-process
// bridges and the real share handshake, over the in-memory peer network (no sockets). Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review.cjs [--theme dark|light]
//
// Checks: the card shows a code; a reviewer knocks and is let in; the reviewer's copy follows strokes (and holds no notes of
// the sharer's); the reviewer's pointer shows on the sharer's drawing and the sharer's on theirs; a reviewer's note and mark
// arrive in the inbox and change nothing in the drawing until Keep, which is one undo step; names are covered while streaming;
// Stop ends it.
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

  // ---- a note and a mark come back to the inbox, and change nothing until Keep
  const docBefore = await js(`JSON.stringify(window.__frameling.store().get().doc.layers.length) + ':' + (window.__frameling.store().get().doc.notes || []).length`);
  const canUndoBefore = await js(`window.__frameling.store().canUndo()`);
  await rjs(`document.querySelector('[data-testid="review.tool.note"]').click()`);
  await sleep(100);
  rsend({ type: 'mouseDown', x: Math.round(rbox.x + rbox.w / 2), y: Math.round(rbox.y + rbox.h / 2), button: 'left', clickCount: 1 });
  rsend({ type: 'mouseUp', x: Math.round(rbox.x + rbox.w / 2), y: Math.round(rbox.y + rbox.h / 2), button: 'left', clickCount: 1 });
  await sleep(300);
  await rw.webContents.insertText('the line wobbles here');
  rsend({ type: 'keyDown', keyCode: 'Enter' });
  rsend({ type: 'keyUp', keyCode: 'Enter' });
  await rjs(`document.querySelector('[data-testid="review.tool.circle"]').click()`);
  rsend({ type: 'mouseMove', x: Math.round(rbox.x + 100), y: Math.round(rbox.y + 100) });
  rsend({ type: 'mouseDown', x: Math.round(rbox.x + 100), y: Math.round(rbox.y + 100), button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { rsend({ type: 'mouseMove', x: Math.round(rbox.x + 100 + i * 15), y: Math.round(rbox.y + 100 + i * 10), modifiers: ['leftButtonDown'] }); await sleep(30); }
  rsend({ type: 'mouseUp', x: Math.round(rbox.x + 190), y: Math.round(rbox.y + 160), button: 'left', clickCount: 1 });
  ok(await until(async () => js(`document.querySelectorAll('[data-testid="review.entry"]').length === 2`)), 'their note and their circle arrive in the inbox');
  ok(await js(`document.querySelector('[data-testid="review.words"]')?.textContent === 'the line wobbles here'`), 'the note says what they typed');
  ok((await js(`JSON.stringify(window.__frameling.store().get().doc.layers.length) + ':' + (window.__frameling.store().get().doc.notes || []).length`)) === docBefore, 'the drawing is untouched until Keep');
  ok((await js(`window.__frameling.store().canUndo()`)) === canUndoBefore, 'and the sharer\'s own undo is untouched');
  ok(await until(async () => rjs(`document.querySelector('[data-testid="review.pin"] .rv-pin-text')?.textContent === 'the line wobbles here'`)), 'they see their own note on their side, marked as sent');

  // ---- names and words are covered while streaming (Stream-safe on, and nobody has said the viewers see only the capture window)
  await js(`window.__frameling.run('view.streamSafe')`);
  await sleep(500);
  ok(await js(`document.querySelector('[data-testid="review.seat"] .rv-seat-name')?.textContent === 'A reviewer'`), 'streaming: their name is covered');
  ok(await js(`[...document.querySelectorAll('[data-testid="review.entry"]')].every((e) => !e.querySelector('[data-testid="review.words"]') && !!e.querySelector('[data-testid="review.read"]'))`), 'streaming: their words are covered until you press Read it');
  ok(await js(`!(document.querySelector('[data-testid="review.pointers"] .rv-pointer span'))`), 'streaming: their pointer is a nameless dot');
  ok(/new comment/.test(await js(`document.querySelector('[data-testid="review.count"]')?.textContent || ''`)), 'streaming: the card says how many new comments, not what they say');
  await js(`document.querySelector('[data-testid="review.read"]').click()`);
  await sleep(200);
  ok(await js(`document.querySelector('[data-testid="review.words"]')?.textContent === 'the line wobbles here'`), 'pressing Read it shows the words (they cover again by themselves)');
  await js(`window.__frameling.run('view.streamSafe')`);
  await sleep(300);

  // ---- Keep is one undo step
  await js(`document.querySelector('[data-testid="review.keepAll"]').click()`);
  await sleep(300);
  const kept = await js(`(() => { const d = window.__frameling.store().get().doc; return { notes: (d.notes || []).map((n) => [n.text, n.by]), marks: (d.marks || []).map((m) => [m.kind, m.by]) }; })()`);
  ok(kept.notes.some(([t, b]) => t === 'the line wobbles here' && b === 'Sam') && kept.marks.some(([k, b]) => k === 'circle' && b === 'Sam'), 'Keep writes their note and mark, with their name');
  await js(`window.__frameling.run('edit.undo')`);
  await sleep(200);
  const afterUndo = await js(`(() => { const d = window.__frameling.store().get().doc; return { notes: (d.notes || []).length, marks: (d.marks || []).length }; })()`);
  ok(afterUndo.notes === 1 && afterUndo.marks === 0, 'one Undo takes it all back (the sharer\'s own note stays)');

  // ---- Stop ends it
  await js(`document.querySelector('[data-testid="review.stop"]').click()`);
  ok(await until(async () => rjs(`document.querySelector('[data-testid="review.win"]')?.dataset.link === 'ended'`)), 'Stop tells the reviewer it ended');
  ok(!(await js(`!!document.querySelector('[data-testid="review.chip"]')`)), 'the chip goes when the review does');

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
  app.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
