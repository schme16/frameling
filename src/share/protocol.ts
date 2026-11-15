// The conversation between the person sending and the person receiving, once a connection exists. Works on any duplex
// stream, so it runs the same over Hyperswarm and over the plain pairs the tests use.
//
//   receiver (A)                        sender (B)
//   HELLO  pA                  ----->
//                              <-----   REPLY  pB
//   CONFIRM cA                 ----->   (checks it; a wrong one counts as a wrong try and ends here)
//                              <-----   CONFIRM cB
//   (checks cB)
//                              <-----   OFFER  total size
//                              <-----   DATA   ... DATA
//   DONE                       ----->
//
// The drawing is only ever written after both confirmations have checked out, so a wrong code gets nothing but a
// refusal. Both confirmations are bound to the connection's own handshake hash (the AAD of RFC 9382 section 4), so a
// stranger who sits between the two and relays them gets two different channels, and neither confirmation matches.
//
// Every limit that matters lives here: how many wrong tries, how many half-open connections, how long each may take.
import { Spake2 } from './spake2';
import { ID_RECEIVER, ID_SENDER } from './derive';
import type { ReceiveEvent, SendEvent } from './types';

/** The least of a duplex stream that this needs. A Hyperswarm connection is one; the tests bring their own. */
export interface ShareStream {
  /** Hash of the connection's own encryption handshake. Both ends of one connection see the same bytes. */
  readonly handshakeHash?: Uint8Array | null;
  write(data: Uint8Array): boolean | void;
  destroy(err?: Error): void;
  on(event: 'data', fn: (chunk: Uint8Array) => void): unknown;
  on(event: 'close', fn: () => void): unknown;
  on(event: 'error', fn: (e: Error) => void): unknown;
  once?(event: 'drain', fn: () => void): unknown;
}

export const VERSION = 1;
export const T = { HELLO: 1, REPLY: 2, CONFIRM_A: 3, CONFIRM_B: 4, OFFER: 5, DATA: 6, DONE: 7 } as const;
/** Before the code has been proved, nothing a stranger sends may be bigger than this. */
const PRE_AUTH_MAX = 256;
/** A piece of the drawing. */
const CHUNK = 32 * 1024;
/** Frames after the code is proved: a chunk plus a little. */
export const POST_AUTH_MAX = CHUNK + 64;

/** The most a copy may be, so a confused or hostile peer cannot ask for the whole memory. */
export const MAX_BYTES = 512 * 1024 * 1024;

const utf8 = (s: string) => new TextEncoder().encode(s);

export function channelBinding(stream: ShareStream): Uint8Array | null {
  const h = stream.handshakeHash;
  if (!h || h.length === 0) return null;
  const label = utf8('frameling share v1 channel');
  const out = new Uint8Array(label.length + h.length);
  out.set(label, 0);
  out.set(h, label.length);
  return out;
}

/** Reads length-prefixed frames off a stream and writes them. Closes the stream on anything malformed. */
export class Wire {
  private buf = Buffer.alloc(0);
  /** The biggest frame it will accept right now. */
  max = PRE_AUTH_MAX;
  closed = false;
  private last = Date.now();

  constructor(
    readonly stream: ShareStream,
    private readonly onFrame: (type: number, payload: Buffer) => void,
    private readonly onEnd: () => void,
  ) {
    stream.on('data', (chunk) => this.take(chunk));
    stream.on('close', () => this.finish());
    // A reset or a timeout surfaces as an error; it is the same ending as a close.
    stream.on('error', () => this.finish());
  }

  /** When the stream last said anything, for idle timeouts. */
  get idleSince(): number {
    return this.last;
  }

  private take(chunk: Uint8Array): void {
    if (this.closed) return;
    this.last = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    while (this.buf.length >= 5 && !this.closed) {
      const len = this.buf.readUInt32BE(1);
      if (len > this.max) return void this.destroy();
      if (this.buf.length < 5 + len) return;
      const type = this.buf[0];
      const payload = this.buf.subarray(5, 5 + len);
      this.buf = this.buf.subarray(5 + len);
      this.onFrame(type, Buffer.from(payload));
    }
    // A frame that has not even finished its 5 byte header is fine, but a body that is promised bigger than allowed is not.
    if (this.buf.length >= 5 && this.buf.readUInt32BE(1) > this.max) this.destroy();
  }

