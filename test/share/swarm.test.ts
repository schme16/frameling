import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCode, makeCode, parseCode } from '../../src/share/code';
import { startReceive, startSend } from '../../src/share/swarm';
import type { ReceiveEvent, SendEvent } from '../../src/share/types';
import { FakeNet, until } from './helpers';

const drawing = () => new Uint8Array(Array.from({ length: 2000 }, (_, i) => i & 0xff));

function sendSide(net: FakeNet, o: Partial<Parameters<typeof startSend>[0]> = {}) {
  const events: SendEvent[] = [];
  const job = startSend({ bytes: drawing(), makeSwarm: net.make(), emit: (e) => events.push(e), ...o });
  const ready = () => events.find((e): e is Extract<SendEvent, { type: 'ready' }> => e.type === 'ready');
  return { events, job, ready };
}

function receiveSide(net: FakeNet, text: string, o: Partial<Parameters<typeof startReceive>[0]> = {}) {
  const events: ReceiveEvent[] = [];
  const parsed = parseCode(text);
  if (!parsed.ok) throw new Error('bad code in the test');
  const job = startReceive({ code: parsed.code, makeSwarm: net.make(), emit: (e) => events.push(e), ...o });
  return { events, job };
}

const types = (l: { type: string }[]) => l.map((e) => e.type);

describe('sending and receiving with a code, end to end', () => {
  it('announces the code only once it can be used, then delivers the drawing', async () => {
    const net = new FakeNet();
    const s = sendSide(net);
    await until(() => !!s.ready());
    expect(types(s.events).slice(0, 2)).toEqual(['starting', 'ready']);
    const code = s.ready()!.code;
    expect(code.split('-')).toHaveLength(4);
    expect(s.ready()!.expiresAt).toBeGreaterThan(Date.now() + 5 * 60_000);

    const r = receiveSide(net, code);
    await until(() => r.events.some((e) => e.type === 'received'));
    const done = r.events.find((e) => e.type === 'received') as Extract<ReceiveEvent, { type: 'received' }>;
    expect(Buffer.from(done.bytes).equals(Buffer.from(drawing()))).toBe(true);
    await until(() => s.events.some((e) => e.type === 'sent'));
    // Both swarms are put away, so nothing keeps listening for the code.
    await until(() => net.swarms.every((w) => w.destroyed));
  });

  it('joins as a server on the sender and a client on the receiver, and only on the meeting topic', async () => {
    const net = new FakeNet();
    const s = sendSide(net);
    await until(() => !!s.ready());
    receiveSide(net, s.ready()!.code);
    await until(() => net.swarms.length === 2 && net.swarms[1].joined.length === 1);
    expect(net.swarms[0].joined[0]).toMatchObject({ server: true, client: false });
    expect(net.swarms[1].joined[0]).toMatchObject({ server: false, client: true });
    expect(net.swarms[0].joined[0].topic).toBe(net.swarms[1].joined[0].topic);
    // The secret words are nowhere in the topic: a topic is 64 hex digits.
    expect(net.swarms[0].joined[0].topic).toMatch(/^[0-9a-f]{64}$/);
    s.job.cancel();
  });

  it('a wrong code is told so, the sender counts it, and the third one retires the code', async () => {
    const net = new FakeNet();
    const s = sendSide(net, { maxWrong: 2 });
    await until(() => !!s.ready());
    const parts = s.ready()!.code.split('-');
    // Same meeting words, a secret that is a different pair of words.
    const other = makeCode();
    const bad = [...parts.slice(0, 2), ...other.secret].join('-');
    if (bad === s.ready()!.code) return;
    const r1 = receiveSide(net, bad);
    await until(() => r1.events.some((e) => e.type === 'wrong' || e.type === 'refused'));
    expect(types(s.events)).toContain('wrong');
    const r2 = receiveSide(net, bad);
    await until(() => s.events.some((e) => e.type === 'burned'));
    expect(r2.events.some((e) => e.type === 'received')).toBe(false);
    await until(() => net.swarms[0].destroyed);
    // The code is dead: the right one finds nobody.
    const r3 = receiveSide(net, s.ready()!.code, { findMs: 150 });
    await until(() => r3.events.some((e) => e.type === 'noOne'));
  });
});

