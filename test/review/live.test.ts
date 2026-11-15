// A live review over the share transport: the same code and handshake, then a link that stays. Run against the in-memory
// peer network, with the real password handshake.
import { describe, expect, it } from 'vitest';
import { makeCode, parseCode, formatCode } from '../../src/share/code';
import { startLiveHost, startLiveJoin, type GuestEvent, type HostEvent, type LiveHostJob, type LiveJoinEvent } from '../../src/share/live';
import { startReceive } from '../../src/share/swarm';
import { WORDS } from '../../src/share/wordlist';
import { FakeNet, until } from '../share/helpers';

const FAST = { handshakeMs: 4000, idleMs: 4000, knockMs: 1500 };

function host(net: FakeNet, extra: Partial<Parameters<typeof startLiveHost>[0]> = {}) {
  const events: (HostEvent | { type: string })[] = [];
  const got: { seat: number; lane: string; bytes: Uint8Array }[] = [];
  const job = startLiveHost({ makeSwarm: net.make(), emit: (e) => events.push(e), onMessage: (seat, lane, bytes) => got.push({ seat, lane, bytes }), times: FAST, ...extra });
  const code = () => (events.find((e) => e.type === 'ready') as { code: string } | undefined)?.code;
  return { job, events, got, code };
}

function guest(net: FakeNet, code: string, name: string, gid: string, extra: Partial<Parameters<typeof startLiveJoin>[0]> = {}) {
  const events: LiveJoinEvent[] = [];
  const got: { lane: string; bytes: Uint8Array }[] = [];
  const parsed = parseCode(code);
  if (!parsed.ok) throw new Error('bad code');
  const job = startLiveJoin({ code: parsed.code, name, gid, makeSwarm: net.make(), emit: (e) => events.push(e), onMessage: (lane, bytes) => got.push({ lane, bytes }), times: FAST, findMs: 3000, ...extra });
  const has = (t: string) => events.some((e) => e.type === t);
  return { job, events, got, has };
}

const live = (j: LiveHostJob) => j.host!;
const ofType = <T extends { type: string }>(l: T[], t: string) => l.filter((e) => e.type === t);

