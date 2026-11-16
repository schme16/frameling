// Pretend connections and a pretend peer network, so the share can be run end to end with no sockets.
import { EventEmitter } from 'node:events';
import { waitUntil, WAIT_CEILING_MS } from '../helpers/waits';
import type { ShareStream } from '../../src/share/protocol';
import type { MakeSwarm, SwarmLike } from '../../src/share/swarm';

export class FakeStream extends EventEmitter implements ShareStream {
  peer: FakeStream | null = null;
  closed = false;
  /** Milliseconds between one write reaching the other end and the next, to make a transfer take a while. */
  pace = 0;
  /** Once this many bytes have been written, the connection breaks instead of delivering that write (0 = never). */
  breakAfterBytes = 0;
  private sentBytes = 0;
  private nextAt = 0;
  /** Everything written to this end, so a test can see what the other side was ever told. */
  readonly written: Buffer[] = [];
  constructor(readonly handshakeHash: Uint8Array | null) {
    super();
  }
  write(data: Uint8Array): boolean {
    if (this.closed) return false;
    const copy = Buffer.from(data);
    this.written.push(copy);
    this.sentBytes += copy.length;
    // A break at a counted place, so a test does not have to catch a moment in time (which a busy machine can skip).
    if (this.breakAfterBytes && this.sentBytes > this.breakAfterBytes) {
      this.destroy();
      return false;
    }
    const to = this.peer;
    // Delivered a moment later, as a real socket would.
    if (!to) return true;
    const deliver = () => !to.closed && to.emit('data', copy);
    if (this.pace) {
      this.nextAt = Math.max(this.nextAt + this.pace, Date.now());
      setTimeout(deliver, this.nextAt - Date.now());
    } else setImmediate(deliver);
    return true;
  }
  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    setImmediate(() => this.emit('close'));
    const to = this.peer;
    if (to && !to.closed) setImmediate(() => to.destroy());
  }
  get all(): Buffer {
    return Buffer.concat(this.written);
  }
}

let counter = 0;

/** Two ends of one connection. Both see the same handshake hash, as the two ends of a real encrypted channel do. */
export function pair(hash: Uint8Array | null = Buffer.alloc(32, ++counter)): [FakeStream, FakeStream] {
  const a = new FakeStream(hash);
  const b = new FakeStream(hash);
  a.peer = b;
  b.peer = a;
  return [a, b];
}

/** A stranger in the middle: each side gets its own channel, so the hashes differ, and the stranger relays what it sees. */
export function relayed(): { receiver: FakeStream; sender: FakeStream } {
  const [receiver, midA] = pair(Buffer.alloc(32, 101));
  const [midB, sender] = pair(Buffer.alloc(32, 102));
  midA.on('data', (d) => midB.write(d));
  midB.on('data', (d) => midA.write(d));
  midA.on('close', () => midB.destroy());
  midB.on('close', () => midA.destroy());
  return { receiver, sender };
}

/**
 * Waits until a condition holds, polling. The ceiling is the shared generous one (see test/helpers/waits.ts): a guess
 * of a few seconds passed alone and could fail when the whole suite shares the CPU.
 */
export async function until(cond: () => boolean, ms = WAIT_CEILING_MS): Promise<void> {
  await waitUntil(cond, 'a condition', { ceilingMs: Math.max(ms, WAIT_CEILING_MS), stepMs: 5 });
}

export interface NetOptions {
  /** Whether joining as a server ever finishes announcing. */
  flushes?: boolean;
  reachable?: boolean;
  /** Whether a client that joins is ever connected to a server. */
  connects?: boolean;
}

/** A tiny peer network: a client that joins a topic is connected to whoever announced it. */
export class FakeNet {
  readonly servers = new Map<string, FakeSwarm[]>();
  readonly swarms: FakeSwarm[] = [];
  make(o: NetOptions = {}): MakeSwarm {
    return () => {
      const s = new FakeSwarm(this, o);
      this.swarms.push(s);
      return s;
    };
  }
}

export class FakeSwarm extends EventEmitter implements SwarmLike {
  destroyed = false;
  joined: { topic: string; client: boolean; server: boolean }[] = [];
  constructor(
    private readonly net: FakeNet,
    private readonly o: NetOptions,
  ) {
    super();
  }
  join(topic: Buffer, opts: { client: boolean; server: boolean }) {
    const key = topic.toString('hex');
    this.joined.push({ topic: key, ...opts });
    if (opts.server) {
      const list = this.net.servers.get(key) ?? [];
      list.push(this);
      this.net.servers.set(key, list);
    }
    if (opts.client && this.o.connects !== false) {
      setTimeout(() => {
        for (const server of this.net.servers.get(key) ?? []) {
          if (server.destroyed || this.destroyed) continue;
          const [mine, theirs] = pair();
          server.emit('connection', theirs);
          this.emit('connection', mine);
        }
      }, 20);
    }
    return { flushed: () => (this.o.flushes === false ? new Promise<void>(() => {}) : Promise.resolve()) };
  }
  destroy(): void {
    this.destroyed = true;
  }
  reachable(): boolean {
    return this.o.reachable !== false;
  }
}
