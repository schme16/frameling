// Records a dummy run through Quill's pen check (Preferences > Diagnostics > Check my pen with Quill) with a made-up
// pen, as an H.264 clip: pen events come from Chromium's DevTools protocol (pointerType "pen", pressure, tilt, twist),
// a fake pen drawn over the page shows what the pen is doing, and a caption names each step. The Save dialog is the
// test stub (it saves into a temp folder), and the saved report is shown at the end.
//
//   npm run build
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/pen-check-demo.cjs <outDir> [--theme dark|light]
//
// Writes <outDir>/pen-check-<theme>.mp4, -poster.png and sample-report.json. Needs ffmpeg with drawtext.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('.cjs'));
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const theme = opt('theme', 'dark');
const outDir = path.resolve(argv[0] ?? path.join(process.env.TMPDIR || '/tmp', 'pen-check-demo'));
const work = path.join(outDir, `work-${theme}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'frames'), { recursive: true });

const W = 1280;
const H = 740; // page; the caption bar below makes it 1280 x 800
let win;
let linux = false;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const dbg = () => win.webContents.debugger;
const problems = [];
const must = (cond, msg) => {
  if (!cond) problems.push(msg);
  return !!cond;
};

// ---------------------------------------------------------------- the page and the fake pen

const OVERLAY = `(() => {
  if (window.__fakePen) return;
  const css = document.createElement('style');
  css.textContent = \`
    #fp { position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none; width: 0; height: 0; opacity: 0; transition: opacity .25s; }
    #fp .ring { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid #ff7a2f; box-sizing: border-box; transition: width .05s, height .05s, background .1s; }
    #fp .body { position: absolute; left: 0; top: 0; width: 16px; height: 130px; margin-left: -8px; margin-top: -130px; transform-origin: 50% 100%; border-radius: 8px 8px 3px 3px; background: linear-gradient(90deg, #4a4658, #8d88a4 45%, #4a4658); border: 2px solid #fff; box-sizing: border-box; box-shadow: 0 3px 10px rgba(0,0,0,.45); overflow: hidden; }
    #fp .body .cap { position: absolute; left: 0; right: 0; top: 0; height: 22px; background: #d9d4e8; border-bottom: 2px solid #fff; transition: background .1s; }
    #fp .body .btn { position: absolute; left: 2px; width: 8px; height: 14px; border-radius: 4px; background: #2b2838; border: 1px solid #fff; }
    #fp .body .btn.b1 { top: 44px; } #fp .body .btn.b2 { top: 66px; }
    #fp .body .btn.on { background: #ffd23f; box-shadow: 0 0 8px #ffd23f; }
    #fp .body .band { position: absolute; top: 96px; height: 7px; width: 6px; background: #fff; border-radius: 3px; left: 4px; }
    #fp .hud { position: absolute; left: 22px; top: 18px; padding: 5px 9px; border-radius: 8px; background: rgba(20,18,30,.88); color: #fff; font: 700 15px/1.35 'DejaVu Sans Mono', monospace; white-space: pre; border: 1px solid rgba(255,255,255,.35); }
    #fp.touch .ring { background: rgba(255,122,47,.55); }
    #fp.eraser .ring { border-color: #ff4fa0; background: rgba(255,79,160,.5); }
    #fp.eraser .body .cap { background: #ff4fa0; box-shadow: 0 0 10px #ff4fa0; }
    #fp.key .hud { background: #1e6f3a; }
  \`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'fp';
  el.innerHTML = '<div class="body"><div class="cap"></div><div class="btn b1"></div><div class="btn b2"></div><div class="band"></div></div><div class="ring"></div><div class="hud"></div>';
  document.body.appendChild(el);
  const ring = el.querySelector('.ring'), body = el.querySelector('.body'), hud = el.querySelector('.hud');
  const b1 = el.querySelector('.b1'), b2 = el.querySelector('.b2'), band = el.querySelector('.band');
  let keyTimer = 0;
  const on = (e) => {
    if (e.pointerType !== 'pen') return;
    const touching = (e.buttons & 1) !== 0 || e.type === 'pointerdown';
    const eraser = (e.buttons & 32) !== 0 || e.button === 5;
    const swap = !!window.__fakePenSwap; // Linux: bit 4 is the button nearest the tip
    const bt1 = (e.buttons & (swap ? 4 : 2)) !== 0, bt2 = (e.buttons & (swap ? 2 : 4)) !== 0;
    el.style.opacity = '1';
    el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    el.className = (touching && e.type !== 'pointerup' ? 'touch ' : '') + (eraser ? 'eraser ' : '');
    const down = touching && e.type !== 'pointerup';
    const size = down ? 14 + e.pressure * 30 : 22;
    ring.style.width = ring.style.height = size + 'px';
    const tx = e.tiltX || 0, ty = e.tiltY || 0;
    body.style.transform = 'rotate(' + tx + 'deg) scaleY(' + Math.max(0.45, Math.cos(ty * Math.PI / 180)) + ')';
    b1.classList.toggle('on', bt1); b2.classList.toggle('on', bt2);
    band.style.left = (4 + 3 * Math.sin((e.twist || 0) * Math.PI / 180)) + 'px';
    const lines = [(eraser ? 'ERASER END ' : '') + (down ? 'touching' : 'hovering'), 'pressure ' + String(Math.round(e.pressure * 100)).padStart(3) + '%', 'lean ' + Math.round(tx) + ' / ' + Math.round(ty) + ' deg', 'twist ' + Math.round(e.twist || 0) + ' deg'];
    if (bt1 || bt2) lines.push('button ' + (bt1 ? '1 (near tip)' : '') + (bt1 && bt2 ? ' + ' : '') + (bt2 ? '2' : '') + ' held');
    hud.textContent = lines.join('\\n');
  };
  for (const t of ['pointermove', 'pointerdown', 'pointerup', 'pointerover']) window.addEventListener(t, on, true);
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    hud.textContent = 'express key: ' + e.key;
    el.className = 'key';
    clearTimeout(keyTimer);
  }, true);
  window.__fakePen = { hide: () => (el.style.opacity = '0') };
})()`;

// ---------------------------------------------------------------- pen input

let cur = { x: 640, y: 400 };
const pen = (type, x, y, o = {}) => {
  cur = { x, y };
  return dbg().sendCommand('Input.dispatchMouseEvent', {
    type,
    x: Math.round(x),
    y: Math.round(y),
    button: o.buttons || type !== 'mouseMoved' ? 'left' : 'none',
    buttons: o.buttons ?? (type === 'mouseReleased' ? 0 : 1),
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'pen',
    force: o.force ?? 0,
    tiltX: o.tiltX ?? 0,
    tiltY: o.tiltY ?? 0,
    twist: o.twist ?? 0,
  });
};
const ease = (t) => t * t * (3 - 2 * t);

/** Glides the pen, hovering, to a point. */
async function glide(x, y, { ms = 600, tiltX = 0, tiltY = 0, twist = 0 } = {}) {
  const from = { ...cur };
  const n = Math.max(4, Math.round(ms / 30));
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    await pen('mouseMoved', from.x + (x - from.x) * t, from.y + (y - from.y) * t, { buttons: 0, tiltX, tiltY, twist });
    await sleep(ms / n);
  }
}

/** A real press on something in the page, by pen. */
async function tap(selector, text) {
  const r = await ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const e = els.find((x) => !${JSON.stringify(text ?? '')} || x.textContent.includes(${JSON.stringify(text ?? '')})); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  if (!must(r, `nothing found for ${selector} ${text ?? ''}`)) throw new Error('missing ' + selector);
  await glide(r[0], r[1], { ms: 900, tiltX: -12 });
  await sleep(350);
  await pen('mousePressed', r[0], r[1], { force: 0.5, tiltX: -12 });
  await sleep(120);
  await pen('mouseReleased', r[0], r[1], { force: 0, tiltX: -12 });
  await sleep(300);
}

/** One stroke by the real pen: sample(t) gives {x, y, force, tiltX, tiltY, twist}. */
async function stroke(sample, n, every = 25) {
  const s0 = sample(0);
  await glide(s0.x, s0.y, { ms: 500, tiltX: s0.tiltX ?? 0, tiltY: s0.tiltY ?? 0 });
  await sleep(150);
  await pen('mousePressed', s0.x, s0.y, { force: s0.force, tiltX: s0.tiltX, tiltY: s0.tiltY, twist: s0.twist });
  for (let i = 1; i <= n; i++) {
    const s = sample(i / n);
    await pen('mouseMoved', s.x, s.y, { buttons: 1, force: s.force, tiltX: s.tiltX, tiltY: s.tiltY, twist: s.twist });
    await sleep(every);
  }
  const e = sample(1);
  await pen('mouseReleased', e.x, e.y, { force: 0, tiltX: e.tiltX, tiltY: e.tiltY, twist: e.twist });
  await sleep(250);
}

/** A pen event the DevTools protocol cannot make (eraser end, barrel buttons): made in the page, as scripts/e2e/pen.cjs does. */
const synth = (type, x, y, buttons, button, id) =>
  ev(`document.querySelector('[data-testid="check-pad"]').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, pointerId: ${id}, pointerType: 'pen', isPrimary: true, clientX: ${x}, clientY: ${y}, pressure: ${type === 'pointerup' ? 0 : 0.55}, tiltX: 8, tiltY: 4, button: ${button}, buttons: ${buttons} }))`);
async function synthStroke(x0, y0, x1, y1, buttons, id, n = 36, every = 30) {
  cur = { x: x1, y: y1 };
  await synth('pointermove', x0 - 20, y0, 0, -1, id);
  await sleep(200);
  await synth('pointerdown', x0, y0, buttons, buttons & 32 ? 5 : 0, id);
  for (let i = 1; i <= n; i++) {
    await synth('pointermove', x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, buttons, -1, id);
    await sleep(every);
  }
  await synth('pointerup', x1, y1, 0, buttons & 32 ? 5 : 0, id);
  await sleep(250);
}

// ---------------------------------------------------------------- recording and captions

const frames = [];
let t0 = 0;
let recording = false;
let recDone = null;
const captions = [];
const marks = {};
const nowT = () => (Date.now() - t0) / 1000;
const cap = (text) => {
  captions.push({ t: nowT(), text });
  console.log(`[${nowT().toFixed(1)}s] ${text}`);
};
function startRec() {
  t0 = Date.now();
  recording = true;
  recDone = (async () => {
    let n = 0;
    while (recording) {
      const t = Date.now();
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(work, 'frames', `f${String(n).padStart(5, '0')}.jpg`), img.toJPEG(94));
      frames.push((t - t0) / 1000);
      n++;
      const spent = Date.now() - t;
      if (spent < 45) await sleep(45 - spent);
    }
  })();
}
async function stopRec() {
  recording = false;
  await recDone;
}

// ---------------------------------------------------------------- the run

async function startApp() {
  app.setPath('userData', path.join(work, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(work, 'saved');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  win.webContents.setBackgroundThrottling(false);
  if (process.env.SHOT_SHOW) win.show();
  win.setContentSize(W, H);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling')) break;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  // Fresh settings: no welcome sheet, the chosen look, and Quill's own offer out of the way (the run starts the check by hand).
  const prefs = { theme, look: 'cosy', showWelcome: false, showTips: false, onboarded: true };
  await ev(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.penCheck.v1', JSON.stringify({ done: false, declined: true })); true`);
  await win.loadURL(process.env.FRAMELING_DEV_URL);
  await sleep(2500);
  win.setContentSize(W, H);
  await sleep(300);
  await ev(OVERLAY);
  // The pen on Linux sends the button nearest the tip as bit 4 (the app reads it that way there), so the made-up pen does too.
  linux = await ev(`window.frameling?.platform === 'linux'`);
  await ev(`window.__fakePenSwap = ${linux}`);
}

const padRect = async () => ev(`(() => { const b = document.querySelector('[data-testid="check-pad"]').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()`);
const helpBtn = `[...document.querySelectorAll('.tb-check-buttons .tb-clear')].some((b) => b.textContent.includes("eraser end doesn't show up"))`;
const stepStates = () => ev(`[...document.querySelectorAll('.tb-check-steps li')].map((l) => l.dataset.state)`);

async function waitFor(js, what, ms = 8000, optional = false) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(js)) return true;
    await sleep(100);
  }
  if (!optional) must(false, 'timed out waiting for ' + what);
  return false;
}

/** Waits for step `i` (0 based) to tick off, then lets the tick be seen. */
async function ticked(i, what) {
  await waitFor(`document.querySelectorAll('.tb-check-steps li')[${i}]?.dataset.state === 'done'`, `${what} to tick off`, 5000);
  await sleep(1400);
}

async function run() {
  const pad = { l: 0, t: 0, w: 0, h: 0 };
  cap('A dummy run through Quill\'s pen check. The pen here is made up, the fake pen shows what it is doing.');
  await glide(640, 380, { ms: 900 });
  await sleep(2200);

  cap('Open Preferences, then Diagnostics, then Check my pen with Quill');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['control'] });
  await waitFor(`!!document.querySelector('.ui-prefs')`, 'Preferences');
  await sleep(900);
  await tap('.ui-prefs-tab', 'Diagnostics');
  await sleep(1300);
  await tap('.tb-clear', 'Check my pen');
  await waitFor(`!!document.querySelector('.tb-check-pad')`, 'the pen check');
  await sleep(2000);
  Object.assign(pad, await padRect());
  const px = (f) => pad.l + pad.w * f;
  const py = (f) => pad.t + pad.h * f;

  // 1 hover
  cap('Step 1 of 9, Hover: the pen floats just above the pad without touching');
  await glide(px(0.1), py(0.5), { ms: 700 });
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      await pen('mouseMoved', px(0.1 + 0.8 * t), py(0.5 + 0.28 * Math.sin((t * 2 + k) * Math.PI)), { buttons: 0 });
      await sleep(30);
    }
    if (k === 0) await sleep(100);
    if ((await stepStates())[0] === 'done') break;
  }
  await ticked(0, 'hover');

  // 2 pressure
  cap('Step 2 of 9, Press: one line from very light to very hard (pressure)');
  await stroke((t) => ({ x: px(0.08 + 0.84 * t), y: py(0.5 + 0.12 * Math.sin(t * 5)), force: 0.04 + 0.96 * t * t * t, tiltX: 0, tiltY: 0, twist: 0 }), 75, 30);
  await ticked(1, 'pressure');

  // 3 tilt
  cap('Step 3 of 9, Lean: a squiggle tipped to the left, then one tipped to the right (tilt)');
  await stroke((t) => ({ x: px(0.1 + 0.36 * t), y: py(0.3 + 0.1 * Math.sin(t * 14)), force: 0.55, tiltX: -52 * Math.min(1, t * 6), tiltY: 18, twist: 0 }), 36, 40);
  await stroke((t) => ({ x: px(0.54 + 0.36 * t), y: py(0.3 + 0.1 * Math.sin(t * 14)), force: 0.55, tiltX: 52 * Math.min(1, t * 6), tiltY: 18, twist: 0 }), 36, 40);
  await ticked(2, 'lean');

  // 4 twist
  cap('Step 4 of 9, Twist: spin the pen in your fingers while it touches (barrel rotation)');
  await stroke((t) => ({ x: px(0.1 + 0.8 * t), y: py(0.72 + 0.08 * Math.sin(t * 9)), force: 0.6, tiltX: 22, tiltY: 0, twist: Math.round(220 * t * t * t) }), 70, 35);
  await ticked(3, 'twist');

  // 5 eraser
  cap('Step 5 of 9, Eraser end: flip the pen over and drag it. (A pen that has no eraser end can skip)');
  await glide(px(0.06), py(0.5), { ms: 500 });
  // A tip-only pen, or one whose eraser end is not told apart on X11: after about six seconds Quill offers a way out.
  // Shown as a short aside, only when this session offers it (the check decides, not this script).
  for (let k = 0; k < 3 && !(await ev(helpBtn)); k++) {
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      await pen('mouseMoved', px(0.1 + 0.8 * t), py(0.5 + 0.2 * Math.sin(t * 6 + k)), { buttons: 0 });
      await sleep(30);
    }
  }
  if (await waitFor(helpBtn, 'the eraser aside', 3000, true)) {
    cap('On X11 a flipped pen can look like a normal one, so after a few seconds Quill offers this button');
    await sleep(3200);
    cap('Here the eraser end does show up, so we flip the pen and drag it');
    await sleep(900);
  }
  await synthStroke(px(0.07), py(0.55), px(0.93), py(0.5), 33, 41, 44, 32);
  await ticked(4, 'eraser');

  // 6 barrel 1
  cap('Step 6 of 9, Button nearest the tip: held down while drawing a little line');
  await synthStroke(px(0.15), py(0.25), px(0.4), py(0.35), linux ? 5 : 3, 42, 26, 35);
  await ticked(5, 'barrel 1');

  // 7 barrel 2
  cap('Step 7 of 9, The other button: held down while drawing a little line');
  await synthStroke(px(0.55), py(0.35), px(0.8), py(0.25), linux ? 3 : 5, 43, 26, 35);
  await ticked(6, 'barrel 2');

  // 8 scribble
  cap('Step 8 of 9, Fast scribble: how many pen dots a second arrive (sample rate)');
  await stroke((t) => ({ x: px(0.08 + 0.84 * t), y: py(0.5 + 0.38 * Math.sin(t * 62)), force: 0.7, tiltX: 8, tiltY: 6, twist: 0 }), 150, 9);
  await ticked(7, 'scribble');

  // 9 keys
  cap('Step 9 of 9, Express keys: key presses stand in for the tablet\'s buttons (or skip this one)');
  await glide(px(0.5), py(0.5), { ms: 500 });
  await sleep(700);
  for (const k of ['F13', 'F14']) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k });
    await sleep(900);
  }
  await ticked(8, 'express keys');

  // save
  cap('All nine done. Save the report. (The Save dialog is stubbed here: it saves into a temp folder)');
  await waitFor(`[...document.querySelectorAll('.tb-clear')].some((b) => b.textContent.includes('Save the report'))`, 'the Save button');
  await sleep(1500);
  await tap('.tb-clear', 'Save the report');
  await waitFor(`document.querySelector('[data-testid="quill-says"]')?.textContent.includes('Here ya go')`, 'Quill\'s closing line', 6000);
  marks.poster = nowT() + 1.6;
  cap('Saved. Quill\'s closing line');
  await sleep(5500);
  await tap('.tb-clear', 'Done');
  await sleep(900);

  // the saved report
  const files = fs.readdirSync(process.env.FRAMELING_AUTOMATION_DIR).filter((f) => f.endsWith('.json'));
  must(files.length === 1, `expected one saved report, found ${files.length}`);
  const reportText = fs.readFileSync(path.join(process.env.FRAMELING_AUTOMATION_DIR, files[0]), 'utf8');
  fs.writeFileSync(path.join(outDir, 'sample-report.json'), reportText);
  const shown = JSON.stringify(
    JSON.parse(reportText),
    (_k, v) => (Array.isArray(v) && v.length > 10 ? `[${v.length} entries, left out of this view]` : v),
    2,
  );
  cap(`The saved report (${files[0]}), a plain JSON file`);
  await ev(`(() => {
    window.__fakePen.hide();
    const d = document.createElement('div');
    d.id = 'rep';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:${theme === 'dark' ? '#14121c' : '#fbfaff'};color:${theme === 'dark' ? '#e8e4f5' : '#25222f'};display:flex;flex-direction:column;font:14px/1.4 "DejaVu Sans Mono",monospace;';
    const h = document.createElement('div');
    h.style.cssText = 'padding:14px 22px;font-weight:700;border-bottom:1px solid #8884';
    h.textContent = ${JSON.stringify(files[0] + '   (nothing here is sent anywhere, it is a file you choose to share)')};
    const p = document.createElement('pre');
    p.id = 'repbody';
    p.style.cssText = 'margin:0;padding:14px 22px;overflow:hidden;flex:1;white-space:pre-wrap;word-break:break-all;';
    p.textContent = ${JSON.stringify(shown)};
    d.append(h, p);
    document.body.appendChild(d);
    const dur = 11000, t0 = performance.now();
    const tick = (n) => { const k = Math.min(1, (n - t0 - 1500) / dur); p.scrollTop = Math.max(0, k) * (p.scrollHeight - p.clientHeight); if (n - t0 < dur + 3500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  await sleep(11000 + 3500);
}

// ---------------------------------------------------------------- encoding

function encode(total) {
  const list = frames.map((t, i) => `file 'frames/f${String(i).padStart(5, '0')}.jpg'\nduration ${((frames[i + 1] ?? total) - t).toFixed(4)}`);
  list.push(`file 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n') + '\n');
  const dark = theme === 'dark';
  const bar = dark ? '0x16141f' : '0xf3f1fa';
  const fg = dark ? 'white' : '0x25222f';
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const draws = captions.map((c, i) => {
    const end = captions[i + 1]?.t ?? total;
    fs.writeFileSync(path.join(work, `cap${i}.txt`), c.text);
    return `drawtext=fontfile=${font}:textfile=cap${i}.txt:fontcolor=${fg}:fontsize=22:x=(w-text_w)/2:y=${H}+30-text_h/2:enable='between(t,${c.t.toFixed(2)},${end.toFixed(2)})'`;
  });
  const filter = `fps=25,pad=${W}:${H + 60}:0:0:color=${bar},${draws.join(',')},format=yuv420p`;
  fs.writeFileSync(path.join(work, 'filter.txt'), filter);
  const mp4 = path.join(outDir, `pen-check-${theme}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-filter_script:v', path.join(work, 'filter.txt'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', '-an', mp4], { cwd: work, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  const poster = path.join(outDir, `pen-check-${theme}-poster.png`);
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(marks.poster ?? total / 2), '-i', mp4, '-frames:v', '1', poster], { stdio: 'inherit' });
  return mp4;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 6 * 60 * 1000);
  try {
    await startApp();
    dbg().attach('1.3');
    startRec();
    await run();
    const total = nowT() + 0.5;
    await stopRec();
    const mp4 = encode(total);
    console.log(`wrote ${mp4} (${total.toFixed(1)} s, ${(fs.statSync(mp4).size / 1024).toFixed(0)} kB)`);
  } catch (e) {
    problems.push(String(e?.stack ?? e));
    recording = false;
  }
  clearTimeout(guard);
  if (problems.length) console.log('PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(problems.length ? 1 : 0);
})();
