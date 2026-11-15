// A peer network that lives inside one process, for checking live review end to end with two windows of one app and no
// sockets (the harnesses set FRAMELING_REVIEW_LOOPBACK=1). A client that joins a topic is connected to whoever announced it,
// over an in-memory pair that carries the same handshake hash on both ends, as a real encrypted connection does.
// Never used unless that variable is set; the real network is Hyperswarm (src/main/share.ts).
import { EventEmitter } from 'node:events';
import type { ShareStream } from './protocol';
import type { MakeSwarm, SwarmLike } from './swarm';

class End extends EventEmitter implements ShareStream {
  peer: End | null = null;
  closed = false;
  constructor(readonly handshakeHash: Uint8Array) {
    super();
  }
  write(data: Uint8Array): boolean {
    if (this.closed) return false;
    const copy = Buffer.from(data);
    const to = this.peer;
    if (to) setImmediate(() => !to.closed && to.emit('data', copy));
    return true;
  }
  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    setImmediate(() => this.emit('close'));
    const to = this.peer;
    if (to && !to.closed) setImmediate(() => to.destroy());
  }
}

let serial = 0;
const servers = new Map<string, Set<Swarm>>();

class Swarm extends EventEmitter implements SwarmLike {
  private gone = false;
  join(topic: Buffer, o: { client: boolean; server: boolean }) {
    const key = topic.toString('hex');
    if (o.server) {
      const set = servers.get(key) ?? new Set();
      set.add(this);
      servers.set(key, set);
    }
    if (o.client) {
      setTimeout(() => {
        for (const server of servers.get(key) ?? []) {
          if (server.gone || this.gone) continue;
          const hash = Buffer.alloc(32, (++serial % 250) + 1);
          const a = new End(hash);
          const b = new End(hash);
          a.peer = b;
          b.peer = a;
          server.emit('connection', b);
          this.emit('connection', a);
        }
      }, 30);
    }
    return { flushed: () => Promise.resolve() };
  }
  destroy(): void {
    this.gone = true;
    for (const set of servers.values()) set.delete(this);
  }
  reachable(): boolean {
    return true;
  }
}

export const makeLoopback: MakeSwarm = () => new Swarm();
