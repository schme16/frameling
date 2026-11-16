// The actions door, end to end, in the real built app: switches audience features on, calls the door over HTTP with the
// real key, and checks the answers, the refusals and that switching off closes it. Run inside xvfb, on a throwaway profile:
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e/stream-door.cjs
//
// It starts its own Electron (with its own data folder and debugging port) and stops only that one.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const electron = require(path.join(root, 'node_modules/electron'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-door-'));
const CDP = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`);
  if (!ok) failed++;
};

const getJson = (url) => new Promise((res, rej) => http.get(url, (r) => { let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }).on('error', rej));
const call = (port, o) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: o.method || 'GET', path: o.path || '/v1/actions', headers: o.headers }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, body: t ? JSON.parse(t) : null }));
    });
    r.on('error', reject);
    r.end(o.body);
  });

(async () => {
  const app = spawn(electron, [path.join(root, 'dist/main/main.cjs'), '--no-sandbox', `--remote-debugging-port=${CDP}`], { env: { ...process.env, XDG_CONFIG_HOME: home, HOME: home }, stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try { target = (await getJson(`http://127.0.0.1:${CDP}/json`)).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    }
    if (!target) throw new Error('The app did not start.');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) pending.get(d.id)(d); };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

    await send('Page.enable');
    await send('Page.navigate', { url: target.url.split('?')[0] + '?debug=1' });
    await sleep(4000);
    check('the debug hook is there', (await evaluate('typeof window.__framelingAudience')) === 'object');

    const port0 = 47213;
    check('the door is closed while audience features are off', await call(port0, {}).then(() => false, () => true));

    await evaluate('__framelingAudience.on(0)');
    await sleep(1500);
    const keyFile = (function find(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { const r = find(p); if (r) return r; } else if (f.name === 'stream-door-key.txt') return p; } return null; })(home);
    check('the key file exists, readable by this user only', !!keyFile && (fs.statSync(keyFile).mode & 0o077) === 0);
    const key = keyFile ? fs.readFileSync(keyFile, 'utf8').trim() : '';
    const foundFile = keyFile && path.join(path.dirname(keyFile), 'stream-door.json');
    const found = foundFile && fs.existsSync(foundFile) ? JSON.parse(fs.readFileSync(foundFile, 'utf8')) : null;
    check('the address file names the port and never holds the key', !!found && found.port >= 47213 && !fs.readFileSync(foundFile, 'utf8').includes(key));
    const port = found ? found.port : port0;
    const auth = { Authorization: `Bearer ${key}` };

    check('no key: 401', (await call(port, {})).status === 401);
    check('wrong key: 401', (await call(port, { headers: { Authorization: 'Bearer nope' } })).status === 401);
    check('an Origin header: 403', (await call(port, { headers: { ...auth, Origin: 'https://evil.example' } })).status === 403);
    const list = await call(port, { headers: auth });
    check('list: 200 with the three example actions', list.status === 200 && ['door.fit-view', 'door.message', 'door.zoom'].every((a) => list.body.actions.some((x) => x.id === a)), JSON.stringify(list));
    const ran = await call(port, { method: 'POST', path: '/v1/actions/door.message', headers: auth, body: '{"text":"Hello from the door"}' });
    check('run: 200 ran', ran.status === 200 && ran.body.outcome === 'ran', JSON.stringify(ran));
    const cool = await call(port, { method: 'POST', path: '/v1/actions/door.message', headers: auth, body: '{"text":"Again"}' });
    check('run again: 429 cooldown with retryInMs', cool.status === 429 && cool.body.reason === 'cooldown' && cool.body.retryInMs > 0, JSON.stringify(cool));
    check('unknown action: 404 unknown', (await call(port, { method: 'POST', path: '/v1/actions/nothing.here', headers: auth })).body?.reason === 'unknown');
    check('bad details: 400 invalid', (await call(port, { method: 'POST', path: '/v1/actions/door.zoom', headers: auth, body: '{"direction":"sideways"}' })).body?.reason === 'invalid');
    check('bad JSON: 400 bad-request', (await call(port, { method: 'POST', path: '/v1/actions/door.zoom', headers: auth, body: '{oops' })).body?.reason === 'bad-request');

    await evaluate('__framelingAudience.audience.setOn(false)');
    await sleep(1000);
    check('switching audience features off closes the door', await call(port, { headers: auth }).then(() => false, () => true));
    check('and the address file is gone', !fs.existsSync(foundFile));
    ws.close();
  } catch (e) {
    console.log('FAIL', e.message);
    failed++;
  } finally {
    app.kill();
    await sleep(500);
    fs.rmSync(home, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
