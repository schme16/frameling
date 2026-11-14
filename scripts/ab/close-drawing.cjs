// Records Close drawing in the real built app (real main process, so the real native "Save changes?" question shows),
// as an H.264 clip of the whole virtual screen. Run inside xvfb, once per theme:
//   npm run build && xvfb-run -a -s "-screen 0 1280x800x24" npx electron scripts/ab/close-drawing.cjs <dark|light> <out.mp4>
// The native question is not part of the page, so a screen grab is the only way to see it. xdotool presses its button.
const electron = require('electron');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [theme = 'dark', out = path.join(os.tmpdir(), `close-drawing-${theme}.mp4`)] = process.argv.slice(2).filter((a) => !a.endsWith('close-drawing.cjs') && !a.startsWith('-'));
const SHOT = process.env.CLOSE_SHOTS; // a folder for debug screenshots
const W = 1280;
const H = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-close-'));
electron.app.setPath('userData', data);
require('../../dist/main/main.cjs');

const shot = (name) => {
  if (SHOT) execFileSync('import', ['-window', 'root', path.join(SHOT, `${name}.png`)]);
};

electron.app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) {
    await sleep(100);
    win = electron.BrowserWindow.getAllWindows()[0];
  }
  const js = (code) => win.webContents.executeJavaScript(code);
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, showTips: false };
  await js(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true`);
  win.setBounds({ x: 0, y: 0, width: W, height: H });
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(2500);
  win.setBounds({ x: 0, y: 0, width: W, height: H });
  await sleep(500);

  const center = (sel, text) =>
    js(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = ${text ? `els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : 'els[0]'}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height }; })()`);
  const mouse = (type, x, y, extra = {}) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const click = async (p) => {
    mouse('mouseMove', p.x, p.y);
    await sleep(120);
    mouse('mouseDown', p.x, p.y);
    await sleep(60);
    mouse('mouseUp', p.x, p.y);
  };
  const clickAt = async (sel, text) => {
    const p = await center(sel, text);
    if (!p) throw new Error(`nothing to click: ${sel} ${text ?? ''}`);
    await click(p);
  };

  // Start recording the whole virtual screen.
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-framerate', '15', '-video_size', `${W}x${H}`, '-i', process.env.DISPLAY, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  await sleep(1200);

  // Draw a few strokes on the canvas, so there is unsaved work.
  const c = await center('main.ui-canvas canvas');
  const x0 = c.x - 160;
  const y0 = c.y - 40;
  for (let s = 0; s < 3; s++) {
    mouse('mouseMove', x0, y0 + s * 50);
    await sleep(60);
    mouse('mouseDown', x0, y0 + s * 50);
    for (let i = 1; i <= 24; i++) {
      mouse('mouseMove', x0 + i * 14, y0 + s * 50 + Math.round(Math.sin(i / 3) * 22), { modifiers: ['leftButtonDown'] });
      await sleep(25);
    }
    mouse('mouseUp', x0 + 24 * 14, y0 + s * 50);
    await sleep(150);
  }
  await sleep(900);
  shot('1-drawn');

  // File menu, then Close drawing.
  await clickAt('.ui-menu-top', 'File');
  await sleep(1300);
  shot('2-menu');
  const item = await center('.ui-menu-item', 'Close drawing');
  mouse('mouseMove', item.x, item.y);
  await sleep(1100);
  await click(item);

  // The real question appears. Give it a moment, then press Don't save with the mouse.
  let dialog = null;
  for (let i = 0; i < 40 && !dialog; i++) {
    await sleep(150);
    try {
      const ids = execFileSync('xdotool', ['search', '--onlyvisible', '--class', '.'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const id of ids) {
        const g = execFileSync('xdotool', ['getwindowgeometry', '--shell', id], { encoding: 'utf8' });
        const v = Object.fromEntries(g.trim().split('\n').map((l) => l.split('=')));
        if (Number(v.WIDTH) < W - 100 && Number(v.WIDTH) > 150) dialog = { id, x: +v.X, y: +v.Y, w: +v.WIDTH, h: +v.HEIGHT };
      }
    } catch {
      // not there yet
    }
  }
  if (!dialog) {
    try {
      console.log(execFileSync('xdotool', ['search', '--onlyvisible', '--class', '.'], { encoding: 'utf8' }));
    } catch (e) {
      console.log('search failed', String(e.message));
    }
  }
  await sleep(1800);
  shot('3-question');
  if (!dialog) {
    ff.kill();
    console.log('the question never showed');
    electron.app.exit(1);
    return;
  }
  console.log('dialog', JSON.stringify(dialog));
  // No window manager here, so put the question in the middle of the window ourselves.
  dialog.x = Math.round((W - dialog.w) / 2);
  dialog.y = Math.round(H / 2 - dialog.h / 2 - 60);
  execFileSync('xdotool', ['windowmove', dialog.id, String(dialog.x), String(dialog.y)]);
  await sleep(1500);
  const bx = Number(process.env.DONT_SAVE_X ?? 0.5);
  const by = Number(process.env.DONT_SAVE_Y ?? 0.88);
  execFileSync('xdotool', ['mousemove', String(Math.round(dialog.x + dialog.w * bx)), String(Math.round(dialog.y + dialog.h * by))]);
  await sleep(900);
  shot('4-hover');
  execFileSync('xdotool', ['click', '1']);
  await sleep(3200);
  shot('5-start');
  await sleep(1500);

  ff.stdin.write('q');
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
  electron.app.exit(0);
});