  send(type: number, payload: Uint8Array = new Uint8Array(0)): boolean {
    if (this.closed) return false;
    const head = Buffer.alloc(5);
    head[0] = type;
    head.writeUInt32BE(payload.length, 1);
    try {
      return this.stream.write(Buffer.concat([head, payload])) !== false;
    } catch {
      this.destroy();
      return false;
    }
  }

  /** Waits until the stream has room again. */
  drained(): Promise<void> {
    return new Promise((resolve) => {
      if (this.closed || !this.stream.once) return resolve();
      const done = () => resolve();
      this.stream.once('drain', done);
      this.stream.on('close', done);
    });
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.stream.destroy();
    } catch {
      // Already gone.
    }
    this.onEnd();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.onEnd();
  }
}

// ----------------------------------------------------------------------------------------------------- the sender

export interface SenderOptions {
  /** The drawing, as .frameling bytes. */
  bytes: Uint8Array;
  /** The handshake password number (see derive.ts). */
  w: bigint;
  /** Wrong tries before the code is retired. */
  maxWrong: number;
  /** Connections that have not yet proved the code, at once. Anything past this is turned away. */
  maxOpen?: number;
  /** How long a connection has to prove the code, and how long it may go quiet while receiving. */
  handshakeMs?: number;
  idleMs?: number;
  emit: (e: SendEvent) => void;
}

type SenderState = 'waiting' | 'sending' | 'done' | 'burned' | 'stopped';

export class ShareSender {
  private state: SenderState = 'waiting';
  private wrong = 0;
  private readonly open = new Set<Wire>();
  private readonly maxOpen: number;
  private readonly handshakeMs: number;
  private readonly idleMs: number;

  constructor(private readonly o: SenderOptions) {
    this.maxOpen = o.maxOpen ?? 4;
    this.handshakeMs = o.handshakeMs ?? 20_000;
    this.idleMs = o.idleMs ?? 30_000;
  }

  get finished(): boolean {
    return this.state === 'done' || this.state === 'burned' || this.state === 'stopped';
  }

  /** Whether somebody with the right code is receiving the drawing right now. */
  get busy(): boolean {
    return this.state === 'sending';
  }

  /** How many wrong tries have been made. */
  get wrongTries(): number {
    return this.wrong;
  }

  /** Hands over a new incoming connection. */
  accept(stream: ShareStream): void {
    const bind = channelBinding(stream);
    if (this.state !== 'waiting' || !bind || this.open.size >= this.maxOpen) {
      try {
        stream.destroy();
      } catch {
        // Gone already.
      }
      return;
    }

    let step: 'hello' | 'confirm' | 'sent' = 'hello';
    let spake: Spake2 | null = null;
    let result: ReturnType<Spake2['finish']> = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let verified = false;

    const wire: Wire = new Wire(
      stream,
      (type, payload) => {
        if (step === 'hello') {
          if (type !== T.HELLO || payload.length !== 66 || payload[0] !== VERSION) return wire.destroy();
          spake = new Spake2({ role: 'B', w: this.o.w, idA: ID_RECEIVER, idB: ID_SENDER, aad: bind });
          result = spake.finish(payload.subarray(1));
          if (!result) return wire.destroy();
          step = 'confirm';
          wire.send(T.REPLY, Buffer.concat([Buffer.from([VERSION]), spake.message]));
          return;
        }
        if (step === 'confirm') {
          if (type !== T.CONFIRM_A || !result) return wire.destroy();
          if (!result.verify(payload)) {
            // One guess used. They get nothing back: not even our own confirmation, which would let them test offline.
            wire.destroy();
            this.wrongTry();
            return;
          }
          if (this.state !== 'waiting') return wire.destroy();
          verified = true;
          if (timer) clearTimeout(timer);
          wire.max = POST_AUTH_MAX;
          wire.send(T.CONFIRM_B, result.confirm);
          this.state = 'sending';
          // Nobody else can be mid-handshake now: one drawing goes to one person.
          for (const other of [...this.open]) if (other !== wire) other.destroy();
          step = 'sent';
          this.o.emit({ type: 'connected' });
          void this.transfer(wire);
          return;
        }
        // After the drawing: the only thing left to hear is that it arrived.
        if (type === T.DONE && step === 'sent' && this.state === 'sending') {
          this.state = 'done';
          this.o.emit({ type: 'sent' });
          wire.destroy();
        } else {
          wire.destroy();
        }
      },
      () => {
        this.open.delete(wire);
        if (timer) clearTimeout(timer);
        // The right person left before it finished: the code is still good, so go back to waiting.
        if (verified && this.state === 'sending') {
          this.state = 'waiting';
          this.o.emit({ type: 'dropped' });
        }
      },
    );
    this.open.add(wire);
    // A connection that does not get through in time, or goes quiet while receiving, is let go. Not a wrong try.
    const started = Date.now();
    const watch = () => {
      if (wire.closed) return;
      const limit = verified ? this.idleMs : this.handshakeMs;
      const age = verified ? Date.now() - wire.idleSince : Date.now() - started;
      if (age >= limit) return wire.destroy();
      timer = setTimeout(watch, Math.max(10, Math.min(limit - age, 1000)));
    };
    timer = setTimeout(watch, Math.min(this.handshakeMs, 1000));
  }

