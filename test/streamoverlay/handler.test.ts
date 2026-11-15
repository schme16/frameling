// The overlay's rules for a request, and the proof that the door's are not the ones it uses. Called directly: no sockets.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleDoorRequest } from '../../src/main/doorHandler';
import { fromAnotherPage, handleOverlayRequest, isOverlayPath, OVERLAY_HEADERS, type OverlayRequest } from '../../src/main/overlayHandler';
import { createOverlayHub, makeOverlayToken, readOrMakeOverlayToken, TOKEN_FILE, type OverlayHub } from '../../src/main/overlayHub';
import { OVERLAY_STALE_MS, type OverlayState } from '../../src/shared/streamOverlay';

const PORT = 47213;
let dir: string;
let mascot: string;
let clock = 1_000_000_000_000;
let hub: OverlayHub;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
  mascot = path.join(dir, 'mascot');
  fs.mkdirSync(mascot);
  fs.writeFileSync(path.join(mascot, 'mascot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(mascot, 'mascot.json'), '{"frameW":48,"frameH":48,"anims":{"idle":{"loop":true,"frames":[{"x":0,"y":0,"ms":100}]}}}');
  clock = 1_000_000_000_000;
  hub = createOverlayHub({ dir, mascotDir: mascot, now: () => clock });
  hub.setOn(true);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const req = (url: string, over: Partial<OverlayRequest> = {}): OverlayRequest => ({ method: 'GET', url, headers: { host: `127.0.0.1:${PORT}` }, port: PORT, ...over });
const call = (url: string, over: Partial<OverlayRequest> = {}) => handleOverlayRequest(req(url, over), hub);
const at = (name = '') => `/overlay/${hub.token()}/${name}`;

describe('what it serves', () => {
  it('serves the page, its script and styles, and Quill, each with the right type', () => {
    const page = call(at());
    expect(page.status).toBe(200);
    expect(page.headers['Content-Type']).toContain('text/html');
    expect(String(page.body)).toContain('overlay.js');
    expect(call(at('overlay.js')).headers['Content-Type']).toContain('javascript');
    expect(call(at('overlay.css')).headers['Content-Type']).toContain('text/css');
    expect(call(at('quill.png')).headers['Content-Type']).toBe('image/png');
    expect(call(at('quill.json')).headers['Content-Type']).toContain('json');
  });
  it('has a transparent page: no background on the page itself', () => {
    const css = String(call(at('overlay.css')).body);
    expect(css).toMatch(/html, body \{[^}]*background: transparent/);
    expect(String(call(at()).body)).not.toMatch(/<img|background/i);
  });
  it('sends the page without its closing slash on to the one with it, so its own files are found', () => {
    const r = call(`/overlay/${hub.token()}`);
    expect(r.status).toBe(308);
    expect(r.headers.Location).toBe(`/overlay/${hub.token()}/`);
  });
  it('serves only its own files: nothing else is reachable by name or by climbing out', () => {
    for (const n of ['package.json', '../x', '..%2f..%2fetc%2fpasswd', 'mascot.png', 'a/b/c', 'overlay.js.map']) expect(call(at(n)).status, n).toBe(404);
    expect(call(`/overlay/${hub.token()}/../../v1/actions`).status).toBe(404);
  });
  it('is not part of the door: /v1 paths never come here and /overlay paths never go there', () => {
    expect(isOverlayPath('/overlay/x/')).toBe(true);
    expect(isOverlayPath('/overlay')).toBe(true);
    expect(isOverlayPath('/v1/actions')).toBe(false);
    expect(isOverlayPath('/overlays')).toBe(false);
  });
});

describe('what the state says', () => {
  const s = (over: Partial<OverlayState> = {}): OverlayState => ({ theme: null, quill: { id: 1, anim: 'cheer', words: 'Hi!', sign: false, until: clock + 5000 }, banner: null, countdown: null, chips: [], prompt: null, vote: null, ...over });
  const state = () => JSON.parse(String(call(at('state')).body));

  it('is nothing at all until the app has said something', () => {
    expect(state().state).toMatchObject({ quill: null, banner: null, prompt: null, vote: null, chips: [] });
  });
  it('shows what was pushed, and drops a reaction when its time is up', () => {
    const first = s();
    hub.push(first);
    expect(state().state.quill.words).toBe('Hi!');
    clock += 6000;
    hub.push(first); // a push does not bring back what has gone
    expect(state().state.quill).toBeNull();
  });
  it('goes quiet when the app stops telling it things (a hung or gone app must not leave the last thing up)', () => {
    hub.push(s({ prompt: { id: 2, text: 'a frog' } }));
    clock += OVERLAY_STALE_MS - 1;
    expect(state().state.prompt).not.toBeNull();
    clock += 2;
    expect(state().state.prompt).toBeNull();
  });
  it('cleans what it is given: a smuggled path or key never comes out', () => {
    hub.push({ ...s(), prompt: { id: 1, text: 'see /home/someone/x.png fld_AbCdEfGhIjKlMnOpQrSt' }, secret: 'fld_x', path: '/home/someone' });
    expect(String(call(at('state')).body)).not.toMatch(/someone|fld_|secret|path/);
  });
  it('keeps nothing while switched off, and forgets what it had', () => {
    hub.push(s());
    hub.setOn(false);
    expect(call(at('state')).status).toBe(404);
    hub.setOn(true);
    expect(state().state.quill).toBeNull();
    hub.setOn(false);
    hub.push(s());
    hub.setOn(true);
    expect(state().state.quill).toBeNull();
  });
});

describe('the token', () => {
  it('is needed: no token, a wrong one, and the same one with a letter changed all say the same nothing', () => {
    const none = call('/overlay/');
    const wrong = call('/overlay/ov_nope/');
    const near = call(`/overlay/${hub.token().slice(0, -1)}X/`);
    for (const r of [none, wrong, near]) {
      expect(r.status).toBe(404);
      expect(r.body).toBe('Nothing here.');
    }
    expect(call('/overlay').status).toBe(404);
  });
  it('answers an overlay that is off exactly as it answers a wrong token, so nothing says it exists', () => {
    hub.setOn(false);
    expect(call(at()).body).toBe(call('/overlay/ov_nope/').body);
    expect(call(at()).status).toBe(404);
  });
  it('is not the door key, and the door key opens nothing here', () => {
    expect(hub.token().startsWith('ov_')).toBe(true);
    expect(call('/overlay/fld_aDoorKeyThatIsLongEnoughToLookReal/').status).toBe(404);
  });
  it('is kept on disk (readable by this user only), so the address OBS saved survives a restart, and a new one replaces it', () => {
    const t = hub.token();
    expect(readOrMakeOverlayToken(dir)).toBe(t);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, TOKEN_FILE)).mode & 0o777).toBe(0o600);
    const next = hub.roll();
    expect(next).not.toBe(t);
    expect(call(`/overlay/${t}/`).status).toBe(404);
    expect(call(`/overlay/${next}/`).status).toBe(200);
    expect(makeOverlayToken()).not.toBe(makeOverlayToken());
  });
});

