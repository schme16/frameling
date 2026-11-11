// Plugin sandbox checks in the real app (vitest has no iframes or workers): the sandbox page blocks the network and
// storage, the frame has no way into the app, and both example plugins install, run, edit with undo, and export.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/plugins.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, '../..');
const example = (name) => ({
  'manifest.json': fs.readFileSync(path.join(root, 'plugins/examples', name, 'manifest.json'), 'utf8'),
  'main.js': fs.readFileSync(path.join(root, 'plugins/examples', name, 'main.js'), 'utf8'),
});

// A worker that skips the prelude and tries everything a plugin shouldn't be able to do, so what's tested is the
// sandbox page's policy itself, not the prelude's extra blocking.
const PROBE = `
const violations = [];
self.addEventListener('securitypolicyviolation', (e) => violations.push(e.blockedURI || e.violatedDirective));
onmessage = async (e) => {
  const port = e.ports[0];
  const r = {};
  try { await fetch('https://example.com/'); r.fetch = 'reached'; } catch (err) { r.fetch = 'blocked'; }
  try { await fetch('https://allowed.example.com/'); r.fetchAllowed = 'reached'; } catch (err) { r.fetchAllowed = 'failed'; }
  try { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com/', false); x.send(); r.xhr = 'reached'; } catch (err) { r.xhr = 'blocked'; }
  try { new WebSocket('wss://example.com/'); r.ws = 'made'; } catch (err) { r.ws = 'blocked'; }
  try { importScripts('https://example.com/x.js'); r.importScripts = 'reached'; } catch (err) { r.importScripts = 'blocked'; }
  try { await new Promise((ok, bad) => { const q = indexedDB.open('x'); q.onsuccess = ok; q.onerror = () => bad(q.error); }); r.indexedDB = 'opened'; } catch (err) { r.indexedDB = 'blocked'; }
  r.document = typeof document;
  r.parent = typeof parent;
  await new Promise((ok) => setTimeout(ok, 300));
  r.violations = violations;
  port.postMessage(r);
};`;

const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
  if (!ok) failures.push(name);
};

