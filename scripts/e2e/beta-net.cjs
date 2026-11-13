// The desktop side of beta reports, against real failures of Electron's own network stack, each told apart:
// no address, a certificate that is not trusted, a proxy that is down, a request blocked by a policy, a refused
// connection, a server that never answers, a sign-in page, a filter's HTML, the board's own refusal, and the real
// board's health address when this computer is online. Uses throwaway local servers; sends no report anywhere.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/beta-net.cjs
//
// Exits non-zero when anything fails.
const { app, session } = require('electron');
const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-net-'));
const failures = [];
const note = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`);
  if (!ok) failures.push(name);
};

app.commandLine.appendSwitch('no-sandbox');
app.whenReady().then(async () => {
  await build({ entryPoints: [path.join(root, 'src/main/beta.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(tmp, 'beta.cjs'), logLevel: 'silent' });
  const beta = require(path.join(tmp, 'beta.cjs'));
  await build({ entryPoints: [path.join(root, 'src/beta/outcome.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(tmp, 'outcome.cjs'), logLevel: 'silent' });
  const out = require(path.join(tmp, 'outcome.cjs'));
  const say = async (name, req, origin, want, extra = {}) => {
    const reply = await beta.betaRequest(req, origin, undefined, extra.timeoutMs);
    const o = out.outcomeOf(reply, true);
    note(name, o.ok ? 'ok' : o.why, want);
    return reply;
  };

  // A throwaway certificate, so there is something https to distrust.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem')], { stdio: 'ignore' });
  const tls = { key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) };
  const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

  // The board's own answers over plain http on localhost (allowed for local testing only).
  const board = http.createServer((req, res) => {
    const send = (code, type, body) => (res.writeHead(code, { 'content-type': type }), res.end(body));
    if (req.url === '/api/health') return send(200, 'application/json', '{"ok":true,"app":"project-boards"}');
    if (req.method === 'POST' && req.headers.authorization === 'Bearer good') return send(200, 'application/json', '{"ok":true,"id":"x"}');
    if (req.headers.authorization === 'Bearer good') return send(200, 'application/json', '{"ok":true}');
    return send(401, 'application/json', '{"error":"an ingest key is needed"}');
  });
  const bp = await listen(board);
  const bo = `http://127.0.0.1:${bp}`;
  const post = (o, key) => ({ url: `${o}/api/ingest`, method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}' });
  await say('the board accepts a good key', post(bo, 'good'), bo, 'ok');
  await say('the board refuses a bad key', post(bo, 'bad'), bo, 'refused');

  const mid = (code, type, body) => http.createServer((_q, r) => (r.writeHead(code, { 'content-type': type }), r.end(body)));
  for (const [name, code, type, body, want] of [
    ['a wi-fi sign-in page answering 200', 200, 'text/html', '<html>Sign in</html>', 'intercepted'],
    ['a filter answering 403 with HTML', 403, 'text/html', '<html>Blocked</html>', 'intercepted'],
    ['a 502 from the gateway', 502, 'text/html', 'Bad gateway', 'server'],
    ['a proxy asking for sign-in (407)', 407, 'text/html', '', 'proxy'],
    ['too many reports (429)', 429, 'application/json', '{}', 'too-often'],
  ]) {
    const s = mid(code, type, body);
    const p = await listen(s);
    await say(name, post(`http://127.0.0.1:${p}`, 'k'), `http://127.0.0.1:${p}`, want);
    s.close();
  }

  // A certificate nobody trusts.
  const secure = https.createServer(tls, (_q, r) => r.end('{}'));
  const sp = await listen(secure);
  await say('a certificate that is not trusted', post(`https://localhost:${sp}`, 'k'), `https://localhost:${sp}`, 'certificate');
  secure.close();

  // Nothing listening, and a server that never answers.
  const dead = http.createServer();
  const dp = await listen(dead);
  dead.close();
  await say('a connection nothing accepts', post(`http://127.0.0.1:${dp}`, 'k'), `http://127.0.0.1:${dp}`, 'cutoff');
  const hang = http.createServer(() => {});
  const hp = await listen(hang);
  await say('a server that never answers', post(`http://127.0.0.1:${hp}`, 'k'), `http://127.0.0.1:${hp}`, 'timeout', { timeoutMs: 600 });
  hang.closeAllConnections();
  hang.close();

  // An address, but not this build's board, and a build with no board at all: refused before anything leaves.
  await say('an address that is not this build\'s board', post('http://127.0.0.1:1', 'k'), bo, 'blocked');
  await say('an ordinary build with no board', post(bo, 'k'), '', 'blocked');

  // A name that does not exist (reserved, so it can never resolve).
  await say('a name that does not exist', { url: 'https://nothing.invalid/api/health' }, 'https://nothing.invalid', 'dns');

  // A policy cancelling the request, as a security tool or the app's own rules might.
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: d.url.includes(`:${bp}/`) }));
  await say('a request cancelled by a policy', post(bo, 'good'), bo, 'blocked');
  session.defaultSession.webRequest.onBeforeRequest(null);

  // A proxy that is not there.
  await session.defaultSession.setProxy({ proxyRules: 'http=127.0.0.1:1;https=127.0.0.1:1', proxyBypassRules: '<-loopback>' });
  await say('a proxy that is down', post(bo, 'good'), bo, 'proxy');
  await session.defaultSession.setProxy({ mode: 'direct' });

  // The real board, only a harmless GET of its health address and only when this computer can get out.
  if (!process.env.BETA_NET_OFFLINE) {
    const real = 'https://project-boards.shanegadsby.com';
    const r = await beta.betaRequest({ url: `${real}/api/health` }, real);
    const o = out.outcomeOf(r, true);
    console.log(`info the real board's health address: ${o.ok ? 'reachable' : `${o.why} ${o.detail ?? ''}`}`);
  }

  board.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures.length ? `\n${failures.length} failed: ${failures.join(', ')}` : '\nall told apart');
  app.exit(failures.length ? 1 : 0);
});
