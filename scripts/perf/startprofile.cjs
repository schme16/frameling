// Start-up CPU profile: launches the built app, profiles a page reload up to the first interactive frame and prints
// where the time went, by source folder and by function, using the source map. Build with a map first:
//   npx vite build --sourcemap && node scripts/build-main.mjs
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/startprofile.cjs [--cpu 1] [--top 30]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SourceMapConsumer } = require('source-map-js');

const args = process.argv.slice(2);
const opt = (n, d) => (args.indexOf('--' + n) >= 0 ? args[args.indexOf('--' + n) + 1] : d);
const cpu = Number(opt('cpu', 1));
const top = Number(opt('top', 30));
const root = path.join(__dirname, '../..');
const electronBin = require(path.join(root, 'node_modules/electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reloadProfile() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sprof-'));
  const child = spawn(electronBin, [path.join(__dirname, 'launch.cjs'), 'app', `--remote-debugging-port=${port}`], { env: { ...process.env, STARTUP_USER_DATA: profileDir }, stdio: 'ignore' });
  const c = await connect(port);
  while (!(await c.ev(`performance.getEntriesByName('frameling:interactive').length`).catch(() => 0))) await sleep(20);
  await c.send('Page.enable');
  await c.send('Profiler.enable');
  await c.send('Profiler.setSamplingInterval', { interval: 50 });
  await c.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await c.send('Profiler.start');
  await c.send('Page.reload', { ignoreCache: false });
  await sleep(300);
  while (!(await c.ev(`performance.getEntriesByName('frameling:interactive').length`).catch(() => 0))) await sleep(20);
  await sleep(500);
  const { result } = await c.send('Profiler.stop');
  child.kill('SIGKILL');
  return result.profile;
}

async function connect(port) {
  let target;
  for (let i = 0; i < 1000 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
    if (!target) await sleep(20);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
  };
  const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  return { send, ev: async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value };
}

(async () => {
  // The first load of a fresh launch (the real start-up) is profiled by launch.cjs itself; --cpu reloads instead.
  let profile;
  if (cpu <= 1) {
    const file = path.join(os.tmpdir(), `frameling-start-${process.pid}.cpuprofile`);
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sprof-'));
    const child = spawn(electronBin, [path.join(__dirname, 'launch.cjs'), 'app'], { env: { ...process.env, STARTUP_USER_DATA: userData, STARTUP_PROFILE: file }, stdio: 'ignore' });
    await new Promise((r) => child.once('exit', r));
    profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    profile = await reloadProfile();
  }
  const dir = path.join(root, 'dist/renderer/assets');
  const maps = {};
  const consumer = (url) => {
    const f = url.split('/').pop();
    if (maps[f] === undefined) {
      const mp = path.join(dir, f + '.map');
      maps[f] = fs.existsSync(mp) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(mp, 'utf8'))) : null;
    }
    return maps[f];
  };
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  // Only the first --until ms of samples (the window sits idle after start-up).
  const until = Number(opt('until', 260)) * 1000;
  let clock = 0;
  profile.samples.forEach((s, i) => {
    clock += dt[i] || 0;
    if (clock <= until) self.set(s, (self.get(s) || 0) + (dt[i] || 0));
  });
  const byFn = new Map();
  const byFolder = new Map();
  const byFile = new Map();
  let total = 0;
  for (const [nid, us] of self) {
    const n = byId.get(nid);
    const cf = n.callFrame;
    let src = cf.url ? cf.url.split('/').pop() : '';
    let key = cf.functionName || '(anon)';
    let folder = cf.url ? src : cf.functionName;
    const m = cf.url && cf.lineNumber >= 0 && consumer(cf.url);
    if (m) {
      const o = m.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
      if (o.source) {
        const s = o.source.replace(/^(\.\.\/)+/, '');
        key = `${cf.functionName || '(anon)'} ${s}:${o.line}`;
        folder = s.startsWith('node_modules/') ? s.split('/').slice(0, 2).join('/') : s.split('/').slice(0, 2).join('/');
      }
    }
    total += us;
    // Line ticks (best on an unminified build, `vite build --minify false --sourcemap`) say which source file the time was spent in.
    if (m && n.positionTicks?.length) {
      const ticks = n.positionTicks.reduce((a, t) => a + t.ticks, 0);
      for (const t of n.positionTicks) {
        const o = m.originalPositionFor({ line: t.line, column: 0, bias: SourceMapConsumer.LEAST_UPPER_BOUND });
        const f = o.source ? o.source.replace(/^(\.\.\/)+/, '') : '(unmapped)';
        byFile.set(f, (byFile.get(f) || 0) + (us * t.ticks) / ticks);
      }
    }
    byFn.set(key, (byFn.get(key) || 0) + us);
    byFolder.set(folder, (byFolder.get(folder) || 0) + us);
  }
  const ms = (u) => (u / 1000).toFixed(1).padStart(7);
  console.log(`profile total ${(total / 1000).toFixed(0)} ms (includes idle and GC rows below)\n\nself time by source folder`);
  for (const [k, v] of [...byFolder].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(ms(v), k);
  console.log('\nself time by source file (line ticks)');
  for (const [k, v] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(ms(v), k);
  console.log('\nself time by function');
  for (const [k, v] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(ms(v), k);
  if (opt('out', null)) fs.writeFileSync(opt('out'), JSON.stringify(profile));
  process.exit(0);
})();