app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept', 'library:read']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept', 'library:list']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'library:write', 'library:remove']) ipcMain.handle(ch, () => true);
  for (const ch of ['app:documentState', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { preload: path.join(root, 'dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
  await sleep(800);
  const js = (code) => win.webContents.executeJavaScript(code);

  // ------------------------------------------------ the sandbox page itself
  for (const [page, net] of [['plugin-host.html', []], ['plugin-host-net.html', ['https://allowed.example.com']]]) {
    const r = await js(`new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.src = new URL(${JSON.stringify(page)}, document.baseURI).href;
      const t = setTimeout(() => resolve({ timeout: true }), 8000);
      addEventListener('message', function on(e) {
        if (e.source !== f.contentWindow) return;
        removeEventListener('message', on);
        let reachable;
        try { reachable = !!f.contentDocument; } catch (err) { reachable = false; }
        const ch = new MessageChannel();
        ch.port1.onmessage = (m) => { clearTimeout(t); f.remove(); resolve({ ...m.data, appReachable: reachable }); };
        f.contentWindow.postMessage({ t: 'start', prelude: ${JSON.stringify(PROBE)}, code: '', plugin: {}, network: ${JSON.stringify(net)} }, '*', [ch.port2]);
      });
      document.body.appendChild(f);
    })`);
    const tag = net.length ? 'net page' : 'plain page';
    check(`${tag}: worker started`, !r.timeout, r);
    check(`${tag}: frame can't reach the app (no same origin)`, r.appReachable === false, r.appReachable);
    check(`${tag}: fetch to another site blocked`, r.fetch === 'blocked', r.fetch);
    check(`${tag}: XHR blocked`, r.xhr === 'blocked', r.xhr);
    check(`${tag}: importScripts from the web blocked`, r.importScripts === 'blocked', r.importScripts);
    check(`${tag}: no storage`, r.indexedDB === 'blocked', r.indexedDB);
    check(`${tag}: no DOM, no parent in the worker`, r.document === 'undefined' && r.parent === 'undefined', r);
    check(`${tag}: the policy reported the blocked requests`, Array.isArray(r.violations) && r.violations.some((v) => String(v).includes('example.com')), r.violations);
    if (net.length) check(`${tag}: the listed site is not blocked by the policy`, !r.violations.some((v) => String(v).includes('allowed.example.com')), r.violations);
    else check(`${tag}: even the listed site is blocked`, r.violations.some((v) => String(v).includes('allowed.example.com')), r.violations);
  }

  // ------------------------------------------------ the example plugins, end to end
  const install = async (name) => {
    await js(`window.__framelingPlugins.install(${JSON.stringify(example(name))}); true`);
    await sleep(300);
    // Frameling asks first: say yes.
    await js(`document.querySelector('.ui-ask .ui-btn-primary')?.click(); true`);
    await sleep(1200);
  };
  await install('flip-every-other-frame');
  await install('contact-sheet');
  const list = await js(`window.__framelingPlugins.list()`);
  check('both examples installed and on', list.length === 2 && list.every((p) => p.status === 'on'), list);

  await js(`window.__frameling.template('bouncing-ball'); true`);
  await sleep(200);
  const before = await js(`(() => { const s = window.__frameling.store().get(); const l = s.doc.layers.find((x) => x.cels.length > 2); window.__frameling.store().setUi({ activeLayerId: l.id }); const d = s.doc.drawings[l.cels[1].drawingId]; return JSON.stringify(d.shapes?.[0]?.paths?.[0]?.points?.[0] ?? d.shapes?.[0]?.points?.[0] ?? null); })()`);
  await js(`window.__frameling.run('plugin.flip-every-other-frame.flip'); true`);
  await sleep(800);
  const after = await js(`(() => { const s = window.__frameling.store(); const l = s.get().doc.layers.find((x) => x.id === s.get().ui.activeLayerId); const d = s.get().doc.drawings[l.cels[1].drawingId]; return { p: JSON.stringify(d.shapes?.[0]?.paths?.[0]?.points?.[0] ?? d.shapes?.[0]?.points?.[0] ?? null), undo: s.undoLabel() }; })()`);
  check('flip command changed the 2nd key', after.p !== before, { before, after });
  check('flip is one undo step', after.undo === 'Flip every other frame: Flip every other frame', after.undo);
  await js(`window.__frameling.store().undo(); true`);
  const undone = await js(`(() => { const s = window.__frameling.store(); const l = s.get().doc.layers.find((x) => x.id === s.get().ui.activeLayerId); const d = s.get().doc.drawings[l.cels[1].drawingId]; return JSON.stringify(d.shapes?.[0]?.paths?.[0]?.points?.[0] ?? d.shapes?.[0]?.points?.[0] ?? null); })()`);
  check('undo puts it back', undone === before, { undone, before });
  check('plugin panel is registered', await js(`!!document && window.__frameling.commands().includes('view.panel.plugin.flip-every-other-frame.flip')`), null);

  const out = await js(`(async () => {
    const rt = window.__framelingPlugins.runtime('contact-sheet');
    const frames = () => [0, 1, 2, 3].map((i) => ({ width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4).map((_, k) => (k % 4 === 3 ? 255 : (i * 60 + k) % 255)) }));
    const info = { name: 'Probe', fps: 12, width: 64, height: 48, scale: 1, frameNumbers: [0, 1, 2, 3], clips: [], markers: [] };
    const png = await rt.runExport('png', frames(), info);
    const pdf = await rt.runExport('pdf', frames(), info);
    return { png: png.map((f) => [f.name, f.bytes.length, String.fromCharCode(...f.bytes.slice(1, 4))]), pdf: [pdf[0].name, pdf[0].bytes.length, new TextDecoder().decode(pdf[0].bytes.slice(0, 8))] };
  })()`);
  check('contact sheet PNG made in the sandbox', out.png[0][2] === 'PNG' && out.png[0][1] > 500, out);
  check('contact sheet PDF made in the sandbox', out.pdf[2] === '%PDF-1.4' && out.pdf[1] > 300, out);
  const pluginErrors = errors.filter((e) => /plugin/i.test(e));
  check('no plugin errors in the console', pluginErrors.length === 0, pluginErrors);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