describe('when nothing connects', () => {
  it('a receiver who finds nobody says so, after its time is up, and lets the network go', async () => {
    const net = new FakeNet();
    const code = formatCode(makeCode());
    const r = receiveSide(net, code, { findMs: 120 });
    await until(() => r.events.some((e) => e.type === 'noOne'));
    expect(types(r.events)).toEqual(['starting', 'looking', 'noOne']);
    await until(() => net.swarms[0].destroyed);
  });

  it('a receiver on a network that cannot be reached says offline, not "nobody"', async () => {
    const net = new FakeNet();
    const r = receiveSide(net, formatCode(makeCode()), { findMs: 100, makeSwarm: net.make({ reachable: false, connects: false }) });
    await until(() => r.events.some((e) => e.type === 'offline' || e.type === 'noOne'));
    expect(types(r.events)).toContain('offline');
  });

  it('a sender whose announcement never finishes says offline instead of showing a code that cannot work', async () => {
    const net = new FakeNet();
    const s = sendSide(net, { makeSwarm: net.make({ flushes: false }), announceMs: 100 });
    await until(() => s.events.some((e) => e.type === 'offline'));
    expect(types(s.events)).toEqual(['starting', 'offline']);
    expect(s.ready()).toBeUndefined();
    await until(() => net.swarms[0].destroyed);
  });

  it('a swarm that cannot even start is offline too, for both sides', async () => {
    const boom = () => Promise.reject(new Error('no sockets'));
    const s = sendSide(new FakeNet(), { makeSwarm: boom });
    const r = receiveSide(new FakeNet(), formatCode(makeCode()), { makeSwarm: boom });
    await until(() => s.events.some((e) => e.type === 'offline') && r.events.some((e) => e.type === 'offline'));
  });

  it('a code left alone runs out, and says so, and puts the network away', async () => {
    const net = new FakeNet();
    const s = sendSide(net, { expiryMs: 150 });
    await until(() => s.events.some((e) => e.type === 'expired'));
    expect(types(s.events)).toEqual(['starting', 'ready', 'expired']);
    await until(() => net.swarms[0].destroyed);
  });

  it('cancelling gives one "stopped", puts the network away, and a second cancel does nothing', async () => {
    const net = new FakeNet();
    const s = sendSide(net);
    await until(() => !!s.ready());
    s.job.cancel();
    s.job.cancel();
    expect(types(s.events).filter((t) => t === 'stopped')).toHaveLength(1);
    await until(() => net.swarms[0].destroyed);

    const r = receiveSide(net, formatCode(makeCode()));
    r.job.cancel();
    expect(types(r.events).filter((t) => t === 'stopped')).toHaveLength(1);
  });

  it('cancelling before the network is even up still puts it away', async () => {
    const net = new FakeNet();
    const s = sendSide(net);
    s.job.cancel();
    await until(() => net.swarms.length === 0 || net.swarms.every((w) => w.destroyed));
    expect(types(s.events)).toEqual(['starting', 'stopped']);
  });
});

describe('nothing is kept', () => {
  const dir = join(__dirname, '../../src/share');
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)), join(__dirname, '../../src/main/share.ts')];

  it('the share code never touches the disk, the keychain, localStorage or the recent list', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).not.toMatch(/node:fs|from 'fs'|writeFile|appendFile|createWriteStream|localStorage|sessionStorage|indexedDB|safeStorage|getPath\(|addRecent|console\./);
    }
  });

  it('events carry no word about who the other person is, and the swarm is the only thing that sees an address', async () => {
    const net = new FakeNet();
    const s = sendSide(net);
    await until(() => !!s.ready());
    const r = receiveSide(net, s.ready()!.code);
    await until(() => r.events.some((e) => e.type === 'received'));
    const keys = new Set<string>();
    for (const e of [...s.events, ...r.events]) Object.keys(e).forEach((k) => keys.add(k));
    expect([...keys].sort()).toEqual(['bytes', 'code', 'done', 'expiresAt', 'left', 'total', 'tries', 'type'].sort().filter((k) => keys.has(k)));
    for (const k of keys) expect(k).not.toMatch(/key|address|ip|host|peer|name|remote/i);
  });
});