  private wrongTry(): void {
    if (this.state !== 'waiting') return;
    this.wrong++;
    const left = Math.max(0, this.o.maxWrong - this.wrong);
    if (left === 0) {
      this.state = 'burned';
      this.closeAll();
      this.o.emit({ type: 'burned' });
    } else {
      this.o.emit({ type: 'wrong', tries: this.wrong, left });
    }
  }

  private async transfer(wire: Wire): Promise<void> {
    const total = this.o.bytes.length;
    const head = Buffer.alloc(4);
    head.writeUInt32BE(total, 0);
    wire.send(T.OFFER, head);
    for (let at = 0; at < total && !wire.closed; at += CHUNK) {
      const ok = wire.send(T.DATA, this.o.bytes.subarray(at, Math.min(total, at + CHUNK)));
      this.o.emit({ type: 'progress', done: Math.min(total, at + CHUNK), total });
      if (!ok) await wire.drained();
    }
  }

  private closeAll(): void {
    for (const w of [...this.open]) w.destroy();
  }

  /** Stops listening and lets every connection go. Safe to call twice. */
  stop(): void {
    if (this.state === 'waiting' || this.state === 'sending') {
      this.state = 'stopped';
      this.o.emit({ type: 'stopped' });
    }
    this.closeAll();
  }
}

// --------------------------------------------------------------------------------------------------- the receiver

export interface ReceiverOptions {
  w: bigint;
  /** Handshakes this side will start with a confirmation, in all. Each one hands the other end one guess, so it is capped. */
  maxTries: number;
  maxBytes?: number;
  handshakeMs?: number;
  idleMs?: number;
  emit: (e: ReceiveEvent) => void;
}

type ReceiverState = 'looking' | 'receiving' | 'done' | 'refused' | 'stopped';

export class ShareReceiver {
  private state: ReceiverState = 'looking';
  private tries = 0;
  private readonly open = new Set<Wire>();
  private readonly maxBytes: number;
  private readonly handshakeMs: number;
  private readonly idleMs: number;

  constructor(private readonly o: ReceiverOptions) {
    this.maxBytes = o.maxBytes ?? MAX_BYTES;
    this.handshakeMs = o.handshakeMs ?? 20_000;
    this.idleMs = o.idleMs ?? 30_000;
  }

  get finished(): boolean {
    return this.state === 'done' || this.state === 'refused' || this.state === 'stopped';
  }

  get triesUsed(): number {
    return this.tries;
  }

  /** Whether the right sender has been found and the drawing is coming. */
  get receiving(): boolean {
    return this.state === 'receiving';
  }

