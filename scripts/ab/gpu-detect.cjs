// A/B for the card Preferences > Performance names, from the REAL app, in both themes, inside xvfb.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/ab/gpu-detect.cjs <appDir> <outPrefix> [KEY=VALUE ...]
//
// <appDir> is a checkout with a build (dist/). The KEY=VALUE pairs are the environment the app starts with. It opens the
// Performance page, and saves <outPrefix>-dark.png and <outPrefix>-light.png cropped to the top of the page (the card and
// the way it draws). Nothing is pretended: the page shows what the engine and the window really said.
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [dir, outPrefix, ...pairs] = process.argv.slice(2);
const env = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tree(port) {
  const out = new Set();
  try {
    const rows = execSync('ps -eo pid=,ppid=,comm=,args=', { encoding: 'utf8', maxBuffer: 1e7 }).trim().split('\n').map((l) => { const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l); return m && { pid: m[1], ppid: m[2], comm: m[3], args: m[4] }; }).filter(Boolean);
    const walk = (p) => { if (out.has(p)) return; out.add(p); rows.filter((r) => r.ppid === p).forEach((r) => walk(r.pid)); };
    rows.filter((r) => /electron|frameling/.test(r.comm) && r.args.includes('--remote-debugging-port=' + port)).forEach((r) => walk(r.pid));
  } catch { /* nothing */ }
  return out;
}

(async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-abgpu-'));
  const child = spawn(path.join(dir, 'node_modules/electron/dist/electron'), [path.resolve(dir), `--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore', cwd: dir, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, 'config'), ...env } });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not yet */ } }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const waiting = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) waiting.get(m.id)(m); };
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;
    await sleep(2500);
    await send('Page.enable');
    await send('Page.navigate', { url: 'file://' + path.resolve(dir) + '/dist/renderer/index.html?debug=1' });
    await sleep(3500);
    await ev("window.__frameling.template('bouncing-ball')");
    await sleep(1500);
    await ev("window.__frameling.overlays.openPrefs('performance')");
    for (const theme of ['dark', 'light']) {
      await ev(`window.__frameling.prefs.set({ theme: ${JSON.stringify(theme)} }); true`);
      await sleep(1800);
      const rect = await ev(`(() => { const r = document.querySelector('.ui-prefs').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
      fs.writeFileSync(`${outPrefix}-${theme}.png`, Buffer.from(shot.result.data, 'base64'));
      console.log('saved', `${outPrefix}-${theme}.png`, Math.round(rect.width) + 'x' + Math.round(rect.height));
    }
    ws.close();
  } finally {
    for (const p of tree(port)) { try { process.kill(Number(p), 'SIGKILL'); } catch { /* gone */ } }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
})().catch((e) => { console.error(e); process.exit(1); });
