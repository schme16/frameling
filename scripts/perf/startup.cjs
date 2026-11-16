// Start-up time: from launching the process to the first interactive frame (the `frameling:interactive` mark set in
// src/renderer/App.tsx: two frames after the app mounted, so the canvas has drawn and the page is free for input).
//
//   node scripts/perf/startup.cjs                 desktop app (dist/main + dist/renderer), 7 launches
//   node scripts/perf/startup.cjs --runs 11 --out scripts/perf/results/startup.json
//
// Each launch is a fresh Electron process. The first launch uses a brand new profile (first run: no code cache, Quill's
// hello); the rest reuse it, like someone opening the app again. Windows are parked off-screen on a real desktop and kept on-screen under xvfb
// (launch.cjs, display.cjs); PERF_ONSCREEN=1 or 0 overrides.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const runs = Number(opt('runs', 7));
const cpu = Number(opt('cpu', 4));
const outFile = opt('out', null);
const root = path.join(__dirname, '../..');
const electronBin = require(path.join(root, 'node_modules/electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal Chrome DevTools Protocol client over the global WebSocket.
async function cdp(port, timeout = 20000) {
  const t0 = Date.now();
  let target;
  while (!target) {
    if (Date.now() - t0 > timeout) throw new Error('no page target');
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {}
    if (!target) await sleep(20);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  return { send, evaluate, close: () => ws.close() };
}

const READ = `(() => {
  const m = performance.getEntriesByName('frameling:interactive')[0];
  if (!m) return null;
  const res = performance.getEntriesByType('resource');
  const js = res.filter((r) => r.name.endsWith('.js'));
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    timeOrigin: performance.timeOrigin,
    interactive: m.startTime,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    jsFiles: js.map((r) => r.name.split('/').pop()),
    jsBytes: js.reduce((a, r) => a + (r.decodedBodySize || 0), 0),
  };
})()`;

async function launch(mode, profile, url, port) {
  const t0 = Date.now();
  const child = spawn(electronBin, [path.join(__dirname, 'launch.cjs'), mode, ...(url ? [url] : []), `--remote-debugging-port=${port}`], {
    env: { ...process.env, STARTUP_USER_DATA: profile, ELECTRON_ENABLE_LOGGING: '' },
    stdio: 'ignore',
  });
  try {
    const c = await cdp(port);
    let r = null;
    const tw = Date.now();
    while (!r) {
      if (Date.now() - tw > 20000) throw new Error('never interactive');
      r = await c.evaluate(READ).catch(() => null);
      if (!r) await sleep(10);
    }
    r.fromSpawnMs = Math.round(r.timeOrigin + r.interactive - t0);
    r.pageMs = Math.round(r.interactive);
    if (cpu > 1) {
      // The same page again with the CPU slowed down (Chromium's throttling), for a slower computer than this one.
      await c.send('Page.enable');
      await c.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await sleep(100);
      await c.send('Page.reload', { ignoreCache: false });
      let s = null;
      const ts = Date.now();
      while (!s || s.timeOrigin === r.timeOrigin) {
        if (Date.now() - ts > 30000) throw new Error('never interactive after reload');
        s = await c.evaluate(READ).catch(() => null);
        if (!s || s.timeOrigin === r.timeOrigin) await sleep(20);
      }
      r.throttledPageMs = Math.round(s.interactive);
      await c.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    return { r, c, child };
  } catch (e) {
    child.kill('SIGKILL');
    throw e;
  }
}

function stop(child) {
  return new Promise((r) => {
    child.once('exit', r);
    child.kill('SIGKILL');
  });
}

// The JS the page loads before it can start: the entry script and everything it preloads (read from index.html).
function initialJs(dir) {
  const zlib = require('node:zlib');
  const html = fs.readFileSync(path.join(root, dir, 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  let bytes = 0;
  let gz = 0;
  for (const f of files) {
    const b = fs.readFileSync(path.join(root, dir, f));
    bytes += b.length;
    gz += zlib.gzipSync(b).length;
  }
  return { files, kB: Math.round(bytes / 1024), gzipKB: Math.round(gz / 1024) };
}

const summaryInitial = () => initialJs('dist/renderer').files.map((f) => f.split('/').pop());

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  // Which engine this is, before anything is timed: the card, or a failure (scripts/lib/gpu.cjs).
  const mode = process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card';
  const pre = require('node:child_process').spawnSync(electronBin, [path.join(__dirname, '../lib/gpu-check.cjs'), mode], { encoding: 'utf8', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } });
  const line = (pre.stdout || '').split('\n').filter((l) => l.startsWith('[gpu]')).join('\n');
  console.log(line || '[gpu] no answer');
  if (pre.status !== 0) {
    console.error('Start-up was not measured: the engine is not the one asked for.');
    process.exit(1);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-startup-'));
  let port = 9400 + Math.floor(Math.random() * 400);
  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      const { r, c, child } = await launch('app', profile, null, port++);
      results.push(r);
      console.log(`${i === 0 ? 'first' : 'again'}  from launch ${r.fromSpawnMs} ms  page ${r.pageMs} ms  page at ${cpu}x slower CPU ${r.throttledPageMs ?? '-'} ms`);
      // Let the first run settle (code cache written) before the next launch.
      if (i === 0) await sleep(1500);
      c.close();
      await stop(child);
    }
    let lazyCheck = null;
    {
      // Every lazily loaded chunk, imported from file:// in the real app (sandboxed renderer, the app's own page).
      const chunks = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((f) => f.endsWith('.js') && !summaryInitial().includes(f));
      const { c, child } = await launch('app', profile, null, port++);
      lazyCheck = await c.evaluate(`(async () => {
        const bad = [];
        for (const f of ${JSON.stringify(chunks)}) { try { await import(new URL('./assets/' + f, location.href).href); } catch (e) { bad.push(f + ': ' + e); } }
        return { tried: ${chunks.length}, bad, protocol: location.protocol };
      })()`);
      console.log(`lazy chunks from ${lazyCheck.protocol} ${lazyCheck.tried - lazyCheck.bad.length}/${lazyCheck.tried} loaded${lazyCheck.bad.length ? ': ' + lazyCheck.bad.join('; ') : ''}`);
      c.close();
      await stop(child);
    }
    const again = results.slice(1);
    const summary = {
      label: opt('label', 'desktop'),
      mode: 'desktop',
      cpu: os.cpus()[0]?.model,
      firstLaunchMs: results[0].fromSpawnMs,
      medianFromLaunchMs: median(again.map((r) => r.fromSpawnMs)),
      medianPageMs: median(again.map((r) => r.pageMs)),
      cpuSlowdown: cpu,
      medianThrottledPageMs: median(again.map((r) => r.throttledPageMs ?? 0)),
      initialJs: initialJs('dist/renderer'),
      lazyCheck,
      runs: results,
    };
    console.log(`\nmedian of ${again.length} repeat launches: ${summary.medianFromLaunchMs} ms from launch, ${summary.medianPageMs} ms in the page (${summary.medianThrottledPageMs} ms at ${cpu}x slower CPU); first launch ${summary.firstLaunchMs} ms`);
    console.log(`initial JS: ${summary.initialJs.kB} kB (${summary.initialJs.gzipKB} kB gzip) in ${summary.initialJs.files.length} files`);
    if (outFile) fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