describe('live review transport', () => {
  it('lets a guest in once the sharer says so, and messages go both ways', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const g = guest(net, h.code()!, 'Sam', 'gid-sam');
    await until(() => ofType(h.events, 'knock').length === 1);
    expect(g.has('knocking')).toBe(true);
    expect((ofType(h.events, 'knock')[0] as { name: string }).name).toBe('Sam');
    const seat = live(h.job).admit((ofType(h.events, 'knock')[0] as { conn: number }).conn);
    expect(seat).toBe(0);
    await until(() => g.has('in'));
    // Host to guest, and guest to host.
    live(h.job).sendUrgent(0, new Uint8Array([1, 2, 3]));
    g.job.lanes.sendOrdered(new Uint8Array([9, 9]));
    g.job.guest!.kick();
    await until(() => g.got.length === 1 && h.got.length === 1);
    expect([...g.got[0].bytes]).toEqual([1, 2, 3]);
    expect([...h.got[0].bytes]).toEqual([9, 9]);
    expect(h.got[0].seat).toBe(0);
    g.job.cancel();
    h.job.cancel();
  });

  it('carries a big message in pieces and puts it back together', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const g = guest(net, h.code()!, 'Sam', 'g1');
    await until(() => ofType(h.events, 'knock').length === 1);
    live(h.job).admit((ofType(h.events, 'knock')[0] as { conn: number }).conn);
    await until(() => g.has('in'));
    const big = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 7) & 255);
    live(h.job).sendOrdered(0, big);
    await until(() => g.got.length === 1);
    expect(g.got[0].bytes.byteLength).toBe(big.length);
    expect(Buffer.compare(Buffer.from(g.got[0].bytes), Buffer.from(big))).toBe(0);
    g.job.cancel();
    h.job.cancel();
  });

  it('turns a refused guest away and says so', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const g = guest(net, h.code()!, 'Kit', 'g2');
    await until(() => ofType(h.events, 'knock').length === 1);
    live(h.job).refuse((ofType(h.events, 'knock')[0] as { conn: number }).conn);
    await until(() => g.has('refused'));
    expect((g.events.find((e) => e.type === 'refused') as Extract<GuestEvent, { type: 'refused' }>).why).toBe('no');
    h.job.cancel();
  });

  it('seats up to four and tells a fifth the review is full', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const gs: ReturnType<typeof guest>[] = [];
    for (let i = 0; i < 4; i++) {
      gs.push(guest(net, h.code()!, 'R' + i, 'gid' + i));
      await until(() => ofType(h.events, 'knock').length === i + 1);
      live(h.job).admit((ofType(h.events, 'knock')[i] as { conn: number }).conn);
      await until(() => gs[i].has('in'));
    }
    expect(live(h.job).present.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    const fifth = guest(net, h.code()!, 'Late', 'gid5');
    await until(() => fifth.has('refused'));
    expect((fifth.events.find((e) => e.type === 'refused') as { why: string }).why).toBe('full');
    for (const g of gs) g.job.cancel();
    h.job.cancel();
  }, 20000);

  it('puts a guest whose link dropped back in the same seat with no second question', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const g = guest(net, h.code()!, 'Sam', 'same-gid', { retryMs: 5000 });
    await until(() => ofType(h.events, 'knock').length === 1);
    live(h.job).admit((ofType(h.events, 'knock')[0] as { conn: number }).conn);
    await until(() => g.has('in'));
    // The link breaks from the host's end.
    const before = ofType(h.events, 'seated').length;
    (live(h.job) as unknown as { seats: { wire: { destroy(): void } }[] }).seats[0].wire.destroy();
    await until(() => g.has('dropped') && ofType(h.events, 'left').length === 1);
    expect(g.has('retrying')).toBe(true);
    // The network finds them again (the fake network has no retry of its own, so connect once more by hand).
    const sw = net.swarms[net.swarms.length - 1];
    sw.join(Buffer.from(net.servers.keys().next().value!, 'hex'), { client: true, server: false });
    await until(() => ofType(h.events, 'seated').length === before + 1);
    expect((ofType(h.events, 'seated').pop() as { seat: number; returning: boolean }).returning).toBe(true);
    expect(ofType(h.events, 'knock')).toHaveLength(1);
    g.job.cancel();
    h.job.cancel();
  });

  it('shuts the door to newcomers after three wrong tries, and says so', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const meet = h.code()!.split('-').slice(0, 2);
    const real = h.code()!.split('-').slice(2);
    const wrong = [...meet, ...WORDS.filter((w) => !real.includes(w)).slice(0, 2)].join('-');
    const code = parseCode(wrong);
    if (!code.ok) throw new Error('test words must be real code words');
    for (let i = 0; i < 3; i++) {
      guest(net, wrong, 'Eve', 'eve' + i, { findMs: 1500 });
      await until(() => ofType(h.events, 'wrong').length + ofType(h.events, 'burned').length === i + 1, 6000);
    }
    expect(ofType(h.events, 'burned')).toHaveLength(1);
    expect(ofType(h.events, 'knock')).toHaveLength(0);
    h.job.cancel();
  }, 20000);

  it('does not talk to somebody who asks for a copy with the same code, and does not count it as a wrong try', async () => {
    const net = new FakeNet();
    const h = host(net);
    await until(() => !!h.code());
    const parsed = parseCode(h.code()!);
    if (!parsed.ok) throw new Error('code');
    const events: { type: string }[] = [];
    startReceive({ code: parsed.code, makeSwarm: net.make(), emit: (e) => events.push(e), findMs: 800, handshakeMs: 800 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(ofType(h.events, 'wrong')).toHaveLength(0);
    expect(ofType(h.events, 'knock')).toHaveLength(0);
    h.job.cancel();
  });

  it('formats a code the usual way', () => {
    expect(formatCode(makeCode()).split('-')).toHaveLength(4);
  });
});
