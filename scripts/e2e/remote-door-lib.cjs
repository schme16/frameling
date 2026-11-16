// Shared by the remote door's harnesses: boots the real built app (popout-lib.cjs: real main process, fresh data folder),
// switches the door on the way a person does (the command the Preferences switch runs), and gives back a `door()` that
// talks to it over real HTTP with the real key. Run inside xvfb, never on the desktop.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { boot, sleep, root } = require('./popout-lib.cjs');

/** One request to the door. Resolves { status, body } and never rejects for an HTTP error; rejects when nothing answers. */
const request = (port, o = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: o.method || 'GET', path: o.path || '/v1', headers: o.headers }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, body: t ? JSON.parse(t) : null }));
    });
    r.on('error', reject);
    r.end(o.body);
  });

/** True when nothing is listening on the port (the connection itself is refused). */
const shut = (port) => request(port).then(() => false, (e) => e.code === 'ECONNREFUSED');

async function start(opts = {}) {
  const h = await boot(opts);
  const dataFile = (n) => path.join(h.data, n);
  /** Switches the door on and returns { port, key, door }. The one thing that still goes through the page: a person's switch. */
  const switchOn = async () => {
    await h.js(`window.__frameling.run('remote.toggle')`);
    let found = null;
    for (let i = 0; i < 50 && !found; i++) {
      await sleep(100);
      if (fs.existsSync(dataFile('remote-door.json'))) found = JSON.parse(fs.readFileSync(dataFile('remote-door.json'), 'utf8'));
    }
    if (!found) throw new Error('the door never opened');
    const key = fs.readFileSync(dataFile('remote-door-key.txt'), 'utf8').trim();
    const door = (method, p, body, headers = {}) => request(found.port, { method, path: p, body: body === undefined ? undefined : JSON.stringify(body), headers: { Authorization: `Bearer ${key}`, ...headers } });
    return { port: found.port, key, door };
  };
  return { ...h, dataFile, switchOn, request, shut, root };
}

module.exports = { start, request, shut, sleep, root };
