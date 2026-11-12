// The web build (dist/web) in a real Chromium: Electron's Chromium loads it over a local static server (127.0.0.1, which
// counts as a secure context, so the service worker, IndexedDB and OPFS all work), with no desktop bridge, so the page
// builds its own browser bridge exactly as it would on the web.
//
//   npm run build:web
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/web.cjs [--only=a,b] [--skip=a,b] [--shots=<dir>]
//
// The browser's file pickers can't be clicked from outside, so a small preload shim stands in for them:
//   - "picker" mode (Chrome and Edge): showOpenFilePicker, showSaveFilePicker and showDirectoryPicker hand out real
//     file handles from the browser's private file system (OPFS), so saving and reading back is the real code path.
//   - "plain" mode (Firefox and Safari): the pickers are removed, downloads are caught and saved to a folder, and the
//     upload picker (<input type=file>) is answered from a queue.
// Each flow is one named function below; --only runs just those. Exits non-zero when anything fails.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const WEB = path.join(root, 'dist/web');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const only = arg('only')?.split(',');
const skip = arg('skip')?.split(',') ?? [];
const shotsDir = arg('shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)?.slice(0, 300)})`}`);
  if (!ok) failures.push(name);
};

if (!fs.existsSync(path.join(WEB, 'index.html'))) {
  console.error('dist/web is missing: run npm run build:web first.');
  process.exit(2);
}

// ---------------------------------------------------------------- the static server (can be stopped, to go offline)

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.wasm': 'application/wasm', '.txt': 'text/plain',
};
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  p = p.replace(/^\/tools\/frameling(?=\/)/, ''); // the app also answers under a sub-folder, like a real host
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(WEB, p);
  if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    r.statusCode = 404;
    return r.end();
  }
  r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
});
let port = 0;
const listen = () => new Promise((res) => server.listen(port, '127.0.0.1', () => { port = server.address().port; res(); }));
const unlisten = () => new Promise((res) => { server.closeAllConnections?.(); server.close(() => res()); });

// ---------------------------------------------------------------- the preload shim (in the page's own world)

const SHIM = `
(() => {
  const mode = new URLSearchParams(location.search).get('shim') || 'picker';
  const S = (window.__shim = { mode, downloads: [], uploads: [], opens: [], cancelNext: false, picks: [], errors: [] });
  window.addEventListener('error', (e) => S.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => S.errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  S.b64 = b64;
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  S.unb64 = unb64;
  // The browser's own confirm and alert would block the run: answer them and keep a note.
  S.confirms = []; S.confirmAnswer = true;
  window.confirm = (m) => { S.confirms.push(String(m)); return S.confirmAnswer; };
  window.alert = (m) => { S.confirms.push('alert: ' + String(m)); };
  const abort = () => new DOMException('The user aborted a request.', 'AbortError');
  // Downloads and the upload picker work the same in both modes (workspace files and so on use them everywhere).
  {
    // Downloads: the page makes an <a download> with a blob URL. Read the blob here so the test sees the bytes.
    // (fetch of a blob: URL is blocked by the page's Content Security Policy, so the blobs are remembered as made.)
    const blobs = new Map();
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { const u = make(b); blobs.set(u, b); return u; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        const name = this.download;
        blobs.get(this.href).arrayBuffer().then((ab) => S.downloads.push({ name, b64: b64(new Uint8Array(ab)) }));
        return;
      }
      return click.call(this);
    };
    // The upload picker: answered from S.uploads ({name, b64, type}); empty queue means "cancelled".
    const iclick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type !== 'file') return iclick.call(this);
      const next = S.uploads.shift();
      S.opens.push({ accept: this.accept, multiple: this.multiple, got: next ? next.name : null });
      setTimeout(() => {
        if (!next) return this.dispatchEvent(new Event('cancel'));
        const list = Array.isArray(next) ? next : [next];
        const dt = new DataTransfer();
        for (const n of list) dt.items.add(new File([unb64(n.b64)], n.name, { type: n.type || '' }));
        Object.defineProperty(this, 'files', { value: dt.files, configurable: true });
        this.dispatchEvent(new Event('change'));
      }, 10);
    };
  }
  // Safari stand-ins, for checking the web build's Safari paths in Chromium: ?ua=safari looks like Safari (late downloads
  // are held back for a Save button), ?gesture=1 has GestureEvent (pinch), ?persist=grant|deny answers storage.persist().
  const q = new URLSearchParams(location.search);
  S.persistCalls = 0;
  if (q.get('ua') === 'safari') Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' });
  if (q.get('gesture')) window.GestureEvent = function GestureEvent() {};
  if (q.get('persist')) {
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => { S.persistCalls++; return q.get('persist') === 'grant'; };
  }
  if (mode === 'plain') {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker; delete window.showDirectoryPicker;
  } else {
    // OPFS stands in for the user's disk: real handles that structured-clone into IndexedDB like the real thing.
    const dirFor = async (sub) => { let d = await navigator.storage.getDirectory(); for (const p of sub) d = await d.getDirectoryHandle(p, { create: true }); return d; };
    S.stage = async (name, bytes) => { const d = await dirFor(['in']); const h = await d.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(bytes); await w.close(); S.opens.push({ staged: name }); };
    S.read = async (sub, name) => { const d = await dirFor(sub); const h = await d.getFileHandle(name); return new Uint8Array(await (await h.getFile()).arrayBuffer()); };
    S.list = async (sub) => { const d = await dirFor(sub); const out = []; for await (const [n, h] of d.entries()) out.push(n + (h.kind === 'directory' ? '/' : '')); return out; };
    // Everything written under out/ so far (files and folders), then the folder emptied.
    S.collect = async () => {
      const out = [];
      const walk = async (d, prefix) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await walk(h, prefix + n + '/'); else out.push({ name: prefix + n, b64: b64(new Uint8Array(await (await h.getFile()).arrayBuffer())) }); } };
      const root = await navigator.storage.getDirectory();
      let o; try { o = await root.getDirectoryHandle('out'); } catch { return out; }
      await walk(o, '');
      await root.removeEntry('out', { recursive: true });
      return out;
    };
    S.queue = []; // names to hand to the next Open picker
    window.showOpenFilePicker = async (opts) => {
      S.picks.push({ kind: 'open', types: opts && opts.types });
      if (S.cancelNext) { S.cancelNext = false; throw abort(); }
      const names = S.queue.splice(0);
      if (!names.length) throw abort();
      const d = await dirFor(['in']);
      return Promise.all(names.map((n) => d.getFileHandle(n)));
    };
    window.showSaveFilePicker = async (opts) => {
      S.picks.push({ kind: 'save', name: opts && opts.suggestedName, types: opts && opts.types });
      if (S.cancelNext) { S.cancelNext = false; throw abort(); }
      const d = await dirFor(['out']);
      return d.getFileHandle((opts && opts.suggestedName) || 'untitled', { create: true });
    };
    window.showDirectoryPicker = async (opts) => {
      S.picks.push({ kind: 'dir' });
      if (S.cancelNext) { S.cancelNext = false; throw abort(); }
      S.dirN = (S.dirN || 0) + 1;
      return dirFor(['out', 'dir' + S.dirN]);
    };
  }
})();
`;

