// The real server, on a real local port (0, so any free one), with a pretend page behind it.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDoorServer, FOUND_FILE, KEY_FILE, makeKey, readOrMakeKey, type DoorServer } from '../../src/main/actionsDoor';
import type { DoorAsk } from '../../src/shared/streamDoor';

let dir: string;
let door: DoorServer;
const asked: DoorAsk[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-'));
  asked.length = 0;
  door = createDoorServer({
    dir,
    ask: async (op) => {
      asked.push(op);
      return op.op === 'list' ? { on: true, actions: [] } : { ok: false, reason: 'cooldown', retryInMs: 1500 };
    },
  });
});
afterEach(async () => {
  await door.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/v1/actions', headers: opts.headers }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode!, body: t ? JSON.parse(t) : null, headers: res.headers }));
    });
    r.on('error', reject);
    r.end(opts.body);
  });
}

const free = (): Promise<number> =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

describe('the server', () => {
  it('listens on 127.0.0.1 only, and writes where it is (never the key)', async () => {
    const port = await free();
    const st = await door.open(port, false);
    expect(st).toMatchObject({ running: true, port, address: `http://127.0.0.1:${port}`, moved: false });
    const found = fs.readFileSync(path.join(dir, FOUND_FILE), 'utf8');
    expect(JSON.parse(found)).toMatchObject({ address: st.address, port });
    // The key is made when the door opens, and is on disk by then.
    expect(fs.existsSync(path.join(dir, KEY_FILE))).toBe(true);
    expect(found).not.toContain(door.key());
    await door.close();
    expect(fs.existsSync(path.join(dir, FOUND_FILE))).toBe(false);
    expect(door.status().running).toBe(false);
  });

  it('answers a list and a run with the right key, and refuses without one or from a web page', async () => {
    const port = await free();
    await door.open(port, false);
    const auth = { Authorization: `Bearer ${door.key()}` };
    expect((await call(port, {})).status).toBe(401);
    expect((await call(port, { headers: { ...auth, Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call(port, { headers: auth })).body).toEqual({ ok: true, on: true, actions: [] });
    const r = await call(port, { method: 'POST', path: '/v1/actions/door.message', headers: auth, body: '{"text":"hi"}' });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ ok: false, reason: 'cooldown', retryInMs: 1500, say: 'That was too soon after the last one. Try again in 2 seconds.' });
    expect(r.headers['retry-after']).toBe('2');
    expect(asked.at(-1)).toEqual({ op: 'run', id: 'door.message', payload: { text: 'hi' } });
  });

  it('stops answering when closed, and a new key stops the old one', async () => {
    const port = await free();
    await door.open(port, false);
    const old = door.key();
    door.roll();
    expect(door.key()).not.toBe(old);
    expect((await call(port, { headers: { Authorization: `Bearer ${old}` } })).status).toBe(401);
    expect((await call(port, { headers: { Authorization: `Bearer ${door.key()}` } })).status).toBe(200);
    await door.close();
    await expect(call(port, { headers: { Authorization: `Bearer ${door.key()}` } })).rejects.toThrow();
  });

  it('says not ready when the page never answers', async () => {
    // A page that is gone answers null (the bridge does that on a missing window or a late answer).
    const nobody = createDoorServer({ dir, ask: async () => null });
    const port = await free();
    await nobody.open(port, false);
    const r = await call(port, { headers: { Authorization: `Bearer ${nobody.key()}` } });
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('not-ready');
    await nobody.close();
  });

  it('opening twice is safe, and closing twice is safe', async () => {
    const port = await free();
    const a = await door.open(port, false);
    const b = await door.open(port, false);
    expect(b).toEqual(a);
    await door.close();
    await door.close();
  });

  it('says port-busy when the port is taken, and moves on when told to', async () => {
    const hold = net.createServer();
    const port = await new Promise<number>((r) => hold.listen(0, '127.0.0.1', () => r((hold.address() as net.AddressInfo).port)));
    try {
      const st = await door.open(port, false);
      expect(st).toMatchObject({ running: false, problem: 'port-busy', port });
      const moved = await door.open(port, true);
      expect(moved.running).toBe(true);
      expect(moved.moved).toBe(true);
      expect(moved.port).toBeGreaterThan(port);
    } finally {
      hold.close();
    }
  });
});

describe('the key file', () => {
  it('is made once, kept across restarts, and readable by this user only', () => {
    const k = readOrMakeKey(dir);
    expect(k).toMatch(/^fld_[A-Za-z0-9_-]{30,}$/);
    expect(readOrMakeKey(dir)).toBe(k);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, KEY_FILE)).mode & 0o077).toBe(0);
  });
  it('is made again when the file is rubbish, and every one is different', () => {
    fs.writeFileSync(path.join(dir, KEY_FILE), 'short');
    expect(readOrMakeKey(dir)).toMatch(/^fld_/);
    expect(makeKey()).not.toBe(makeKey());
  });
});
