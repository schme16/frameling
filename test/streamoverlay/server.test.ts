// The real server on a real local port, with the overlay beside the door: the two share a port and nothing else.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDoorServer, type DoorServer } from '../../src/main/actionsDoor';
import { createOverlayHub, type OverlayHub } from '../../src/main/overlayHub';

let dir: string;
let door: DoorServer;
let hub: OverlayHub;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-srv-'));
  hub = createOverlayHub({ dir, mascotDir: null });
  door = createDoorServer({ dir, ask: async () => ({ on: true, actions: [] }), overlay: hub });
});
afterEach(async () => {
  await door.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const free = (): Promise<number> =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

function call(port: number, p: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode!, text: t, headers: res.headers }));
    });
    r.on('error', reject);
    r.end();
  });
}

describe('the overlay on the door server', () => {
  it('serves the page and its state to a browser source, with an Origin of its own or none', async () => {
    const port = (await door.open(await free(), false)).port;
    hub.setOn(true);
    hub.push({ prompt: { id: 1, text: 'a frog in a teacup' } });
    const base = `/overlay/${hub.token()}/`;
    const page = await call(port, base);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    const st = await call(port, base + 'state', { origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' });
    expect(JSON.parse(st.text).state.prompt.text).toBe('a frog in a teacup');
    expect(st.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('shuts another web page out of it, and still shuts every web page out of the door', async () => {
    const port = (await door.open(await free(), false)).port;
    hub.setOn(true);
    const base = `/overlay/${hub.token()}/state`;
    expect((await call(port, base, { origin: 'https://evil.example' })).status).toBe(403);
    // The door, unchanged: its key does not help a request that comes from a page, not even this page's own origin.
    const key = door.key();
    expect((await call(port, '/v1/actions', { authorization: `Bearer ${key}`, origin: `http://127.0.0.1:${port}` })).status).toBe(403);
    expect((await call(port, '/v1/actions', { authorization: `Bearer ${key}`, 'sec-fetch-site': 'same-origin' })).status).toBe(403);
    // And the overlay token is not a key.
    expect((await call(port, '/v1/actions', { authorization: `Bearer ${hub.token()}` })).status).toBe(401);
    expect((await call(port, '/v1/actions', { authorization: `Bearer ${key}` })).status).toBe(200);
  });
  it('only reads, and a body or a method it does not know goes nowhere', async () => {
    const port = (await door.open(await free(), false)).port;
    hub.setOn(true);
    expect((await call(port, `/overlay/${hub.token()}/state`, {}, 'POST')).status).toBe(405);
    expect((await call(port, `/overlay/${hub.token()}/state`, {}, 'DELETE')).status).toBe(405);
    const head = await call(port, `/overlay/${hub.token()}/state`, {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.text).toBe('');
  });
  it('is not there when the overlay is off, and goes with the door when the door closes', async () => {
    const port = (await door.open(await free(), false)).port;
    expect((await call(port, `/overlay/${hub.token()}/`)).status).toBe(404);
    hub.setOn(true);
    expect((await call(port, `/overlay/${hub.token()}/`)).status).toBe(200);
    await door.close();
    await expect(call(port, `/overlay/${hub.token()}/`)).rejects.toThrow();
  });
  it('has no overlay at all on a server made without one', async () => {
    const bare = createDoorServer({ dir, ask: async () => null });
    const port = (await bare.open(await free(), false)).port;
    try {
      expect((await call(port, `/overlay/${hub.token()}/`)).status).toBe(401);
    } finally {
      await bare.close();
    }
  });
});
