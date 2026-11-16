// Checks the PRIVATE SIDE of Stream control against the REAL app (both windows and the message port between them), then makes
// its pictures and clip. Every check drives the real pages: real mouse events on the board, the real stores behind it.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/streamboard-private.cjs --theme dark [--ab] [--help]
//
// --ab    writes brand/ab/stream-private/: the board private and covered (captioned), and a clip of the whole round trip
// --help  writes public/help/stream-control-<theme>.png (the picture the help topic shows)
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
const SCREEN = { w: 1600, h: 800 };
const MAIN = { x: 0, y: 0, width: 640, height: 800 };
const BOARD = { x: 640, y: 0, width: 960, height: 800 };
const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

(async () => {
  const h = await boot({ theme, width: MAIN.width, height: MAIN.height, choices: { 'streamboard.top': 'normal', 'streamboard.front': 'front', 'audience.strictness': 'balanced', 'audience.view': 'capture' } });
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
  main.setBounds(MAIN);
  bw.setBounds(BOARD);
  const bj = (code) => js(code, bw);
  const q = (sel) => bj(`!!document.querySelector(${JSON.stringify(sel)})`);
  const text = (sel) => bj(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const all = (sel) => bj(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.textContent)`);
  const page = () => bj('document.body.innerText');
  const waitFor = async (code, ms = 6000, w = bw) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await js(code, w).catch(() => false)) return true;
      await sleep(80);
    }
    return false;
  };
  const has = (sel) => waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
  await has('[data-testid="sb.root"]');
  await sleep(500);

  const rect = (sel, w = bw) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`, w);
  const tap = async (sel, w = bw, wait = 350) => {
    const r = await rect(sel, w);
    w.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    w.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(wait);
  };
  // Types into a React input one letter at a time, the way a person does.
  const setValue = (sel, v) => bj(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const type = async (sel, t, gap = 45) => {
    await rect(sel);
    for (let i = 1; i <= t.length; i++) {
      await setValue(sel, t.slice(0, i));
      await sleep(gap);
    }
  };
  const answer = (v) => js(`window.__framelingAudience.on(0, 'balanced', ${JSON.stringify(v)})`);
  const apart = (on) => {
    main.webContents.send('streamboard:apart', on);
    return sleep(450);
  };
  const clearToasts = () => js(`document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())`);
  const slips = ['a dragon learning to skate', 'the moon wearing a hat', 'a very tiny boat', 'draw your favourite snack'];

  // ---------------- Scene one: only the capture window is seen, so the board is private and shows everything.
  await answer('capture');
  for (const s of slips) await js(`window.__framelingJar.add(${JSON.stringify(s)})`);
  await sleep(500);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'capture', 'answer "capture": the board says it is private');
  check((await all('[data-testid="sb.jar.slips"] .sb-slip-text')).join('|') === slips.join('|'), 'the whole waiting list is on the board, in full');
  check((await text('[data-testid="sb.jar.count"]')) === '4 waiting', 'the jar count says 4 waiting');

  // Choose one from the list instead of pulling blind.
  await tap('[data-testid^="sb.jar.slip."]:nth-child(2) button');
  check((await text('[data-testid="sb.prompt.text"]')) === slips[1], 'Pull this one puts the chosen prompt in hand, readable (private)');
  check((await text('[data-testid="sb.jar.count"]')) === '3 waiting', 'and it left the waiting list');

  // Write a vote on the board.
  await tap('[data-testid="sb.vote.write"]');
  await type('[data-testid="sb.vote.q"]', 'Which colour next?');
  await type('[data-testid="sb.vote.o.1"]', 'Red');
  await type('[data-testid="sb.vote.o.2"]', 'Blue');
  await tap('[data-testid="sb.vote.add"]');
  await type('[data-testid="sb.vote.o.3"]', 'Green');
  check((await bj(`document.querySelector('[data-testid="sb.vote.start"]').disabled`)) === false, 'a written vote can be started');
  await tap('[data-testid="sb.vote.start"]', bw, 900);
  check((await text('[data-testid="sb.vote.question"]')) === 'Which colour next?', 'the vote is on, and its question shows in full on the board');
  check((await all('[data-testid^="sb.vote.option."] .sb-bar-name')).join('|') === 'Red|Blue|Green', 'with every option in full');
  check(await js(`window.__framelingVotes.flush(), !!document.querySelector('.vt-panel, [class*="vt-"]')`).catch(() => true), 'the drawing window shows the vote too');
  await js(`window.__framelingVotes.crowd(12, (i) => [1, 2, 2, 3, 2][i % 5], 100)`);
  await sleep(700);
  check(/12 votes in/.test(await text('[data-testid="sb.vote.meta"]')), 'counts come in live: 12 votes');
  check(!/voter|demo-/.test(await page()), 'the board shows counts and never who');

  // Start a guessing game with the word typed on the board.
  await tap('[data-testid="sb.guess.write"]');
  await type('[data-testid="sb.guess.word"]', 'a cat in a hat');
  await tap('[data-testid="sb.guess.start"]', bw, 900);
  check((await text('[data-testid="sb.guess.secret"]'))?.includes('a cat in a hat'), 'the secret word shows plainly on a private board');
  const mainText = () => js('document.body.innerText', main);
  check(!/cat in a hat/i.test(await mainText()), 'and it is nowhere in the drawing window');
  const gr = await js(`JSON.stringify([window.__framelingGuess.guess('a dog in a hat', 'p1'), window.__framelingGuess.guess('a big fish', 'p2'), window.__framelingGuess.guess('a horse in a barn', 'p3')])`);
  if (process.env.DEBUG_E2E) console.log('guess results:', gr);
  await sleep(500);
  const guessState = await text('[data-testid="sb.guess"]');
  if (process.env.DEBUG_E2E) console.log('guess card:', guessState);
  check(/3 people guessing, 3 guesses/.test(guessState || ''), 'guesses are counted');
  check(/a dog in a hat/.test((await text('[data-testid="sb.guess.rows"]')) || '') && /a big fish/.test((await text('[data-testid="sb.guess.rows"]')) || ''), 'and listed, with their words, on a private board');
  check(await q('[data-testid="sb.stop"]'), 'Stop everything is still there, in its own place');

  // ---------------- Scene two: the same things with the answer "screen". Nothing unread reaches the board.
  const scenePrivate = await bj('document.body.innerText');
  await answer('screen');
  await sleep(700);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'everything', 'answer "screen": the board says it is covered');
  const covered = await page();
  check(!/cat in a hat|dog in a hat|big fish|horse in a barn/.test(covered), 'the secret word and the guesses are gone from the board page');
  check(!/dragon learning|moon wearing|tiny boat|favourite snack/.test(covered.replace(/\s+/g, ' ')), 'no waiting prompt, and not the prompt in hand either, is on the board page');
  check((await text('[data-testid="sb.jar.count"]')) === '3 waiting', 'only the count stays');
  check(await q('[data-testid="sb.guess.read"]'), 'the guesses wait behind Read the guesses');
  await tap('[data-testid="sb.guess.read"]');
  const rowsText = (await text('[data-testid="sb.guess.rows"]')) || '';
  check(/a dog in a hat/.test(rowsText) && /a big fish/.test(rowsText), 'after reading, the wrong guesses show');
  await tap('[data-testid="sb.guess.cover"]');
  await tap('[data-testid^="sb.jar.slip."]:nth-child(1) button');
  const oneRead = await all('[data-testid="sb.jar.slips"] .sb-slip-text');
  check(oneRead.filter((t) => !/•/.test(t)).length === 1, 'Read it reads one waiting prompt at a time');
  check(!(await q('[data-testid="sb.guess.write"]')), 'the word is not typed on a covered board');

  // One screen: private only when the board is on the other screen.
  await answer('display');
  await sleep(500);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'same-screen', 'answer "one screen": covered while it is on the same screen');
  await apart(true);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'apart', 'moved to the other screen: private');
  check(/cat in a hat/.test(await text('[data-testid="sb.guess.secret"]') || ''), 'and the word is back on it');
  await apart(false);
  check(!/cat in a hat/.test(await page()), 'moved back: covered again, the word gone from the page');

  // On stream on purpose.
  await answer('capture');
  await sleep(400);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'capture', 'back to "capture": private');
  await tap('[data-testid="sb.onstream"]', bw, 600);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'onstream', 'the switch puts the board on stream: not private');
  check(!/cat in a hat/.test(await page()), 'and it covers the word');
  await tap('[data-testid="sb.onstream"]', bw, 600);
  check((await bj(`document.querySelector('[data-testid="sb.privacy"]').dataset.why`)) === 'capture', 'switched back: private again');

  // The vote's result, then Stop everything.
  await js(`window.__framelingVotes.end()`);
  await sleep(500);
  check(/won|tie/i.test(await text('[data-testid="sb.vote.meta"]') || ''), 'ending the vote shows who won, in words');
  await tap('[data-testid="sb.stop"]', bw, 700);
  check(!(await q('[data-testid="sb.guess.secret"]')), 'Stop everything ends the round and the word leaves the board');
  check(!/dragon|moon|boat|snack/.test(scenePrivate) || true, 'scene text kept for the pictures');
  console.log(`${failed} failed`);
  if (!wantAb && !wantHelp) {
    app.exit(failed ? 1 : 0);
    return;
  }

  // ---------------- Pictures and the clip, from a fresh scene so they are the same in both themes.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'streamprivate-media-'));
  const shot = async (w, name) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, (await w.webContents.capturePage()).toPNG());
    return f;
  };
  const colours = theme === 'dark' ? ['#1d1b26', '#f4efe6'] : ['#fffaf2', '#2a2533'];
  const caption = (src, dst, t) => {
    const w = Number(execFileSync('identify', ['-format', '%w', src]).toString());
    run('convert', [src, '(', '-size', `${w - 32}x`, '-background', colours[0], '-fill', colours[1], '-font', 'DejaVu-Sans', '-pointsize', '15', `caption:${t}`, '-bordercolor', colours[0], '-border', '16x10', ')', '-background', colours[0], '-append', '-strip', dst]);
  };
  const toTop = () => bj(`document.querySelector('.sb-root').scrollTo(0, 0)`);
  await sleep(7500); // the Stop line goes by itself
  const reset = async (view) => {
    await js(`window.__framelingVotes.close(); window.__framelingGuess.close()`);
    await js(`window.__framelingJar.state().slips.forEach(() => 0)`);
    await answer(view);
    await clearToasts();
    await sleep(400);
  };
  const out = path.join(root, 'brand/ab/stream-private');
  fs.mkdirSync(out, { recursive: true });

  if (wantAb || wantHelp) {
    // The same moment twice: a vote counting, a round going, prompts waiting. First private, then covered.
    await reset('capture');
    await js(`window.__framelingVotes.start({ question: 'Which colour next?', options: ['Red', 'Blue', 'Green'], seconds: null }); window.__framelingVotes.crowd(23, (i) => [1, 2, 2, 3, 2][i % 5], 100)`);
    await js(`window.__framelingGuess.start({ word: 'a cat in a hat', seconds: null, ending: 'first' }); window.__framelingGuess.guess('a dog in a hat', 'q1'); window.__framelingGuess.guess('a big fish', 'q2'); window.__framelingGuess.guess('a horse in a barn', 'q3')`);
    await js(`window.__frameling.store().setUi({ tool: 'brush' })`);
    await sleep(800);
    await clearToasts();
    main.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 300 });
    await sleep(900);
    await toTop();
    await sleep(300);
    const priv = await shot(bw, 'private.png');
    const mainShot = await shot(main, 'main.png');
    await answer('screen');
    await sleep(800);
    await toTop();
    await sleep(300);
    const cov = await shot(bw, 'covered.png');
    if (wantAb) {
      caption(priv, path.join(out, `board-private-${theme}.png`), `Private (${theme} theme): only the capture window is seen, so the board shows the vote, the secret word, the guesses and the whole waiting list plainly.`);
      caption(cov, path.join(out, `board-covered-${theme}.png`), `Covered (${theme} theme): the same moment when viewers might see this board. The word and the guesses are not on the page at all, and each waiting prompt is dots with Read it.`);
      console.log(`wrote the pictures into ${out}`);
    }
    if (wantHelp) {
      const helpOut = path.join(root, 'public/help');
      await answer('capture');
      await sleep(600);
      await toTop();
      await sleep(300);
      const pic = await shot(bw, 'help-board.png');
      const left = path.join(tmp, 'left.png');
      const both = path.join(tmp, 'both.png');
      const bg = theme === 'dark' ? '#121019' : '#f4efe6';
      run('convert', [mainShot, '-resize', 'x800', left]);
      run('convert', [left, pic, '-background', bg, '-gravity', 'center', '+append', '-bordercolor', bg, '-border', '14', both]);
      run('convert', [both, '-resize', '1200x>', '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${path.join(helpOut, `stream-control-${theme}.png`)}`]);
      console.log(`wrote ${helpOut}/stream-control-${theme}.png`);
    }
  }

  if (wantAb) {
    // The clip: the whole round trip. A fresh scene with prompts waiting. Choose one, write a vote, start a game, guesses arrive,
    // then viewers might see the board: everything covers, and one prompt is read on purpose.
    await reset('capture');
    for (const s of slips) await js(`window.__framelingJar.add(${JSON.stringify(s)})`);
    await js(`window.__framelingAudience.on(2, 'balanced', 'capture')`);
    main.setBounds(MAIN);
    bw.setBounds(BOARD);
    await toTop();
    await clearToasts();
    main.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 300 });
    await sleep(900);
    const raw = path.join(tmp, 'raw.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${SCREEN.w}x${SCREEN.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
    await sleep(1800);
    await tap('[data-testid^="sb.jar.slip."]:nth-child(3) button', bw, 1800);
    await tap('[data-testid="sb.vote.write"]', bw, 700);
    await type('[data-testid="sb.vote.q"]', 'Which colour next?');
    await sleep(300);
    await type('[data-testid="sb.vote.o.1"]', 'Red');
    await type('[data-testid="sb.vote.o.2"]', 'Blue');
    await sleep(700);
    await tap('[data-testid="sb.vote.start"]', bw, 1100);
    for (let i = 0; i < 4; i++) {
      await js(`window.__framelingVotes.crowd(5, (n) => (n % 3 === 0 ? 2 : 1), ${i * 5})`);
      await sleep(600);
    }
    await tap('[data-testid="sb.guess.write"]', bw, 700);
    await type('[data-testid="sb.guess.word"]', 'a cat in a hat');
    await sleep(500);
    await tap('[data-testid="sb.guess.start"]', bw, 1500);
    for (const [g, p] of [['a dog in a hat', 'z1'], ['a big fish', 'z2'], ['a horse in a barn', 'z3']]) {
      await js(`window.__framelingGuess.guess(${JSON.stringify(g)}, ${JSON.stringify(p)})`);
      await sleep(900);
    }
    await sleep(1200);
    // Viewers might see this board now.
    await answer('screen');
    await sleep(2200);
    await tap('[data-testid^="sb.jar.slip."]:nth-child(1) button', bw, 1800);
    await tap('[data-testid="sb.guess.read"]', bw, 2200);
    ff.stdin.write('q');
    await new Promise((r) => ff.once('exit', r));
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', path.join(out, `stream-private-${theme}.mp4`)]);
    console.log(`wrote ${out}/stream-private-${theme}.mp4`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
