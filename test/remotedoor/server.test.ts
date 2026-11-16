// The real server, on a real local port: shut by default, nothing listening until opened, loopback only, and shut again on close.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRemoteServer, makeRemoteKey, readOrMakeRemoteKey, REMOTE_FOUND_FILE, REMOTE_KEY_FILE, type RemoteServer } from '../../src/main/remoteDoor';
import type { RemoteAsk } from '../../src/shared/remoteDoor';

let dir: string;
let door: RemoteServer;
const asked: RemoteAsk[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-door-'));
  asked.length = 0;
  door = createRemoteServer({ dir, ask: async (op) => (asked.push(op), { status: 200, body: { ok: true } }) });
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
const call = (port: number, o: { method?: string; path?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: any }> =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: o.method ?? 'GET', path: o.path ?? '/v1', headers: o.headers }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode!, body: t ? JSON.parse(t) : null }));
    });
    r.on('error', reject);
    r.end(o.body);
  });
const refused = (port: number) => new Promise<boolean>((resolve) => net.connect(port, '127.0.0.1').on('connect', function (this: net.Socket) { this.destroy(); resolve(false); }).on('error', () => resolve(true)));

describe('shut by default', () => {
  it('has nothing listening, and writes no file, until it is asked to open', async () => {
    const port = await free();
    // Everything the page can ask without opening: none of it opens a port or makes a file.
    expect(door.status()).toMatchObject({ running: false, address: '' });
    expect(await refused(port)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('has no port open at all, not even one that says no: the connection itself is refused', async () => {
    const port = await free();
    await door.open(port, false);
    await door.close();
    expect(await refused(port)).toBe(true);
  });
});

describe('opening', () => {
  it('listens on 127.0.0.1 only, and writes where it is (never the key)', async () => {
    const port = await free();
    const st = await door.open(port, false);
    expect(st).toMatchObject({ running: true, port, address: `http://127.0.0.1:${port}` });
    const found = fs.readFileSync(path.join(dir, REMOTE_FOUND_FILE), 'utf8');
    expect(JSON.parse(found)).toMatchObject({ address: st.address, port, door: 'remote' });
    expect(found).not.toContain(door.key());
    // Not reachable by another address of this computer.
    const other = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (other) expect(await new Promise<boolean>((res) => net.connect(port, other.address).on('connect', function (this: net.Socket) { this.destroy(); res(false); }).on('error', () => res(true)))).toBe(true);
  });
  it('keeps the key where only this user can read it, and it is not the actions door\'s kind', () => {
    const k = door.key();
    expect(k).toMatch(/^frd_[A-Za-z0-9_-]{30,}$/);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, REMOTE_KEY_FILE)).mode & 0o077).toBe(0);
    expect(readOrMakeRemoteKey(dir)).toBe(k);
    expect(makeRemoteKey()).not.toBe(k);
  });
  it('answers with the key and not without', async () => {
    const port = await free();
    await door.open(port, false);
    expect((await call(port)).status).toBe(401);
    expect((await call(port, { headers: { Authorization: `Bearer ${door.key()}` } })).status).toBe(200);
    expect(asked).toEqual([{ op: 'hello' }]);
  });
  it('says the port is taken and stays shut, rather than moving', async () => {
    const port = await free();
    const hog = net.createServer().listen(port, '127.0.0.1');
    await new Promise((r) => hog.once('listening', r));
    const st = await door.open(port, false);
    expect(st).toMatchObject({ running: false, problem: 'port-busy' });
    hog.close();
  });
  it('a new key acts at once and the old one stops', async () => {
    const port = await free();
    await door.open(port, false);
    const old = door.key();
    const fresh = door.roll();
    expect(fresh).not.toBe(old);
    expect((await call(port, { headers: { Authorization: `Bearer ${old}` } })).status).toBe(401);
    expect((await call(port, { headers: { Authorization: `Bearer ${fresh}` } })).status).toBe(200);
  });
});

describe('closing', () => {
  it('stops listening, takes the address file away and does not wait for a caller holding on', async () => {
    const port = await free();
    await door.open(port, false);
    const held = net.connect(port, '127.0.0.1');
    await new Promise((r) => held.once('connect', r));
    await door.close();
    expect(await refused(port)).toBe(true);
    expect(fs.existsSync(path.join(dir, REMOTE_FOUND_FILE))).toBe(false);
    expect(door.status().running).toBe(false);
    held.destroy();
  });
});
