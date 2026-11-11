// Start-up time: from launching the process to the first interactive frame (the `frameling:interactive` mark set in
// src/renderer/App.tsx: two frames after the app mounted, so the canvas has drawn and the page is free for input).
//
//   node scripts/perf/startup.cjs                 desktop app (dist/main + dist/renderer), 7 launches
//   node scripts/perf/startup.cjs --web           web build (dist/web) served from a sub-path, plus an offline reload
//   node scripts/perf/startup.cjs --runs 11 --out scripts/perf/results/startup.json
//
// Each launch is a fresh Electron process. The first launch uses a brand new profile (first run: no code cache, Quill's
// hello); the rest reuse it, like someone opening the app again. Windows are parked off-screen (launch.cjs).
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
const web = args.includes('--web');
const runs = Number(opt('runs', 7));
const cpu = Number(opt('cpu', 4));
const outFile = opt('out', null);
const root = path.join(__dirname, '../..');
const electronBin = require(path.join(root, 'node_modules/electron'));
const SUB = '/some/sub/path/frameling/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny static server for dist/web under a sub-path, so relative chunk paths are really exercised.
function serve(dir) {
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  const log = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    log.push(u.pathname);
    if (!u.pathname.startsWith(SUB)) {
      res.writeHead(404).end();
      return;
    }
    let f = path.join(dir, decodeURIComponent(u.pathname.slice(SUB.length)));
    if (f.endsWith(path.sep) || f === dir) f = path.join(f, 'index.html');
    fs.readFile(f, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, log })));
}

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-startup-'));
  let port = 9400 + Math.floor(Math.random() * 400);
  let srv = null;
  let url = null;
  if (web) {
    srv = await serve(path.join(root, 'dist/web'));
    url = `http://127.0.0.1:${srv.port}${SUB}`;
  }
  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      const { r, c, child } = await launch(web ? 'url' : 'app', profile, url, port++);
      results.push(r);
      console.log(`${i === 0 ? 'first' : 'again'}  from launch ${r.fromSpawnMs} ms  page ${r.pageMs} ms  page at ${cpu}x slower CPU ${r.throttledPageMs ?? '-'} ms`);
      // Let the first run settle (service worker install, code cache written) before the next launch.
      if (i === 0) await sleep(web ? 3000 : 1500);
      c.close();
      await stop(child);
    }
    let lazyCheck = null;
    if (!web) {
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
    let offline = null;
    if (web) {
      // Offline: the service worker installed on the first run, so stop the server and open the app again, then open
      // a few lazily loaded parts and check none of them failed.
      await new Promise((r) => srv.server.close(r));
      srv.server.closeAllConnections?.();
      const { r, c, child } = await launch('url', profile, url + '?debug', port++);
      const lazy = await c.evaluate(`(async () => {
        const f = window.__frameling;
        const errors = [];
        window.addEventListener('error', (e) => errors.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
        const before = performance.getEntriesByType('resource').length;
        for (const id of ['file.export', 'view.preferences', 'view.themes', 'help.contents']) { try { await f.run(id); } catch (e) { errors.push(id + ': ' + e); } await new Promise((r) => setTimeout(r, 400)); }
        return { errors, loaded: performance.getEntriesByType('resource').slice(before).map((x) => x.name.split('/').pop()).filter((n) => n.endsWith('.js')) };
      })()`);
      offline = { pageMs: r.pageMs, lazy };
      console.log(`offline  page ${r.pageMs} ms, lazy chunks loaded offline: ${lazy.loaded.join(', ') || 'none'}; errors: ${lazy.errors.join('; ') || 'none'}`);
      c.close();
      await stop(child);
    }
    const again = results.slice(1);
    const summary = {
      label: opt('label', web ? 'web' : 'desktop'),
      mode: web ? 'web' : 'desktop',
      cpu: os.cpus()[0]?.model,
      firstLaunchMs: results[0].fromSpawnMs,
      medianFromLaunchMs: median(again.map((r) => r.fromSpawnMs)),
      medianPageMs: median(again.map((r) => r.pageMs)),
      cpuSlowdown: cpu,
      medianThrottledPageMs: median(again.map((r) => r.throttledPageMs ?? 0)),
      initialJs: initialJs(web ? 'dist/web' : 'dist/renderer'),
      offline,
      lazyCheck,
      runs: results,
    };
    console.log(`\nmedian of ${again.length} repeat launches: ${summary.medianFromLaunchMs} ms from launch, ${summary.medianPageMs} ms in the page (${summary.medianThrottledPageMs} ms at ${cpu}x slower CPU); first launch ${summary.firstLaunchMs} ms`);
    console.log(`initial JS: ${summary.initialJs.kB} kB (${summary.initialJs.gzipKB} kB gzip) in ${summary.initialJs.files.length} files`);
    if (outFile) fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  } finally {
    srv?.server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