  /** Hands over a connection that was opened towards the sender. */
  attach(stream: ShareStream): void {
    const bind = channelBinding(stream);
    if (this.state !== 'looking' || !bind) {
      try {
        stream.destroy();
      } catch {
        // Gone already.
      }
      return;
    }

    const spake = new Spake2({ role: 'A', w: this.o.w, idA: ID_RECEIVER, idB: ID_SENDER, aad: bind });
    let result: ReturnType<Spake2['finish']> = null;
    let step: 'reply' | 'confirm' | 'offer' | 'data' | 'done' = 'reply';
    let sentConfirm = false;
    let total = 0;
    let got = 0;
    let chunks: Buffer[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();

    const wire: Wire = new Wire(
      stream,
      (type, payload) => {
        if (step === 'reply') {
          if (type !== T.REPLY || payload.length !== 66 || payload[0] !== VERSION) return wire.destroy();
          result = spake.finish(payload.subarray(1));
          if (!result) return wire.destroy();
          // This is the moment the other end gets a guess to test, so it is the moment that is counted.
          if (this.tries >= this.o.maxTries) return wire.destroy();
          this.tries++;
          sentConfirm = true;
          step = 'confirm';
          this.o.emit({ type: 'checking' });
          wire.send(T.CONFIRM_A, result.confirm);
          return;
        }
        if (step === 'confirm') {
          if (type !== T.CONFIRM_B || !result || !result.verify(payload)) return wire.destroy();
          this.state = 'receiving';
          wire.max = POST_AUTH_MAX;
          step = 'offer';
          // Anybody else we were talking to is no longer wanted.
          for (const other of [...this.open]) if (other !== wire) other.destroy();
          return;
        }
        if (step === 'offer') {
          if (type !== T.OFFER || payload.length !== 4) return wire.destroy();
          total = payload.readUInt32BE(0);
          if (total === 0 || total > this.maxBytes) return wire.destroy();
          step = 'data';
          this.o.emit({ type: 'progress', done: 0, total });
          return;
        }
        if (step === 'data') {
          if (type !== T.DATA || got + payload.length > total) return wire.destroy();
          chunks.push(payload);
          got += payload.length;
          this.o.emit({ type: 'progress', done: got, total });
          if (got === total) {
            step = 'done';
            const bytes = new Uint8Array(Buffer.concat(chunks));
            chunks = [];
            this.state = 'done';
            wire.send(T.DONE);
            this.o.emit({ type: 'received', bytes });
            // Let the DONE reach the sender before the connection goes.
            setTimeout(() => wire.destroy(), 200);
          }
          return;
        }
        wire.destroy();
      },
      () => {
        this.open.delete(wire);
        if (timer) clearTimeout(timer);
        if (step === 'done' || this.finished) return;
        if (step === 'confirm' && sentConfirm) {
          // We showed our confirmation and were not shown theirs: wrong code, or a sender that gave up on us.
          const left = Math.max(0, this.o.maxTries - this.tries);
          if (left === 0) {
            this.state = 'refused';
            this.o.emit({ type: 'refused' });
          } else {
            this.o.emit({ type: 'wrong', tries: this.tries, left });
          }
        } else if (step === 'offer' || step === 'data') {
          // Right person, but the connection broke part-way. Looking again is safe: the code is still the code.
          this.state = 'looking';
          this.o.emit({ type: 'dropped' });
        }
      },
    );
    this.open.add(wire);
    wire.send(T.HELLO, Buffer.concat([Buffer.from([VERSION]), spake.message]));

    const watch = () => {
      if (wire.closed) return;
      const limit = this.state === 'receiving' ? this.idleMs : this.handshakeMs;
      const age = this.state === 'receiving' ? Date.now() - wire.idleSince : Date.now() - started;
      if (age >= limit) return wire.destroy();
      timer = setTimeout(watch, Math.max(10, Math.min(limit - age, 1000)));
    };
    timer = setTimeout(watch, Math.min(this.handshakeMs, 1000));
  }

  /** Stops, and lets every connection go. Safe to call twice. */
  stop(): void {
    if (!this.finished) {
      this.state = 'stopped';
      this.o.emit({ type: 'stopped' });
    }
    for (const w of [...this.open]) w.destroy();
  }
}
