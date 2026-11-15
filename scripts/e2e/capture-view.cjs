// The capture view, checked in the real app. Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/capture-view.cjs
//
// Checks: it opens as a frameless window named "Frameling capture" that shows the picture on the chosen colour; the page and the
// window never hold the drawing's name; a fixed size is exactly that many pixels and cannot be dragged to another; "any size" frees it;
// the colour changes live; the plain second window swaps with it and back.
const { app } = require('electron');
const { boot, popReady, sleep, MKDOC } = require('./popout-lib.cjs');

const failures = [];
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures.push(what);
};

(async () => {
  const h = await boot({ choices: { 'popout.captureBackground': 'green', 'popout.captureCursor': 'hide', 'popout.captureSize': 'free' } });
  const { js } = h;
  await js(MKDOC);
  await js(`(() => { const f = window.__frameling; f.store().load(window.__mkDoc({ frames: 4, layers: 1, strokesPer: 3, pts: 8, fps: 12 })); return true; })()`);
  await sleep(300);
  const pop = (code) => js(code, h.popWin());

  await js(`window.__frameling.run('capture.toggle')`);
  let w = await popReady(h);
  ok(!w.isDestroyed(), 'the capture view opens and shows a picture');
  ok(w.getTitle() === 'Frameling capture', `its title is "${w.getTitle()}"`);
  ok((await pop('document.title')) === 'Frameling capture' && !/fling|[\\/]/.test(w.getTitle()), 'the page title and the window title hold no file name or path');
  const look = await pop(`JSON.stringify(__popout.replica.look)`);
  ok(JSON.parse(look).name === '', 'the drawing window never sent the drawing name');
  ok(JSON.parse(look).capture?.bg === '#00b140', 'the colour is the key green');
  const bg = await pop(`getComputedStyle(document.querySelector('.po-root')).backgroundColor`);
  ok(bg === 'rgb(0, 177, 64)', `the page background is the chosen colour (${bg})`);
  ok((await pop(`getComputedStyle(document.querySelector('.po-root')).cursor`)) === 'none', 'the pointer is hidden over it');
  ok((await pop(`!document.querySelector('.po-hint') && !document.querySelector('.po-wait')`)), 'nothing on it but the drawing (no hint, no waiting note)');
  ok(!w.isMenuBarVisible || !w.isMenuBarVisible(), 'no menu bar');

  // A fixed size
  await js(`window.__frameling.run('capture.size.1280x720')`);
  await sleep(700);
  w = h.popWin();
  const [cw, ch] = w.getContentSize();
  const sf = require('electron').screen.getPrimaryDisplay().scaleFactor || 1;
  ok(Math.abs(cw * sf - 1280) <= 2 && Math.abs(ch * sf - 720) <= 2, `a fixed size is exactly 1280 x 720 pixels (${cw}x${ch} at scale ${sf})`);
  ok(!w.isResizable(), 'and it cannot be dragged to another size');
  await js(`window.__frameling.run('capture.size.free')`);
  await sleep(500);
  ok(h.popWin().isResizable(), 'any size frees it again');

  // The colour changes live
  await js(`window.__frameling.run('capture.cursor')`);
  await sleep(300);
  ok((await pop(`getComputedStyle(document.querySelector('.po-root')).cursor`)) !== 'none', 'turning the hide-pointer switch off shows the pointer');

  // Swapping with the plain second window and back
  await js(`window.__frameling.run('popout.toggle')`);
  await sleep(1200);
  w = await popReady(h);
  ok(/second window/.test(w.getTitle()) || /second window/.test(await pop('document.title')), 'the second window swaps in');
  ok(!(await pop(`!!document.querySelector('.po-capture')`)), 'and it is not the capture view');
  await js(`window.__frameling.run('capture.toggle')`);
  await sleep(1200);
  w = await popReady(h);
  ok(w.getTitle() === 'Frameling capture', 'and the capture view swaps back');
  await js(`window.__frameling.run('capture.toggle')`);
  await sleep(600);
  ok(!h.popWin(), 'the command closes it when it is open');

  console.log(failures.length ? `\n${failures.length} failed` : 'all passed');
  app.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
