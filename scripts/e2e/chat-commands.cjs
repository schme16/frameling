// The chat commands guide, end to end, in the real built app: the exact requests the guide gives for !vote, !guess and
// !prompt, with the real key, against a started vote and round, and every answer the guide's failure table promises. Run inside xvfb, on a throwaway profile:
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e/chat-commands.cjs
//
// It starts its own Electron (with its own data folder and debugging port) and stops only that one.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const electron = require(path.join(root, 'node_modules/electron'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-chat-'));
const CDP = 9352;
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

    await evaluate('__framelingAudience.on(0)');
    await sleep(1500);
    const find = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { const r = find(p); if (r) return r; } else if (f.name === 'stream-door-key.txt') return p; } };
    const keyFile = find(home);
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    const port = JSON.parse(fs.readFileSync(path.join(path.dirname(keyFile), 'stream-door.json'), 'utf8')).port;
    const post = (action, body, headers = { Authorization: `Bearer ${key}` }) => call(port, { method: 'POST', path: `/v1/actions/${action}`, headers, body });
    const is = (r, status, reason) => r.status === status && (reason === undefined || r.body?.reason === reason || r.body?.outcome === reason);

    // The guide's step 2: a vote, then the one request.
    check('no vote running: 400 invalid', is(await post('vote.cast', '{"option":1,"voter":"test"}'), 400, 'invalid'));
    await evaluate(`__framelingVotes.start({ question: 'Which colour?', options: ['red', 'blue', 'green'] })`);
    check('the guide\'s curl: 200 ran', is(await post('vote.cast', '{"option":1,"voter":"test"}'), 200, 'ran'));
    check('the same voter again: 400 invalid', is(await post('vote.cast', '{"option":1,"voter":"test"}'), 400, 'invalid'));
    check('an option by its words: 200', is(await post('vote.cast', '{"option":"green","voter":"1002"}'), 200, 'ran'));
    check('the option as text, as Firebot and the C# send it: 200', is(await post('vote.cast', '{"option":"2","voter":"1003"}'), 200, 'ran'));
    check('an option that is not there: 400', is(await post('vote.cast', '{"option":9,"voter":"1004"}'), 400, 'invalid'));
    check('no voter id: 400', is(await post('vote.cast', '{"option":1}'), 400, 'invalid'));
    check('a body that is not JSON (an unescaped quote): 400 bad-request', is(await post('vote.cast', '{"option":"say "hi"","voter":"1005"}'), 400, 'bad-request'));
    check('the other key header works too', is(await post('vote.cast', '{"option":1,"voter":"1006"}', { 'X-Frameling-Key': key }), 200, 'ran'));
    check('a wrong key: 401', is(await post('vote.cast', '{"option":1,"voter":"1007"}', { Authorization: 'Bearer nope' }), 401, 'unauthorized'));
    check('a request with an Origin: 403', is(await post('vote.cast', '{"option":1,"voter":"1008"}', { Authorization: `Bearer ${key}`, Origin: 'https://example.com' }), 403, 'origin-refused'));

    check('no round running: 400 invalid', is(await post('guess.send', '{"guess":"cat","player":"2001"}'), 400, 'invalid'));
    await evaluate(`__framelingGuess.start({ word: 'elephant' })`);
    check('a wrong guess: 200 ran (never says it was wrong)', is(await post('guess.send', '{"guess":"giraffe","player":"2001","name":"Ann"}'), 200, 'ran'));
    check('a right guess: 200 ran, the same answer', is(await post('guess.send', '{"guess":"an elephant","player":"2002","name":"Bo"}'), 200, 'ran'));
    check('a guess with no player id: 400', is(await post('guess.send', '{"guess":"cat"}'), 400, 'invalid'));

    const first = await post('jar.add', '{"text":"a frog in a \\"teacup\\""}');
    check('a prompt with an escaped quote: 200', is(first, 200, 'ran'));
    const soon = await post('jar.add', '{"text":"a very sleepy dragon"}');
    check('a second prompt at once: 429 cooldown with retryInMs', is(soon, 429, 'cooldown') && soon.body.retryInMs > 0, JSON.stringify(soon));
    check('the jar has the first one, quote and all', (await evaluate('JSON.stringify(__framelingJar.state().slips.map((s) => s.text))')) === '["a frog in a \\"teacup\\""]');

    await evaluate('__framelingAudience.audience.setOn(false)');
    await sleep(1000);
    check('audience features off: could not connect', await call(port, { method: 'POST', path: '/v1/actions/vote.cast', headers: { Authorization: `Bearer ${key}` }, body: '{}' }).then(() => false, () => true));
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
