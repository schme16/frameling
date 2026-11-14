// Checks what Frameling remembers between launches, in the real app, with a real profile on disk. Two phases, each its
// own launch of the same profile:
//
//   REMEMBER_PHASE=set   sets the brush, colours, looping, onion skin and a few tool options (and the playhead, zoom, tool)
//   REMEMBER_PHASE=check starts again on the same profile and reads each one back
//
//   npm run build
//   REMEMBER_PHASE=set   REMEMBER_DIR=/tmp/profile xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remember.cjs
//   REMEMBER_PHASE=check REMEMBER_DIR=/tmp/profile xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remember.cjs
//
// REMEMBER_ROOT points at another checkout's built app (to compare with the build before a change). The check phase
// prints one line per setting, `kept` or `forgotten`, and writes them to REMEMBER_DIR/result.json. The tool options are
// set through the real option panels (click the value, type a number, Enter) and read back from the panel's own label.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(process.env.REMEMBER_ROOT || path.join(__dirname, '../..'));
const phase = process.env.REMEMBER_PHASE;
const dir = path.resolve(process.env.REMEMBER_DIR || '/tmp/frameling-remember');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const key = async (k, mods = []) => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods });
  if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k, modifiers: mods });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods });
  await sleep(80);
};

async function start() {
  app.setPath('userData', path.join(dir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(dir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  win.setSize(1600, 1000);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling')) break;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  await sleep(1200);
}

/** Opens the brush's "More brush options" if it is shut (it is remembered open or shut, so it may already be open). */
const OPEN_FOLD = `(() => { const b = document.querySelector('.cv-more-btn'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`;
const tool = (id) => ev(`__frameling.run('tools.${id}')`).then(() => sleep(400));

/** Clicks a slider's value, types a number and presses Enter, the way a person does. */
async function type(label, n) {
  const ok = await ev(`(() => { const b = [...document.querySelectorAll('button.cv-slider-value')].find((x) => (x.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label + ':')})); if (!b) return false; b.click(); return true; })()`);
  if (!ok) return false;
  await sleep(200);
  await ev(`(() => { const i = document.querySelector('input.cv-slider-type'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(String(n))}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); })()`);
  await key('Return');
  await sleep(300);
  return true;
}

/** What a slider says it is set to, from its own label ("Size: 40px. Type a value"). */
const read = (label) =>
  ev(`(() => { const b = [...document.querySelectorAll('button.cv-slider-value')].find((x) => (x.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label + ':')})); return b ? b.getAttribute('aria-label').split('.')[0].slice(${label.length + 2}) : null; })()`);

const UI = `(() => { const u = __frameling.store().get().ui; return JSON.stringify({ color: u.color, fillColor: u.fillColor, strokeOn: u.strokeOn, brushSize: u.brush.size, brushTaperEnd: u.brush.taperEnd, loopPlayback: u.loopPlayback, onion: u.onion, frame: u.frame, zoom: u.zoom, tool: u.tool }); })()`;

(async () => {
  await start();
  if (phase === 'set') {
    await ev(`__frameling.template('bouncing-ball')`);
    await sleep(600);
    // The vector brush: size by typing, pointy end by typing (in the folded part).
    await tool('brush');
    await type('Size', 33);
    await ev(OPEN_FOLD);
    await sleep(300);
    await type('Pointy end', 17);
    // The two colours, looping and the onion skin, through the same store calls the panels make.
    await ev(`__frameling.store().setUi({ color: '#123456', fillColor: '#654321' })`);
    await ev(`__frameling.run('timeline.toggleLoop')`);
    await ev(`__frameling.store().setUi((u) => ({ onion: { ...u.onion, enabled: true, before: 5, after: 3, opacity: 0.6 } }))`);
    // Options of other tools, which were already remembered.
    await tool('eraser');
    await type('Size', 40);
    await tool('pencil');
    await type('Thickness', 5);
    await tool('star');
    await type('Points', 9);
    await tool('rect');
    await type('Outline thickness', 11);
    await ev(`__frameling.store().setUi({ strokeOn: false })`);
    // Mirror drawing (Shift+M), also already remembered.
    await tool('brush');
    await ev(`document.activeElement?.blur()`);
    await key('m', ['shift']);
    // Where you are: not meant to be remembered.
    await ev(`__frameling.store().setUi({ frame: 7, zoom: 2.5 })`);
    await tool('ellipse');
    await sleep(600);
    fs.writeFileSync(path.join(dir, 'set.json'), await ev(UI));
  } else {
    const ui = JSON.parse(await ev(UI));
    const out = {};
    await tool('brush');
    out['vector brush size (33)'] = (await read('Size')) === '33px';
    await ev(OPEN_FOLD);
    await sleep(300);
    out['vector brush pointy end (17)'] = (await read('Pointy end')) === '17px';
    out['stroke colour (#123456)'] = ui.color === '#123456';
    out['fill colour (#654321)'] = ui.fillColor === '#654321';
    out['stroke switched off'] = ui.strokeOn === false;
    out['loop playback off'] = ui.loopPlayback === false;
    out['onion skin on'] = ui.onion.enabled === true;
    out['onion frames before (5)'] = ui.onion.before === 5;
    out['onion frames after (3)'] = ui.onion.after === 3;
    out['onion strength (0.6)'] = ui.onion.opacity === 0.6;
    await tool('eraser');
    out['eraser size (40), already remembered'] = (await read('Size')) === '40px';
    await tool('pencil');
    out['pencil thickness (5), already remembered'] = (await read('Thickness')) === '5px';
    await tool('star');
    out['star points (9), already remembered'] = (await read('Points')) === '9';
    // The outline slider only shows with the stroke on, so turn it on to read it.
    await ev(`__frameling.store().setUi({ strokeOn: true })`);
    await tool('rect');
    out['shape outline (11), already remembered'] = (await read('Outline thickness')) === '11px';
    out['mirror drawing on, already remembered'] = await ev(`!!__frameling.commands && (() => { try { return JSON.parse(localStorage.getItem('frameling.pixelSettings') || '{}').symmetry === 'h'; } catch { return false; } })()`);
    const lines = Object.entries(out).map(([k, v]) => `${v ? 'kept     ' : 'forgotten'}  ${k}`);
    lines.push('', `not meant to be kept: playhead frame ${ui.frame} (was 7), zoom ${ui.zoom} (was 2.5), tool ${ui.tool} (was ellipse)`);
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ out, ui }, null, 2));
    fs.writeFileSync(path.join(dir, 'result.txt'), lines.join('\n') + '\n');
    console.log(lines.join('\n'));
  }
  // A normal quit, so the profile's storage is flushed to disk.
  await sleep(800);
  app.quit();
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
