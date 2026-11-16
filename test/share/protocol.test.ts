import { describe, expect, it } from 'vitest';
import { ShareReceiver, ShareSender } from '../../src/share/protocol';
import type { ReceiveEvent, SendEvent } from '../../src/share/types';
import { FakeStream, pair, relayed, until } from './helpers';

const W = 123456789123456789n;
const WRONG = 987654321987654321n;

function drawing(n = 5000): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
}

function rig(opts: { bytes?: Uint8Array; senderW?: bigint; receiverW?: bigint; maxWrong?: number; maxTries?: number; handshakeMs?: number; maxOpen?: number } = {}) {
  const sent: SendEvent[] = [];
  const got: ReceiveEvent[] = [];
  const bytes = opts.bytes ?? drawing();
  const sender = new ShareSender({ bytes, w: opts.senderW ?? W, maxWrong: opts.maxWrong ?? 3, handshakeMs: opts.handshakeMs, maxOpen: opts.maxOpen, emit: (e) => sent.push(e) });
  const receiver = new ShareReceiver({ w: opts.receiverW ?? W, maxTries: opts.maxTries ?? 3, handshakeMs: opts.handshakeMs, emit: (e) => got.push(e) });
  const connect = () => {
    const [r, s] = pair();
    sender.accept(s);
    receiver.attach(r);
    return { r, s };
  };
  const types = (l: { type: string }[]) => l.map((e) => e.type);
  return { sender, receiver, sent, got, bytes, connect, types };
}

describe('sending a drawing with the right code', () => {
  it('delivers exactly the bytes, and both sides say so', async () => {
    const t = rig();
    t.connect();
    await until(() => t.sent.some((e) => e.type === 'sent'));
    const done = t.got.find((e) => e.type === 'received') as Extract<ReceiveEvent, { type: 'received' }>;
    expect(done).toBeTruthy();
    expect(Buffer.from(done.bytes).equals(Buffer.from(t.bytes))).toBe(true);
    expect(t.types(t.sent)).toContain('connected');
    expect(t.types(t.got)).toEqual(expect.arrayContaining(['checking', 'progress', 'received']));
    expect(t.sender.finished).toBe(true);
  });

  it('carries a big drawing in pieces and reports progress up to the full size', async () => {
    const t = rig({ bytes: drawing(300_000) });
    t.connect();
    await until(() => t.got.some((e) => e.type === 'received'));
    const progress = t.got.filter((e): e is Extract<ReceiveEvent, { type: 'progress' }> => e.type === 'progress');
    expect(progress.length).toBeGreaterThan(5);
    expect(progress.at(-1)).toMatchObject({ done: 300_000, total: 300_000 });
    const done = t.got.find((e) => e.type === 'received') as Extract<ReceiveEvent, { type: 'received' }>;
    expect(done.bytes.length).toBe(300_000);
  });

  it('gives the drawing to one person only: a second connection after the first is turned away', async () => {
    const t = rig();
    t.connect();
    await until(() => t.sent.some((e) => e.type === 'connected'));
    const second = pair();
    t.sender.accept(second[1]);
    await until(() => second[1].closed);
    expect(second[1].all.length).toBe(0);
  });
});