// ---------------------------------------------------------------- one window

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-web-'));
const shimFile = path.join(tmp, 'shim.cjs');
fs.writeFileSync(shimFile, SHIM);
const errors = [];

function makeWindow(partition) {
  const win = new BrowserWindow({
    show: true, width: 1400, height: 900,
    webPreferences: { preload: shimFile, contextIsolation: false, nodeIntegration: false, partition, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) {
      const m = String(e.message ?? e);
      if (!/Failed to load resource|example\.com/.test(m)) errors.push(m);
    }
  });
  const wc = win.webContents;
  // Leaving with unsaved work asks "Leave site?" in a browser; the test says yes (the page puts the work aside first).
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  const js = (code) => wc.executeJavaScript(code);
  const input = {
    click: async (x, y, o = {}) => {
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: o.button ?? 'left', clickCount: o.count ?? 1, modifiers: o.mods ?? [] });
      await sleep(30);
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: o.button ?? 'left', clickCount: o.count ?? 1, modifiers: o.mods ?? [] });
      await sleep(80);
    },
    drag: async (pts, n = 6) => {
      wc.sendInputEvent({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
      wc.sendInputEvent({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
      await sleep(16);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        for (let k = 1; k <= n; k++) {
          wc.sendInputEvent({ type: 'mouseMove', x: Math.round(ax + ((bx - ax) * k) / n), y: Math.round(ay + ((by - ay) * k) / n), modifiers: ['leftButtonDown'] });
          await sleep(8);
        }
      }
      const [lx, ly] = pts[pts.length - 1];
      wc.sendInputEvent({ type: 'mouseUp', x: lx, y: ly, button: 'left', clickCount: 1 });
      await sleep(80);
    },
    key: async (key, mods = []) => {
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods });
      if (key.length === 1) wc.sendInputEvent({ type: 'char', keyCode: key, modifiers: mods });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods });
      await sleep(80);
    },
  };
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, `${name}.png`), (await wc.capturePage()).toPNG());
  };
  /** Opens the app. With debug off (no ?debug) the first-run hello shows as for a visitor, and no test hooks exist. */
  const load = async (shim = 'picker', extra = '', debug = true, base = '/') => {
    await win.loadURL(`http://127.0.0.1:${port}${base}?${debug ? 'debug&' : ''}shim=${shim}${extra}`);
    if (debug) await js(`new Promise((r) => { const t = () => (window.__frameling && window.__framelingIo ? r() : setTimeout(t, 50)); t(); })`);
    await sleep(600);
  };
  /** Clicks the button with this data-testid (a trailing * matches any that start with it). Returns whether there was one. */
  const clickId = (id) => js(`(() => { const b = document.querySelector(${JSON.stringify(id.endsWith('*') ? `[data-testid^="${id.slice(0, -1)}"]` : `[data-testid="${id}"]`)}); b?.click(); return !!b; })()`);
  const clickText = (text, sel = 'button') => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return !!b; })()`);
  const body = () => js('document.body.innerText');
  /** Waits until the page expression is truthy (up to `ms`); returns its last value. */
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < ms) {
      v = await js(expr).catch(() => null);
      if (v) return v;
      await sleep(100);
    }
    return v;
  };
  // The shim's file helpers (see the top of this file).
  const b64 = (buf) => Buffer.from(buf).toString('base64');
  const files = {
    /** Queues a file for the next upload picker (<input type=file>). */
    upload: (name, buf, type = '') => js(`__shim.uploads.push(${JSON.stringify({ name, b64: b64(buf), type })})`),
    /** Puts a file where the next Open picker (picker mode) will find it. */
    stage: async (name, buf) => { await js(`__shim.stage(${JSON.stringify(name)}, __shim.unb64(${JSON.stringify(b64(buf))}))`); await js(`__shim.queue.push(${JSON.stringify(name)})`); },
    /** What was downloaded since the last call (plain mode, or any download the page makes). */
    downloads: async () => (await js(`__shim.downloads.splice(0)`)).map((d) => ({ name: d.name, bytes: Buffer.from(d.b64, 'base64') })),
    /** A file the page saved through the Save picker (picker mode): sub is ['out'] or ['out', 'dir1']. */
    out: async (sub, name) => Buffer.from(await js(`__shim.read(${JSON.stringify(sub)}, ${JSON.stringify(name)}).then((u) => __shim.b64(u))`), 'base64'),
    list: (sub) => js(`__shim.list(${JSON.stringify(sub)})`),
    picks: () => js(`__shim.picks.splice(0)`),
    /** Everything the page wrote since the last call, in either mode: saved files and folders (picker) or downloads (plain). */
    collect: async () => {
      await sleep(250); // a download's bytes are read a moment after the click
      const raw = await js(`__shim.mode === 'plain' ? __shim.downloads.splice(0) : __shim.collect()`);
      return raw.map((d) => ({ name: d.name, bytes: Buffer.from(d.b64, 'base64') }));
    },
  };
  /** Answers a "Remember my choice" question (Quill asks the first time) with its first option. Returns whether one was there. */
  const answerChoice = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      const done = await js(`(() => { const ok = document.querySelector('[data-testid^="choice."][data-testid$=".ok"]'); if (!ok) return false; ok.click(); return true; })()`);
      if (done) { await sleep(500); return true; }
      await sleep(150);
    }
    return false;
  };
  /** Runs a command without waiting for it to finish (a command that opens a dialog finishes when it closes). */
  const run = (id) => js(`void __frameling.run(${JSON.stringify(id)}); 0`);
  return { win, wc, js, input, shot, load, clickText, clickId, body, waitFor, files, run, answerChoice };
}

// ---------------------------------------------------------------- flows

const flows = {};
const flow = (name, fn) => (flows[name] = fn);
module.exports = { flow, check, sleep, makeWindow, errors, tmp };
process.on('uncaughtException', (e) => { console.error(e); app.exit(1); });
require('./web-flows.cjs');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.setPath('userData', path.join(tmp, 'user'));
app.on('window-all-closed', () => {});

process.on('unhandledRejection', (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  await listen();
  const ctx = { listen, unlisten, get port() { return port; }, session, tmp, shotsDir, WEB, root, errors };
  for (const [name, fn] of Object.entries(flows)) {
    if ((only && !only.includes(name)) || skip.includes(name)) continue;
    console.log(`-- ${name}`);
    const before = failures.length;
    const errBefore = errors.length;
    const t0 = Date.now();
    try {
      await Promise.race([fn(ctx), new Promise((_, rej) => setTimeout(() => rej(new Error('the flow took over 150 s')), 150_000))]);
    } catch (e) {
      check(`${name} ran to the end`, false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
    }
    const newErrors = errors.slice(errBefore).filter((m) => !/ServiceWorker|favicon|beforeunload. confirmation/.test(m));
    check(`${name}: no console errors`, newErrors.length === 0, newErrors.slice(0, 3));
    console.log(`   (${failures.length - before} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
  }
  await unlisten();
  console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nAll web checks passed.');
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failures.length ? 1 : 0);
});
