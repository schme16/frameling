// Checks Stream control against the REAL app (both windows and the message port between them), then makes its pictures and
// clip. Every check drives the real pages: real mouse events on the board, the real commands behind the buttons.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/streamboard.cjs --theme dark [--ab] [--help] [--clip]
//
// --ab    writes brand/ab/stream-control/: the board in <theme> (captioned) and a clip of a button being moved and a vote started
// --help  is now made by scripts/e2e/streamboard-private.cjs (the picture shows the private side)
// With neither, only the checks run. Exit code 1 when a check fails.
const { app } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, sleep, MKDOC, root } = require('./popout-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const wantAb = process.argv.includes('--ab');
const wantHelp = process.argv.includes('--help');
const wantClip = process.argv.includes('--clip');
const SCREEN = { w: 1600, h: 800 };
const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

(async () => {
  const h = await boot({ theme, width: 900, height: 800, choices: { 'streamboard.top': 'normal', 'streamboard.front': 'front', 'audience.strictness': 'balanced', 'audience.view': 'screen' } });
  const { js, main } = h;
  await js(MKDOC);
  await js(`(() => { const S = window.__frameling.store(); const d = window.__mkDoc({ width: 800, height: 800, frames: 1, layers: 3, strokesPer: 14, pts: 16 }); d.name = 'Stream test'; S.load(d); return true; })()`);
  await js(`window.__frameling.store().setUi({ tool: 'brush' })`);

  const boardWin = () => h.windows.find((w) => !w.isDestroyed() && /streamboard\.html/.test(w.webContents.getURL()));
  await js(`window.__frameling.run('streamboard.toggle')`);
  let bw = null;
  for (let i = 0; i < 100 && !bw; i++) {
    bw = boardWin();
    if (!bw) await sleep(100);
  }
  if (!bw) throw new Error('the board never opened');
  bw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  main.setBounds({ x: 0, y: 0, width: 900, height: 800 });
  const bj = (code) => js(code, bw);
  const q = (sel) => bj(`!!document.querySelector(${JSON.stringify(sel)})`);
  const text = (sel) => bj(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const waitFor = async (code, ms = 6000, w = bw) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await js(code, w).catch(() => false)) return true;
      await sleep(80);
    }
    return false;
  };
  await waitFor('!!document.querySelector("[data-testid=\\"sb.root\\"]")');
  await sleep(500);

  // Real mouse events at the middle of an element on the board.
  const rect = (sel) => bj(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const tap = async (sel, w = bw, wait = 350) => {
    const r = w === bw ? await rect(sel) : await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`, w);
    w.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    w.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(wait);
  };
  const order = () => bj(`[...document.querySelectorAll('[data-testid^="sb.tile."]')].map((e) => e.dataset.testid.slice(8))`);

  // ---- The board opens with the default buttons, the Stop bar, and no words in it that should not be.
  const first = await order();
  check(first.length === 11 && first[0] === 'vote', `default board has 11 buttons starting with the vote button (${first.join(', ')})`);
  check(await q('[data-testid="sb.stop"]'), 'the Stop everything bar is there');
  check((await bj(`document.querySelector('[data-testid="sb.stop"]').closest('[data-testid="sb.grid"]') === null`)) === true, 'Stop everything is not among the arrangeable buttons');
  check(!(await q('[data-testid="sb.tile.stop"]')), 'there is no tile for Stop everything');

  // ---- A button that cannot work says why, and pressing it says so too.
  check((await bj(`document.querySelector('[data-testid="sb.tile.queue"]').getAttribute('aria-disabled')`)) === 'true', 'Empty the queue is greyed while nothing is waiting');
  await tap('[data-testid="sb.tile.queue"]');
  check(/Nothing is waiting|Switch audience/i.test((await text('[data-testid="sb.said"]')) || ''), `pressing a greyed button says why: "${await text('[data-testid="sb.said"]')}"`);

  // ---- Audience participation, from the board (the questions were answered ahead, so none is waiting).
  await tap('[data-testid="sb.tile.audience"]', bw, 600);
  check((await text('[data-testid="sb.audience"]'))?.includes('on'), 'the audience button switches it on and the chip says so');
  check((await js(`window.__framelingAudience.audience.isOn()`)) === true, 'the real gate is on');
  await js(`window.__framelingAudience.demo(); window.__framelingAudience.on(8, 'strict')`);
  await sleep(400);
  check(/\d+ waiting/.test((await text('[data-testid="sb.audience"]')) || ''), 'the chip counts what is waiting');
  check(/\d+ waiting/.test((await text('[data-testid="sb.tile.queue"]')) || ''), 'the queue button counts what is waiting');

  // ---- The same covering rules as the main window.
  await js(`window.__framelingJar.add('a very rude secret prompt'); window.__framelingJar.add('draw a sleepy cat')`);
  await sleep(300);
  await tap('[data-testid="sb.tile.jar"]', bw, 600);
  check(await q('[data-testid="sb.prompt"][data-covered]'), 'a pulled prompt is covered on the board');
  const html = await bj(`document.documentElement.outerHTML`);
  check(!/rude|sleepy/.test(html), 'the covered words are nowhere in the board page');
  await tap('[data-testid="sb.read"]');
  check(/rude|sleepy/.test((await text('[data-testid="sb.prompt.text"]')) || ''), 'pressing Read it shows the prompt');
  check((await js(`window.__framelingJar.state().hand !== null`)) === true, 'the prompt is the one in the real jar');
  await tap('[data-testid="sb.cover"]');
  check(await q('[data-testid="sb.prompt"][data-covered]'), 'Cover it puts it back');

  // ---- Rearranging: pick up, put down, and it sticks.
  await tap('[data-testid="sb.arrange"]');
  await tap('[data-testid="sb.tile.safe"]');
  await tap('[data-testid="sb.tile.vote"]');
  const moved = await order();
  check(moved[0] === 'safe' && moved[1] === 'vote' && moved.length === 11, `tapping a button then a spot moves it (${moved.slice(0, 3).join(', ')} ...)`);
  await tap('[data-testid="sb.tile.dares"]');
  await tap('[data-testid="sb.putAway"]');
  check(!(await order()).includes('dares') && (await q('[data-testid="sb.tray.dares"]')), 'Put away moves a button to the tray');
  await tap('[data-testid="sb.tray.dares"]');
  check((await order()).includes('dares'), 'Add brings it back');
  await tap('[data-testid="sb.arrange"]');
  const saved = await js(`localStorage.getItem('frameling.streamboard.v1')`);
  check(!!saved && JSON.parse(saved).shown[0] === 'safe', 'the layout is saved with the other settings');
  // Close and open again: the layout and the place come back.
  await js(`window.__frameling.run('streamboard.toggle')`);
  await sleep(600);
  check(!boardWin(), 'the command closes the board');
  await js(`window.__frameling.run('streamboard.toggle')`);
  bw = null;
  for (let i = 0; i < 100 && !bw; i++) { bw = boardWin(); if (!bw) await sleep(100); }
  await waitFor('!!document.querySelector("[data-testid=\\"sb.root\\"]")');
  bw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  await sleep(500);
  check((await order())[0] === 'safe', 'the arrangement is back after closing and opening');

  // ---- A vote, from the board.
  await tap('[data-testid="sb.arrange"]');
  await tap('[data-testid="sb.reset"]');
  await tap('[data-testid="sb.arrange"]');
  check((await order())[0] === 'vote', 'Put them back restores the first arrangement');
  await tap('[data-testid="sb.tile.vote"]', bw, 800);
  check(await waitFor('!!document.querySelector("[data-testid=\\"votes.setup.question\\"]")', 4000, main), 'Start a vote opens the setup dialog in the drawing window');
  await js(`(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('[data-testid="votes.setup.question"]', 'Which colour next?');
    set('[data-testid="votes.setup.option.1"]', 'Red');
    set('[data-testid="votes.setup.option.2"]', 'Blue');
  })()`);
  await sleep(300);
  await tap('[data-testid="votes.setup.start"]', main, 500);
  check(/End the vote/.test((await text('[data-testid="sb.tile.vote"]')) || ''), 'the vote button becomes End the vote');
  await js(`window.__framelingVotes.crowd(14, (i) => (i % 3 === 0 ? 2 : 1))`);
  await sleep(500);
  check(/14 votes in/.test((await text('[data-testid="sb.tile.vote"]')) || ''), 'it counts the votes in');

  // ---- Stop everything.
  await tap('[data-testid="sb.stop"]', bw, 600);
  check((await js(`window.__framelingAudience.audience.isOn()`)) === false, 'Stop everything switches audience participation off');
  check(/Off/.test((await text('[data-testid="sb.tile.audience"]')) || ''), 'the audience button shows off');
  check(/Stopped/.test((await text('[data-testid="sb.said"]')) || ''), 'the board says what happened');

  // ---- Where it was is remembered, and it goes with the streaming tools.
  bw.setBounds({ x: 1000, y: 40, width: 600, height: 700 });
  await sleep(600);
  await js(`window.__frameling.run('streamboard.toggle')`);
  await sleep(800);
  const placeFile = path.join(h.data, 'streamboard-window.json');
  const place = fs.existsSync(placeFile) ? JSON.parse(fs.readFileSync(placeFile, 'utf8')) : null;
  check(!!place && place.width === 600 && place.height === 700, `its size and place are remembered (${place ? `${place.width}x${place.height} at ${place.x},${place.y}` : 'no file'})`);
  await js(`window.__frameling.run('streamboard.toggle')`);
  bw = null;
  for (let i = 0; i < 100 && !bw; i++) { bw = boardWin(); if (!bw) await sleep(100); }
  check(!!bw && bw.getBounds().width === 600, 'and it opens there again');
  await js(`window.__frameling.run('features.streamingOff')`);
  await sleep(1000);
  check(!boardWin(), 'the board goes when the streaming tools are tucked away');
  check(!(await js(`window.__frameling.commands().includes('streamboard.toggle')`)), 'and its command goes with them');
  await js(`window.__frameling.run('features.streamingOn')`);
  await sleep(600);
  check(await js(`window.__frameling.commands().includes('streamboard.toggle')`), 'and comes back with them');
  console.log(`${failed} failed`);
  if (!wantAb && !wantHelp && !wantClip) {
    app.exit(failed ? 1 : 0);
    return;
  }

  // ---------------- Pictures and the clip (a fresh app so the state is the same in both themes).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'streamboard-media-'));
  const shot = async (w, name) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, (await w.webContents.capturePage()).toPNG());
    return f;
  };
  const colours = theme === 'dark' ? ['#1d1b26', '#f4efe6'] : ['#fffaf2', '#2a2533'];
  const caption = (src, dst, t) => {
    const w = Number(execFileSync('identify', ['-format', '%w', src]).toString());
    run('convert', [src, '(', '-size', `${w - 32}x`, '-background', colours[0], '-fill', colours[1], '-font', 'DejaVu-Sans', '-pointsize', '15', `caption:${t}`, '-bordercolor', colours[0], '-border', '16x10', ')', '-background', colours[0], '-append', dst]);
  };

  await js(`window.__frameling.run('streamboard.toggle')`);
  bw = null;
  for (let i = 0; i < 100 && !bw; i++) { bw = boardWin(); if (!bw) await sleep(100); }
  await waitFor('!!document.querySelector("[data-testid=\\"sb.root\\"]")');
  bw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  await js(`window.__framelingJar.add('draw your favourite snack'); window.__framelingJar.add('a cat on a skateboard'); window.__framelingJar.add('the moon wearing a hat'); window.__framelingJar.state().hand || window.__framelingJar.pull()`);
  // The checks leave toasts in the drawing window (Stopped, tucked away): clear them so no picture or clip shows leftovers.
  const clearToasts = () => js(`document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())`);
  await clearToasts();
  if (wantClip) {
    // A fresh scene: audience on, a prompt in hand (covered), no vote. Then a button is moved and a vote is started from the board.
    await js(`window.__framelingVotes.close(); window.__framelingAudience.on(3)`);
    await js(`window.__framelingJar.add('draw your favourite snack'); window.__framelingJar.add('a cat on a skateboard'); window.__framelingJar.state().hand || window.__framelingJar.pull()`);
    main.setBounds({ x: 0, y: 0, width: 900, height: 800 });
    bw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
    main.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 300 });
    await sleep(1000);
    await clearToasts();
    const raw = path.join(tmp, 'raw.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${SCREEN.w}x${SCREEN.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
    await sleep(1800);
    await tap('[data-testid="sb.arrange"]', bw, 1100);
    await tap('[data-testid="sb.tile.safe"]', bw, 1300);
    await tap('[data-testid="sb.tile.vote"]', bw, 1500);
    await tap('[data-testid="sb.arrange"]', bw, 1500);
    await tap('[data-testid="sb.tile.vote"]', bw, 1600);
    const set = (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await set('[data-testid="votes.setup.question"]', 'Which colour next?');
    await sleep(700);
    await set('[data-testid="votes.setup.option.1"]', 'Red');
    await sleep(500);
    await set('[data-testid="votes.setup.option.2"]', 'Blue');
    await sleep(900);
    await tap('[data-testid="votes.setup.start"]', main, 1200);
    for (let i = 0; i < 5; i++) {
      await js(`window.__framelingVotes.crowd(5, (n) => (n % 3 === 0 ? 2 : 1), ${i * 5})`);
      await sleep(650);
    }
    await sleep(1800);
    ff.stdin.write('q');
    await new Promise((r) => ff.once('exit', r));
    const out = path.join(root, 'brand/ab/stream-control');
    fs.mkdirSync(out, { recursive: true });
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', path.join(out, `stream-control-${theme}.mp4`)]);
    console.log(`wrote ${out}/stream-control-${theme}.mp4`);
    await js(`window.__framelingVotes.close()`);
  }
  // Set the scene: audience on with a few waiting, a vote going with counts, a covered prompt.
  await js(`window.__frameling.setPref && 0`);
  await js(`window.__framelingAudience.on(3)`);
  await js(`window.__framelingVotes.close(); window.__framelingVotes.start({ question: 'Which colour next?', options: ['Red', 'Blue', 'Green'], seconds: null })`);
  await js(`window.__framelingVotes.crowd(23, (i) => [1, 2, 2, 3, 2][i % 5], 100)`);
  await js(`window.__framelingJar.pull && 0`);
  await sleep(700);
  const pic = await shot(bw, 'board.png');
  const both = path.join(tmp, 'both.png');
  await clearToasts();
  main.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 300 });
  await sleep(1500);
  const mainShot = await shot(main, 'main.png');
  if (wantAb) {
    const out = path.join(root, 'brand/ab/stream-control');
    fs.mkdirSync(out, { recursive: true });
    caption(pic, path.join(out, `board-${theme}.png`), `Stream control (${theme} theme), on the second screen: a vote is going (23 in), audience participation is on with some things waiting, and a prompt is pulled but covered. Stop everything is the red bar at the bottom, apart from the buttons.`);
    await tap('[data-testid="sb.arrange"]');
    await tap('[data-testid="sb.tile.guess"]');
    await sleep(300);
    const arr = await shot(bw, 'arrange.png');
    caption(arr, path.join(out, `arranging-${theme}.png`), `Arranging (${theme} theme): the streamer tapped Start a guessing game to pick it up. Tapping another button puts it in that spot. No dragging, so a pen or a finger does the same as a mouse.`);
    await tap('[data-testid="sb.arrange"]');
    console.log(`wrote ${out}/board-${theme}.png and arranging-${theme}.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