describe('a wrong code', () => {
  it('is refused, counted, and never gets a byte of the drawing or even the sender confirmation', async () => {
    const secret = new TextEncoder().encode('SECRET-DRAWING-MARKER');
    const bytes = new Uint8Array(4000);
    bytes.set(secret, 100);
    const t = rig({ bytes, receiverW: WRONG });
    const { r } = t.connect();
    await until(() => t.sent.some((e) => e.type === 'wrong') && t.got.some((e) => e.type === 'wrong'));
    expect(t.sent.find((e) => e.type === 'wrong')).toMatchObject({ tries: 1, left: 2 });
    expect(t.got.find((e) => e.type === 'wrong')).toMatchObject({ tries: 1, left: 2 });
    // Everything the wrong-code side was ever sent: the reply to its hello and nothing more (5 byte header + 66).
    expect(r.peer).toBeTruthy();
    const received = Buffer.concat(r.peer!.written);
    expect(received.length).toBe(5 + 66);
    expect(received.includes(Buffer.from(secret))).toBe(false);
    expect(t.sent.some((e) => e.type === 'connected' || e.type === 'sent')).toBe(false);
  });

  it('burns the code after the third wrong try, and then not even the right code gets in', async () => {
    const t = rig({ maxWrong: 3 });
    for (let i = 0; i < 3; i++) {
      const bad = new ShareReceiver({ w: WRONG, maxTries: 3, emit: () => {} });
      const [r, s] = pair();
      t.sender.accept(s);
      bad.attach(r);
      await until(() => t.sender.wrongTries === i + 1);
    }
    expect(t.types(t.sent)).toEqual(['wrong', 'wrong', 'burned']);
    expect(t.sent.map((e) => (e.type === 'wrong' ? e.left : null))).toEqual([2, 1, null]);
    // The real person arrives too late.
    const { s } = t.connect();
    await until(() => s.closed);
    expect(t.types(t.got)).not.toContain('received');
    expect(t.types(t.sent)).not.toContain('sent');
    expect(t.sender.finished).toBe(true);
  });

  it('does not count a wrong try when somebody just connects and says nothing, or sends nonsense', async () => {
    // The handshake limit has to be short enough that the quiet connection is turned away in a moment, and long enough
    // that the real person, connecting afterwards on the same sender, still gets through on a busy machine.
    const t = rig({ handshakeMs: 400 });
    const quiet = pair();
    t.sender.accept(quiet[1]);
    const noise = pair();
    t.sender.accept(noise[1]);
    noise[0].write(Buffer.from('GET / HTTP/1.1\r\n\r\n'));
    const huge = pair();
    t.sender.accept(huge[1]);
    huge[0].write(Buffer.concat([Buffer.from([1, 0, 0, 0x10, 0]), Buffer.alloc(10)]));
    await until(() => quiet[1].closed && noise[1].closed && huge[1].closed);
    expect(t.sender.wrongTries).toBe(0);
    // And the real person still gets through afterwards.
    t.connect();
    await until(() => t.sent.some((e) => e.type === 'sent'));
  });

  it('is not let through by a stranger who relays between the two (their channels differ)', async () => {
    const t = rig();
    const { receiver, sender } = relayed();
    t.sender.accept(sender);
    t.receiver.attach(receiver);
    await until(() => t.sent.some((e) => e.type === 'wrong'));
    expect(t.types(t.sent)).not.toContain('connected');
    expect(t.types(t.got)).not.toContain('received');
  });

  it('turns away a connection with no channel hash at all', () => {
    const t = rig();
    const s = new FakeStream(null);
    t.sender.accept(s);
    expect(s.closed).toBe(true);
  });

  it('is not fooled by a peer that answers with the wrong sender confirmation: the receiver counts it and gives up after its limit', async () => {
    const t = rig({ senderW: WRONG, maxTries: 2 });
    t.connect();
    await until(() => t.got.some((e) => e.type === 'wrong'));
    t.connect();
    await until(() => t.got.some((e) => e.type === 'refused'));
    expect(t.got.filter((e) => e.type === 'wrong')).toHaveLength(1);
    expect(t.receiver.triesUsed).toBe(2);
    // A third sender, even the right one, is not asked: each ask hands a stranger a guess.
    const right = new ShareSender({ bytes: drawing(), w: W, maxWrong: 3, emit: () => {} });
    const [r, s] = pair();
    right.accept(s);
    t.receiver.attach(r);
    await until(() => r.closed);
    expect(t.got.some((e) => e.type === 'received')).toBe(false);
  });

  it('counts the receiver try at the moment its confirmation goes out, even when the other end then just hangs up', async () => {
    const t = rig({ maxTries: 3 });
    const [r, s] = pair();
    t.receiver.attach(r);
    // A fake sender that answers with a valid reply from a different password, then vanishes after the confirmation.
    const fake = new ShareSender({ bytes: drawing(), w: WRONG, maxWrong: 99, emit: () => {} });
    fake.accept(s);
    await until(() => t.receiver.triesUsed === 1);
    s.destroy();
    await until(() => t.got.some((e) => e.type === 'wrong'));
    expect(t.receiver.triesUsed).toBe(1);
  });
});

describe('a connection that breaks part-way', () => {
  it('returns the sender to waiting, with the code still good, and the receiver can try again', async () => {
    const t = rig({ bytes: drawing(400_000) });
    const { r, s } = t.connect();
    s.pace = 15;
    // Cut the line the moment the first piece lands, from inside the data event. Polling for "some but not all" raced
    // the paced timers: when the machine stalls they fire in a burst and the whole drawing can arrive between two polls.
    // Both ends go at once so no piece already queued can still be delivered.
    let cut = false;
    r.on('data', () => {
      if (cut || !t.got.some((e) => e.type === 'progress' && e.done > 0 && e.done < 400_000)) return;
      cut = true;
      s.destroy();
      r.destroy();
    });
    await until(() => cut);
    await until(() => t.sent.some((e) => e.type === 'dropped'));
    expect(t.sender.finished).toBe(false);
    expect(t.got.some((e) => e.type === 'dropped')).toBe(true);
    t.connect();
    await until(() => t.sent.some((e) => e.type === 'sent'));
    expect(t.got.some((e) => e.type === 'received')).toBe(true);
  });
});

describe('the sender is told to stop', () => {
  it('lets every connection go and says so once', async () => {
    const t = rig();
    const quiet = pair();
    t.sender.accept(quiet[1]);
    t.sender.stop();
    t.sender.stop();
    await until(() => quiet[1].closed);
    expect(t.types(t.sent)).toEqual(['stopped']);
  });

  it('turns away too many half-open connections at once', async () => {
    const t = rig({ maxOpen: 2, handshakeMs: 5000 });
    const open = [pair(), pair(), pair()];
    for (const [, s] of open) t.sender.accept(s);
    expect(open[0][1].closed).toBe(false);
    expect(open[1][1].closed).toBe(false);
    expect(open[2][1].closed).toBe(true);
    t.sender.stop();
  });
});
