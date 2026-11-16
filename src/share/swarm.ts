// Starting and ending a share: make a code, announce it (or look for it), hand every connection to the protocol, and tidy
// up when it is over. The swarm itself is passed in, so this runs the same against Hyperswarm, a local test network, or
// the in-memory pair the unit tests use.
//
// Nothing is kept. The code lives in memory for as long as the share does and is dropped with it. The only thing the
// network ever sees is the meeting topic (a hash of two words) and the connection itself.
import { MAX_WRONG, formatCode, makeCode, type ShareCode } from './code';
import { secretToW, topicFor } from './derive';
import { ShareReceiver, ShareSender, type ShareStream } from './protocol';
import type { ReceiveEvent, SendEvent } from './types';

/** The least of a Hyperswarm that this uses. */
export interface SwarmLike {
  join(topic: Buffer, opts: { client: boolean; server: boolean }): { flushed(): Promise<void> };
  on(event: 'connection', fn: (conn: ShareStream) => void): unknown;
  destroy(): Promise<void> | void;
  /** Whether the peer network has been reached at all. When not given, it is assumed to be. */
  reachable?(): boolean;
}

export type MakeSwarm = () => SwarmLike | Promise<SwarmLike>;

export interface ShareJob {
  /** Stops now and lets everything go. Safe to call twice. */
  cancel(): void;
}

/** How long a code lasts, how long to wait to announce, and how long a receiver looks. All can be changed for tests. */
export const SEND_DEFAULTS = { expiryMs: 10 * 60_000, announceMs: 30_000 };
export const RECEIVE_DEFAULTS = { findMs: 30_000 };

/** A swarm that is torn down at most once, however many things ask. */
function once(swarm: SwarmLike): () => void {
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    try {
      void Promise.resolve(swarm.destroy()).catch(() => {});
    } catch {
      // Already down.
    }
  };
}

export interface StartSend {
  bytes: Uint8Array;
  makeSwarm: MakeSwarm;
  emit: (e: SendEvent) => void;
  expiryMs?: number;
  announceMs?: number;
  maxWrong?: number;
  handshakeMs?: number;
  idleMs?: number;
  /** Tests only: a code you choose. */
  code?: ShareCode;
}

/** Makes a code and waits for somebody to use it. The events say what happens; the returned job stops it. */
export function startSend(o: StartSend): ShareJob {
  let over = false;
  let sender: ShareSender | null = null;
  let stopSwarm: () => void = () => {};
  let timers: ReturnType<typeof setTimeout>[] = [];
  let why: 'expired' | null = null;

  const end = () => {
    over = true;
    for (const t of timers) clearTimeout(t);
    timers = [];
    // A moment, so the last message of a finished transfer is not cut off by the connection closing.
    setTimeout(stopSwarm, 300);
  };
  const emit = (e: SendEvent) => {
    if (over) return;
    if (e.type === 'stopped' && why === 'expired') e = { type: 'expired' };
    o.emit(e);
    if (e.type === 'sent' || e.type === 'burned' || e.type === 'stopped' || e.type === 'expired' || e.type === 'offline') end();
  };
  const job: ShareJob = {
    cancel: () => {
      if (over) return;
      emit({ type: 'stopped' });
      sender?.stop();
    },
  };

  void (async () => {
    emit({ type: 'starting' });
    const code = o.code ?? makeCode();
    let w: bigint;
    try {
      w = await secretToW(code);
    } catch {
      emit({ type: 'offline' });
      return;
    }
    if (over) return;

    let swarm: SwarmLike;
    try {
      swarm = await o.makeSwarm();
    } catch {
      emit({ type: 'offline' });
      return;
    }
    stopSwarm = once(swarm);
    if (over) {
      stopSwarm();
      return;
    }

    sender = new ShareSender({ bytes: o.bytes, w, maxWrong: o.maxWrong ?? MAX_WRONG, handshakeMs: o.handshakeMs, idleMs: o.idleMs, emit });
    swarm.on('connection', (conn) => sender!.accept(conn));
    const discovery = swarm.join(topicFor(code), { client: false, server: true });

    // Announcing is what makes the code usable, so say nothing about it until that has finished.
    const announced = await Promise.race([
      discovery.flushed().then(() => true, () => false),
      new Promise<boolean>((r) => timers.push(setTimeout(() => r(false), o.announceMs ?? SEND_DEFAULTS.announceMs))),
    ]);
    if (over) return;
    if (!announced) {
      emit({ type: 'offline' });
      sender.stop();
      return;
    }
    const expiryMs = o.expiryMs ?? SEND_DEFAULTS.expiryMs;
    emit({ type: 'ready', code: formatCode(code), expiresAt: Date.now() + expiryMs });
    const expire = () => {
      // Somebody with the right code is mid-way through receiving: let them finish, then expire.
      if (sender?.busy) return void timers.push(setTimeout(expire, 5000));
      why = 'expired';
      sender?.stop();
    };
    timers.push(setTimeout(expire, expiryMs));
  })();
  return job;
}

export interface StartReceive {
  code: ShareCode;
  makeSwarm: MakeSwarm;
  emit: (e: ReceiveEvent) => void;
  findMs?: number;
  maxTries?: number;
  handshakeMs?: number;
  idleMs?: number;
}

/** Looks for the sender by the code's meeting words, and checks the secret words with them over the connection. */
export function startReceive(o: StartReceive): ShareJob {
  let over = false;
  let receiver: ShareReceiver | null = null;
  let stopSwarm: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let swarm: SwarmLike | null = null;

  const end = () => {
    over = true;
    if (timer) clearTimeout(timer);
    timer = null;
    setTimeout(stopSwarm, 300);
  };
  const emit = (e: ReceiveEvent) => {
    if (over) return;
    o.emit(e);
    if (e.type === 'received' || e.type === 'refused' || e.type === 'stopped' || e.type === 'noOne' || e.type === 'offline') end();
  };
  const job: ShareJob = {
    cancel: () => {
      if (over) return;
      emit({ type: 'stopped' });
      receiver?.stop();
    },
  };

  void (async () => {
    emit({ type: 'starting' });
    let w: bigint;
    try {
      w = await secretToW(o.code);
    } catch {
      emit({ type: 'offline' });
      return;
    }
    if (over) return;
    try {
      swarm = await o.makeSwarm();
    } catch {
      emit({ type: 'offline' });
      return;
    }
    stopSwarm = once(swarm);
    if (over) {
      stopSwarm();
      return;
    }

    receiver = new ShareReceiver({ w, maxTries: o.maxTries ?? MAX_WRONG, handshakeMs: o.handshakeMs, idleMs: o.idleMs, emit });
    const r = receiver;
    swarm.on('connection', (conn) => r.attach(conn));
    swarm.join(topicFor(o.code), { client: true, server: false });
    emit({ type: 'looking' });

    // Hyperswarm keeps trying in the background, so a deadline of our own is what ends the looking.
    const findMs = o.findMs ?? RECEIVE_DEFAULTS.findMs;
    const check = () => {
      if (over) return;
      // Somebody is sending, so it is not over yet: look again shortly.
      if (r.receiving) {
        timer = setTimeout(check, 5000);
        return;
      }
      // Tried and refused at least once means the answer is "that code did not work", not "nobody was there".
      const answer: ReceiveEvent = swarm?.reachable && !swarm.reachable() ? { type: 'offline' } : r.triesUsed > 0 ? { type: 'refused' } : { type: 'noOne' };
      emit(answer);
      r.stop();
    };
    timer = setTimeout(check, findMs);
  })();
  return job;
}
