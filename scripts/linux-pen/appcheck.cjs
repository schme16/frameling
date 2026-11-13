// Runs Frameling's real pen check with a pretend Huion (uinput, through /tmp/fifo), on whatever window system this is.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const APP = process.env.APP_DIR;
const OUT = process.env.OUT_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(OUT, 'userdata'));
fs.mkdirSync(OUT, { recursive: true });
process.env.FRAMELING_DEV_URL = 'file://' + APP + '/dist/renderer/index.html?debug=1';
process.env.FRAMELING_AUTOMATION_DIR = path.join(OUT, 'saved');
fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
const log = (...a) => { const l = a.join(' '); console.log(l); fs.appendFileSync(path.join(OUT, 'log.txt'), l + '\n'); };
const fifo = fs.openSync('/tmp/fifo', 'w');
// Send tablet commands; wait as long as the tablet script will take to run them.
let lastMove = null;
async function tab(...cmds) {
  let wait = 0;
  for (const c of cmds) { if (c.startsWith('move ')) lastMove = c; if ((c === 'touch 1' || c.startsWith('s')) && lastMove && !c.startsWith('sleep')) fs.writeSync(fifo, lastMove + '\n'); fs.writeSync(fifo, c + '\n'); const m = /^sleep ([\d.]+)/.exec(c); if (m) wait += +m[1] * 1000; else wait += 4; }
  await sleep(wait + 60);
}
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
require(APP + '/dist/main/main.cjs');
app.whenReady().then(async () => {
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  const d = screen.getPrimaryDisplay().bounds;
  log('display', JSON.stringify(d), 'ozone', app.commandLine.getSwitchValue('ozone-platform'));
  if (process.env.WAYLAND_DISPLAY) { win.setFullScreen(true); await sleep(1500); } else win.setBounds({ x: 0, y: 0, width: d.width, height: d.height });
  log('bounds', JSON.stringify(win.getBounds()), 'content', JSON.stringify(win.getContentBounds()));
  for (let i = 0; i < 200; i++) { try { if (await ev('!!window.__frameling')) break; } catch {} await sleep(100); }
  await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false, onboarded: true })); localStorage.removeItem('frameling.penCheck.v1')`);
  await win.loadURL(process.env.FRAMELING_DEV_URL);
  await sleep(3000);
  log('session', JSON.stringify(await ev('window.frameling.session')));
  await ev(`__frameling.overlays.state.set((o) => ({ ...o, penCheck: 'run', prefs: null, palette: false }))`);
  await sleep(800);
  const padRect = async () => ev(`(() => { const r = document.querySelector('[data-testid=check-pad]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  const [pl, pt, pw, ph] = await padRect();
  const dev = (fx, fy) => [Math.round(((pl + pw * fx) / d.width) * 32767), Math.round(((pt + ph * fy) / d.height) * 20479)];
  const step = () => ev(`document.querySelector('.tb-check-steps li[data-state=now] span')?.textContent ?? ''`);
  const says = () => ev(`document.querySelector('[data-testid=quill-says]')?.textContent ?? ''`);
  const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
  const move = async (fx, fy) => { const [x, y] = dev(fx, fy); await tab(`move ${x} ${y}`, 'sleep 0.012'); };
  async function wiggle(n, f = (i) => 0.2 + (i % 20) * 0.03) { for (let i = 0; i < n; i++) await move(f(i), 0.3 + (i % 5) * 0.06); }
  const actions = {
    'Hover': async () => { await tab('prox pen'); await wiggle(14); },
    'Press': async () => { await wiggle(3); await tab('touch 1'); for (let i = 0; i <= 20; i++) { await tab(`p ${Math.round(100 + i * 380)}`); await move(0.2 + i * 0.02, 0.5); } await tab('p 0', 'touch 0'); },
    'Lean': async () => { for (const t of [-45, 45]) { await tab(`tilt ${t} ${t / 3 | 0}`); await wiggle(8); } await tab('tilt 0 0'); },
    'Twist': async () => { await wiggle(6); },
    'Eraser end': async () => { await tab('prox off', 'sleep 0.3', 'prox rubber'); await wiggle(5); await tab('touch 1', 'p 3000'); await wiggle(10); await tab('p 0', 'touch 0', 'prox off', 'sleep 0.3', 'prox pen'); },
    'Button nearest the tip': async () => { await tab('s1 1'); await tab('touch 1', 'p 2500'); await wiggle(8); await tab('p 0', 'touch 0', 's1 0'); },
    'Other button': async () => { await tab('s2 1'); await tab('touch 1', 'p 2500'); await wiggle(8); await tab('p 0', 'touch 0', 's2 0'); },
    'Fast scribble': async () => { await tab('touch 1', 'p 3000'); await wiggle(70, (i) => 0.2 + (i % 11) * 0.05); await tab('p 0', 'touch 0'); },
  };
  await ev(`window.__log = []; __frameling.overlays.state.subscribe?.(() => window.__log.push([Math.round(performance.now()), JSON.stringify(__frameling.overlays.state.get().penCheck)]))`).catch(() => {});
  await ev(`document.addEventListener('keydown', (e) => window.__log.push(['key', e.key]), true); document.addEventListener('pointerdown', (e) => window.__log.push(['pd', e.pointerType, e.button, e.buttons, Math.round(e.clientX), Math.round(e.clientY), e.target.className||e.target.tagName]), true); for (const t of ['pointerenter','pointerleave','pointerover','pointerout','pointerup','pointercancel']) document.addEventListener(t, (e) => window.__log.push([t, e.pointerType, e.pointerId, Math.round(e.clientX), Math.round(e.clientY)]), true); let n = 0; document.addEventListener('pointermove', (e) => { if (e.pointerType === 'pen' && n++ % 6 === 0 && window.__log.length < 80) window.__log.push(['mv', e.pointerId, e.buttons, Math.round(e.clientX), Math.round(e.clientY)]); }, true); window.addEventListener('blur', () => window.__log.push(['blur']))`);
  const trail = [];
  for (let guard = 0; guard < 40; guard++) {
    const s = await step();
    if (!s) break;
    if (s === 'Twist' || s === 'Express keys and ring') { trail.push(s + ': skipped'); await click('Skip this one'); await sleep(300); continue; }
    const start = Date.now();
    let done = false;
    await actions[s]();
    for (let i = 0; i < 40 && !done; i++) { await sleep(250); done = (await step()) !== s; if (!done && s === 'Eraser end' && Date.now() - start > 9000) { if (await click("My pen's eraser end doesn't show up here")) { trail.push(s + ': pressed "doesn\'t show up"'); done = true; break; } } if (!done && i === 8) await actions[s](); }
    if (!done) { trail.push(s + ': never ticked, skipped'); await click('Skip this one'); await sleep(300); } else if (!trail.some((t) => t.startsWith(s))) trail.push(s + ': ' + (await says()).slice(0, 70));
    log('step', s, done ? 'ok' : 'NOT ticked', '| quill:', (await says()).slice(0, 110));
  }
  await tab('prox off');
  log('events', JSON.stringify(await ev('window.__log')).slice(0, 3500));
  log('trail', JSON.stringify(trail));
  log('says', await says());
  const okSave = await click('Save the report');
  await sleep(1500);
  log('saved', okSave, JSON.stringify(fs.readdirSync(process.env.FRAMELING_AUTOMATION_DIR)));
  await win.webContents.capturePage().then((img) => fs.writeFileSync(path.join(OUT, 'end.png'), img.toPNG())).catch(() => {});
  app.quit();
});