describe('who may ask', () => {
  it('lets in what a browser source and a typed address send: no Origin, or Sec-Fetch-Site of none or same-origin', () => {
    expect(call(at()).status).toBe(200);
    expect(call(at(), { headers: { host: `127.0.0.1:${PORT}`, 'sec-fetch-site': 'none' } }).status).toBe(200);
    // The page asking for its own state: some browsers add the Origin of the page itself.
    expect(call(at('state'), { headers: { host: `127.0.0.1:${PORT}`, 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${PORT}` } }).status).toBe(200);
    expect(call(at('state'), { headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` } }).status).toBe(200);
  });
  it('refuses any other web page, even with the right token', () => {
    for (const origin of ['https://evil.example', 'http://127.0.0.1:9999', 'http://localhost', 'null', `http://127.0.0.1:${PORT}.evil.example`]) {
      expect(call(at('state'), { headers: { host: `127.0.0.1:${PORT}`, origin } }).status, origin).toBe(403);
    }
    for (const site of ['cross-site', 'same-site', 'cross-origin']) expect(call(at('state'), { headers: { host: `127.0.0.1:${PORT}`, 'sec-fetch-site': site } }).status, site).toBe(403);
    expect(fromAnotherPage({ origin: 'https://x.example' }, PORT)).toBe(true);
    expect(fromAnotherPage({}, PORT)).toBe(false);
  });
  it('refuses a Host that is not this machine and port (DNS rebinding)', () => {
    for (const host of ['evil.example', `evil.example:${PORT}`, '127.0.0.1:1', `127.0.0.1.evil.example:${PORT}`]) expect(call(at('state'), { headers: { host } }).status, host).toBe(403);
  });
  it('only reads: anything else is refused before the token is looked at', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) expect(call(at('state'), { method: m }).status, m).toBe(405);
    expect(call(at('state'), { method: 'HEAD' }).status).toBe(200);
  });
  it('never invites another page to read it: no CORS headers on any answer', () => {
    for (const r of [call(at()), call(at('state')), call(at('quill.png')), call('/overlay/nope/'), call(at('state'), { method: 'POST' })]) {
      expect(Object.keys(r.headers).filter((h) => /^access-control/i.test(h))).toEqual([]);
    }
  });
});

describe('what comes with every answer', () => {
  it('is not cached, not sniffed, not leaked in a Referer, not framed, and loads nothing but its own files', () => {
    for (const r of [call(at()), call(at('state')), call('/overlay/nope/'), call(at(), { method: 'POST' })]) {
      for (const [k, v] of Object.entries(OVERLAY_HEADERS)) expect(r.headers[k], k).toBe(v);
    }
    const csp = OVERLAY_HEADERS['Content-Security-Policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(OVERLAY_HEADERS['Referrer-Policy']).toBe('no-referrer');
  });
  it('has a page that holds no inline script, no inline style, and no outside address', () => {
    const html = String(call(at()).body);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>\s*\S/);
    expect(html).not.toMatch(/\sstyle=|\son\w+=/i);
    expect(html).not.toMatch(/https?:\/\//);
    const js = String(call(at('overlay.js')).body);
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|https?:\/\//);
  });
});

describe('the door is not loosened', () => {
  const door = { key: () => 'fld_theRealDoorKeyIsLongAndUnguessableXX', ask: async () => ({ on: true, actions: [] }) };
  const doorReq = (headers: Record<string, string>) => ({ method: 'GET', url: '/v1/actions', headers: { host: `127.0.0.1:${PORT}`, ...headers }, body: '', port: PORT });
  it('still refuses a request with an Origin, with the right key, and with the overlay token', async () => {
    expect((await handleDoorRequest(doorReq({ origin: `http://127.0.0.1:${PORT}`, authorization: `Bearer ${door.key()}` }), door)).status).toBe(403);
    expect((await handleDoorRequest(doorReq({ 'sec-fetch-site': 'same-origin', authorization: `Bearer ${door.key()}` }), door)).status).toBe(403);
    expect((await handleDoorRequest(doorReq({ authorization: `Bearer ${hub.token()}` }), door)).status).toBe(401);
    expect((await handleDoorRequest(doorReq({ authorization: `Bearer ${door.key()}` }), door)).status).toBe(200);
  });
  it('does not know the overlay at all: the door answers /overlay as a path that is not there', async () => {
    const r = await handleDoorRequest({ ...doorReq({ authorization: `Bearer ${door.key()}` }), url: at() }, door);
    expect(r.status).toBe(404);
  });
});
