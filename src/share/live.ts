// The live link for a review: the same short code and password handshake as sending a copy (spake2.ts, protocol.ts), and after
// it, instead of one drawing and goodbye, a conversation that lasts. The host is the sharer; up to four guests (reviewers) can
// be let in. Everything after the handshake is framed, chunked and prioritised by src/review/lanes.ts; this file only moves
// frames and knows nothing about drawings. What the bytes mean is for the main process (src/main/review.ts).
//
//   guest                              host
//   HELLO  pA              ----->
//                          <-----   REPLY  pB
//   CONFIRM cA             ----->   (a wrong one counts as a wrong try and ends here)
//                          <-----   CONFIRM cB
//   JOIN {name, gid}       ----->   (the sharer is asked; a returning guest is let straight back in)
//                          <-----   ADMIT seat   or   REFUSE why
//   MSG chunks, PING       <---->
//
// Limits live here, as they do in protocol.ts: wrong tries, half-open connections, how long a handshake and a silence may take,
// how long a person may be left knocking, and how big one chunk and one message may be.
import { Lanes, Reassembler, chunkFromBytes, chunkToBytes, CHUNK_BYTES, HEAD_BYTES, type LaneId } from '../review/lanes';
import { MAX_REVIEWERS } from '../review/wire';
import { cleanReviewerName } from '../audience/cleanText';
import { MAX_WRONG, formatCode, makeCode, type ShareCode } from './code';
import { ID_RECEIVER, ID_SENDER, secretToW, topicFor } from './derive';
import { channelBinding, POST_AUTH_MAX, T as OLD, Wire, type ShareStream } from './protocol';
import { Spake2 } from './spake2';
import type { MakeSwarm, SwarmLike } from './swarm';

/** The handshake's version byte for a live review. A copy's is 1, so each refuses the other's connection without counting a wrong try. */
export const LIVE_VERSION = 2;
const T = { ...OLD, JOIN: 8, ADMIT: 9, REFUSE: 10, MSG: 11, PING: 12 } as const;

/** The most one message may weigh once put back together. */
export const MAX_MESSAGE = 512 * 1024 * 1024;
/** A frame after the handshake: a chunk and its small head. */
const FRAME_MAX = Math.max(POST_AUTH_MAX, CHUNK_BYTES + HEAD_BYTES + 64);
const PING_EVERY_MS = 5000;

export interface LiveTimes {
  /** To prove the code. */
  handshakeMs: number;
  /** Silence, either way, before the link counts as dropped. */
  idleMs: number;
  /** How long somebody may be left knocking before the answer is no. */
  knockMs: number;
}
export const LIVE_TIMES: LiveTimes = { handshakeMs: 20_000, idleMs: 20_000, knockMs: 3 * 60_000 };

/** Writes what the lanes hand out, while the stream has room, and waits for it to drain when it does not. */
class Pump {
  private running = false;
  constructor(
    private wire: Wire,
    readonly lanes: Lanes,
  ) {}
  kick(): void {
    if (this.running || this.wire.closed) return;
    this.running = true;
    void this.run();
  }
  private async run(): Promise<void> {
    try {
      while (!this.wire.closed) {
        const c = this.lanes.next();
        if (!c) break;
        if (!this.wire.send(T.MSG, chunkToBytes(c))) await this.wire.drained();
      }
    } finally {
      this.running = false;
    }
  }
}

// ----------------------------------------------------------------------------------------------------------- the host

export type HostEvent =
  | { type: 'wrong'; tries: number; left: number }
  | { type: 'burned' }
  /** Somebody with the right code is asking in. Answer with `admit(conn)` or `refuse(conn)`. */
  | { type: 'knock'; conn: number; name: string }
  /** A guest has a seat (new, or back after a drop). */
  | { type: 'seated'; seat: number; name: string; returning: boolean }
  /** A seated guest's link dropped. The seat is kept for them for this review. */
  | { type: 'left'; seat: number; name: string }
  /** A knock that ended without a seat. */
  | { type: 'turnedAway'; name: string; why: 'refused' | 'full' | 'gone' | 'timeout' };

export interface LiveHostOptions {
  w: bigint;
  maxWrong?: number;
  maxOpen?: number;
  times?: Partial<LiveTimes>;
  emit: (e: HostEvent) => void;
  /** A whole message arrived from a guest. */
  onMessage: (seat: number, lane: LaneId, bytes: Uint8Array) => void;
}

interface Seat {
  seat: number;
  gid: string;
  name: string;
  /** Null while the link is down. */
  pump: Pump | null;
  wire: Wire | null;
}

interface Knocker {
  conn: number;
  name: string;
  gid: string;
  wire: Wire;
  timer: ReturnType<typeof setTimeout>;
}

export class LiveHost {
  private wrong = 0;
  private burned = false;
  private stopped = false;
  private readonly open = new Set<Wire>();
  private readonly seats: (Seat | null)[] = Array.from({ length: MAX_REVIEWERS }, () => null);
  private readonly knocking = new Map<number, Knocker>();
  /** For a knocking connection: what to do once it has a seat (so its reading side starts taking messages). */
  private readonly binders = new Map<Wire, (s: Seat) => void>();
  private nextConn = 1;
  private readonly t: LiveTimes;
  private readonly maxOpen: number;

  constructor(private readonly o: LiveHostOptions) {
    this.t = { ...LIVE_TIMES, ...o.times };
    this.maxOpen = o.maxOpen ?? 8;
  }

  get finished(): boolean {
    return this.stopped;
  }

  /** Seats with a link up right now. */
  get present(): { seat: number; name: string }[] {
    return this.seats.flatMap((s) => (s?.pump ? [{ seat: s.seat, name: s.name }] : []));
  }

  /** Every seat ever given in this review, linked or not. */
  get seated(): { seat: number; name: string; linked: boolean }[] {
    return this.seats.flatMap((s) => (s ? [{ seat: s.seat, name: s.name, linked: !!s.pump }] : []));
  }

  accept(stream: ShareStream): void {
    const bind = channelBinding(stream);
    if (this.stopped || this.burned || !bind || this.open.size >= this.maxOpen) {
      try {
        stream.destroy();
      } catch {
        // Gone already.
      }
      return;
    }
    let step: 'hello' | 'confirm' | 'join' | 'in' = 'hello';
    let result: ReturnType<Spake2['finish']> = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let verified = false;
    let seat: Seat | null = null;
    let reasm: Reassembler | null = null;
    let conn = 0;

    const wire: Wire = new Wire(
      stream,
      (type, payload) => {
        if (step === 'hello') {
          if (type !== T.HELLO || payload.length !== 66 || payload[0] !== LIVE_VERSION) return wire.destroy();
          const spake = new Spake2({ role: 'B', w: this.o.w, idA: ID_RECEIVER, idB: ID_SENDER, aad: bind });
          result = spake.finish(payload.subarray(1));
          if (!result) return wire.destroy();
          step = 'confirm';
          wire.send(T.REPLY, Buffer.concat([Buffer.from([LIVE_VERSION]), spake.message]));
          return;
        }
        if (step === 'confirm') {
          if (type !== T.CONFIRM_A || !result) return wire.destroy();
          if (!result.verify(payload)) {
            // One guess used. They get nothing back, not even our own confirmation, which would let them test offline.
            wire.destroy();
            this.wrongTry();
            return;
          }
          if (this.stopped || this.burned) return wire.destroy();
          verified = true;
          wire.max = FRAME_MAX;
          wire.send(T.CONFIRM_B, result.confirm);
          step = 'join';
          return;
        }
        if (type === T.PING) return;
        if (step === 'join') {
          if (type !== T.JOIN) return wire.destroy();
          let j: { name?: unknown; gid?: unknown };
          try {
            j = JSON.parse(payload.toString('utf8'));
          } catch {
            return wire.destroy();
          }
          const gid = typeof j.gid === 'string' && /^[\w.:-]{1,64}$/.test(j.gid) ? j.gid : null;
          if (!gid) return wire.destroy();
          const name = cleanReviewerName(j.name);
          conn = this.nextConn++;
          const back = this.seats.find((s) => s?.gid === gid) ?? null;
          if (back) {
            // Somebody who was let in and dropped: no second question.
            back.wire?.destroy();
            this.seat(back, wire, name, true);
            seat = back;
            step = 'in';
            reasm = new Reassembler(MAX_MESSAGE);
            return;
          }
          const free = this.seats.findIndex((s) => s === null);
          if (free < 0) {
            wire.send(T.REFUSE, Buffer.from('full'));
            this.o.emit({ type: 'turnedAway', name, why: 'full' });
            setTimeout(() => wire.destroy(), 200);
            return;
          }
          const k: Knocker = {
            conn,
            name,
            gid,
            wire,
            timer: setTimeout(() => this.turnAway(conn, 'timeout'), this.t.knockMs),
          };
          this.knocking.set(conn, k);
          this.o.emit({ type: 'knock', conn, name });
          return;
        }
        if (step === 'in' && seat && type === T.MSG) {
          const c = chunkFromBytes(payload);
          if (!c) return wire.destroy();
          try {
            const whole = reasm!.push(c);
            if (whole) this.o.onMessage(seat.seat, whole.lane, whole.bytes);
          } catch {
            wire.destroy();
          }
          return;
        }
        // Anything else after the handshake is ignored.
      },
      () => {
        this.open.delete(wire);
        this.binders.delete(wire);
        if (timer) clearTimeout(timer);
        for (const [id, k] of this.knocking)
          if (k.wire === wire) {
            clearTimeout(k.timer);
            this.knocking.delete(id);
            this.o.emit({ type: 'turnedAway', name: k.name, why: 'gone' });
          }
        if (seat && seat.wire === wire) {
          seat.wire = null;
          seat.pump = null;
          this.o.emit({ type: 'left', seat: seat.seat, name: seat.name });
        }
      },
    );
    this.open.add(wire);
    this.binders.set(wire, (s) => {
      seat = s;
      step = 'in';
      reasm = new Reassembler(MAX_MESSAGE);
    });
    const started = Date.now();
    const watch = () => {
      if (wire.closed) return;
      const limit = verified ? this.t.idleMs : this.t.handshakeMs;
      const age = verified ? Date.now() - wire.idleSince : Date.now() - started;
      if (age >= limit) return wire.destroy();
      timer = setTimeout(watch, Math.max(10, Math.min(limit - age, 1000)));
    };
    timer = setTimeout(watch, Math.min(this.t.handshakeMs, 1000));
    const ping = setInterval(() => (wire.closed ? clearInterval(ping) : verified && wire.send(T.PING)), PING_EVERY_MS);
    wire.stream.on('close', () => clearInterval(ping));
  }

  private seat(s: Seat, wire: Wire, name: string, returning: boolean): void {
    s.wire = wire;
    s.name = name;
    s.pump = new Pump(wire, new Lanes());
    wire.send(T.ADMIT, Buffer.from([s.seat]));
    this.o.emit({ type: 'seated', seat: s.seat, name, returning });
  }

  /** Lets a knocking guest in. Returns the seat, or null when it could not be (they left, or the seats filled up meanwhile). */
  admit(conn: number): number | null {
    const k = this.knocking.get(conn);
    if (!k) return null;
    clearTimeout(k.timer);
    this.knocking.delete(conn);
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0 || k.wire.closed) {
      this.turnAway(conn, 'full', k);
      return null;
    }
    const s: Seat = { seat: free, gid: k.gid, name: k.name, pump: null, wire: null };
    this.seats[free] = s;
    this.seat(s, k.wire, k.name, false);
    this.binders.get(k.wire)?.(s);
    return free;
  }

  refuse(conn: number): void {
    this.turnAway(conn, 'refused');
  }

  private turnAway(conn: number, why: 'refused' | 'full' | 'timeout', known?: Knocker): void {
    const k = known ?? this.knocking.get(conn);
    if (!k) return;
    clearTimeout(k.timer);
    this.knocking.delete(conn);
    this.o.emit({ type: 'turnedAway', name: k.name, why });
    k.wire.send(T.REFUSE, Buffer.from(why === 'full' ? 'full' : 'no'));
    setTimeout(() => k.wire.destroy(), 200);
  }

  /** The people waiting to be let in. */
  get waiting(): { conn: number; name: string }[] {
    return [...this.knocking.values()].map((k) => ({ conn: k.conn, name: k.name }));
  }

  // What goes to a seat. All of it is a no-op while that seat's link is down: the replay cache brings them up to date on return.
  private pumpOf(seat: number): Pump | null {
    return this.seats[seat]?.pump ?? null;
  }
  sendUrgent(seat: number, b: Uint8Array): void {
    const p = this.pumpOf(seat);
    p?.lanes.sendUrgent(b);
    p?.kick();
  }
  sendOrdered(seat: number, b: Uint8Array): void {
    const p = this.pumpOf(seat);
    p?.lanes.sendOrdered(b);
    p?.kick();
  }
  setPointer(seat: number, b: Uint8Array): void {
    const p = this.pumpOf(seat);
    p?.lanes.setPointer(b);
    p?.kick();
  }
  setSlot(seat: number, lane: 'ink' | 'live' | 'pixels' | 'look', b: Uint8Array): void {
    const p = this.pumpOf(seat);
    p?.lanes.setSlot(lane, b);
    p?.kick();
  }
  catchUp(seat: number, messages: readonly Uint8Array[]): void {
    const p = this.pumpOf(seat);
    p?.lanes.catchUp(messages);
    p?.kick();
  }
  /** How many bytes of the drawing wait to go to a seat. */
  backlog(seat: number): number {
    return this.pumpOf(seat)?.lanes.orderedBytes ?? 0;
  }

  /** Lets one guest go (after a goodbye message has had time to arrive). */
  removeSeat(seat: number): void {
    const s = this.seats[seat];
    if (!s) return;
    this.seats[seat] = null;
    const w = s.wire;
    s.wire = null;
    s.pump = null;
    if (w) setTimeout(() => w.destroy(), 300);
  }

  private wrongTry(): void {
    if (this.stopped || this.burned) return;
    this.wrong++;
    const left = Math.max(0, (this.o.maxWrong ?? MAX_WRONG) - this.wrong);
    if (left === 0) {
      this.burned = true;
      // The door is shut to newcomers; the people already in stay in.
      for (const w of [...this.open]) if (![...this.seats].some((s) => s?.wire === w)) w.destroy();
      this.o.emit({ type: 'burned' });
    } else this.o.emit({ type: 'wrong', tries: this.wrong, left });
  }

  /** Stops, after letting goodbyes already queued go out. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const k of this.knocking.values()) clearTimeout(k.timer);
    this.knocking.clear();
    setTimeout(() => {
      for (const w of [...this.open]) w.destroy();
    }, 300);
  }
}

// ---------------------------------------------------------------------------------------------------------- the guest

export type GuestEvent =
  | { type: 'checking' }
  /** The code was right and the sharer has been asked. */
  | { type: 'knocking' }
  | { type: 'in'; seat: number }
  | { type: 'refused'; why: 'no' | 'full' }
  | { type: 'wrong'; tries: number; left: number }
  | { type: 'dropped' };

export interface LiveGuestOptions {
  w: bigint;
  name: string;
  gid: string;
  maxTries?: number;
  times?: Partial<LiveTimes>;
  emit: (e: GuestEvent) => void;
  onMessage: (lane: LaneId, bytes: Uint8Array) => void;
}

/** One connection's worth of the reviewer's end. A new one is made for each connection, and the lanes are the caller's. */
export class LiveGuest {
  private tries = 0;
  private pump: Pump | null = null;
  private readonly t: LiveTimes;
  private wire: Wire | null = null;
  state: 'idle' | 'checking' | 'knocking' | 'in' | 'over' = 'idle';

  constructor(private readonly o: LiveGuestOptions) {
    this.t = { ...LIVE_TIMES, ...o.times };
  }

  get triesUsed(): number {
    return this.tries;
  }

  /** What to send, once in. Everything is a no-op before then. */
  send(): Pump['lanes'] | null {
    return this.pump?.lanes ?? null;
  }
  kick(): void {
    this.pump?.kick();
  }

  attach(stream: ShareStream, lanes: Lanes): void {
    const bind = channelBinding(stream);
    if (this.state === 'in' || this.state === 'over' || !bind) {
      try {
        stream.destroy();
      } catch {
        // Gone already.
      }
      return;
    }
    const spake = new Spake2({ role: 'A', w: this.o.w, idA: ID_RECEIVER, idB: ID_SENDER, aad: bind });
    let result: ReturnType<Spake2['finish']> = null;
    let step: 'reply' | 'confirm' | 'admit' | 'in' = 'reply';
    let sentConfirm = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reasm = new Reassembler(MAX_MESSAGE);
    const started = Date.now();
    let verified = false;
    this.state = 'checking';

    const wire: Wire = new Wire(
      stream,
      (type, payload) => {
        if (step === 'reply') {
          if (type !== T.REPLY || payload.length !== 66 || payload[0] !== LIVE_VERSION) return wire.destroy();
          result = spake.finish(payload.subarray(1));
          if (!result) return wire.destroy();
          if (this.tries >= (this.o.maxTries ?? MAX_WRONG)) return wire.destroy();
          this.tries++;
          sentConfirm = true;
          step = 'confirm';
          this.o.emit({ type: 'checking' });
          wire.send(T.CONFIRM_A, result.confirm);
          return;
        }
        if (step === 'confirm') {
          if (type !== T.CONFIRM_B || !result || !result.verify(payload)) return wire.destroy();
          verified = true;
          wire.max = FRAME_MAX;
          step = 'admit';
          this.state = 'knocking';
          wire.send(T.JOIN, Buffer.from(JSON.stringify({ name: this.o.name, gid: this.o.gid })));
          this.o.emit({ type: 'knocking' });
          return;
        }
        if (type === T.PING) return;
        if (step === 'admit') {
          if (type === T.ADMIT && payload.length === 1) {
            step = 'in';
            this.state = 'in';
            this.pump = new Pump(wire, lanes);
            this.o.emit({ type: 'in', seat: payload[0] });
            // Whatever waited while the link was down goes now.
            this.pump.kick();
            return;
          }
          if (type === T.REFUSE) {
            this.state = 'over';
            this.o.emit({ type: 'refused', why: payload.toString('utf8') === 'full' ? 'full' : 'no' });
            wire.destroy();
            return;
          }
          return wire.destroy();
        }
        if (step === 'in' && type === T.MSG) {
          const c = chunkFromBytes(payload);
          if (!c) return wire.destroy();
          try {
            const whole = reasm.push(c);
            if (whole) this.o.onMessage(whole.lane, whole.bytes);
          } catch {
            wire.destroy();
          }
          return;
        }
        wire.destroy();
      },
      () => {
        if (timer) clearTimeout(timer);
        this.pump = null;
        if (this.state === 'over') return;
        if (step === 'confirm' && sentConfirm) {
          const left = Math.max(0, (this.o.maxTries ?? MAX_WRONG) - this.tries);
          this.state = 'idle';
          this.o.emit({ type: 'wrong', tries: this.tries, left });
        } else if (step === 'admit' || step === 'in') {
          this.state = 'idle';
          this.o.emit({ type: 'dropped' });
        } else this.state = 'idle';
      },
    );
    this.wire = wire;
    wire.send(T.HELLO, Buffer.concat([Buffer.from([LIVE_VERSION]), spake.message]));
    const watch = () => {
      if (wire.closed) return;
      // Knocking can take as long as the sharer takes to answer: the host keeps the link alive with pings.
      const limit = verified ? this.t.idleMs : this.t.handshakeMs;
      const age = verified ? Date.now() - wire.idleSince : Date.now() - started;
      if (age >= limit) return wire.destroy();
      timer = setTimeout(watch, Math.max(10, Math.min(limit - age, 1000)));
    };
    timer = setTimeout(watch, Math.min(this.t.handshakeMs, 1000));
    const ping = setInterval(() => (wire.closed ? clearInterval(ping) : verified && wire.send(T.PING)), PING_EVERY_MS);
    stream.on('close', () => clearInterval(ping));
  }

  /** Leaves: the link is let go and nothing comes back. */
  leave(): void {
    this.state = 'over';
    this.wire?.destroy();
  }
}

// ------------------------------------------------------------------------------------------------------------ the jobs

export type LiveHostJobEvent =
  | { type: 'starting' }
  | { type: 'ready'; code: string }
  | { type: 'offline' }
  | { type: 'stopped' }
  | HostEvent;

export interface LiveHostJob {
  host: LiveHost | null;
  cancel(): void;
}

export interface StartLiveHost {
  makeSwarm: MakeSwarm;
  emit: (e: LiveHostJobEvent) => void;
  onMessage: LiveHostOptions['onMessage'];
  announceMs?: number;
  maxWrong?: number;
  times?: Partial<LiveTimes>;
  /** Tests only. */
  code?: ShareCode;
}

/** Makes a code, announces it, and hands every connection to a LiveHost. The code lasts as long as the review does. */
export function startLiveHost(o: StartLiveHost): LiveHostJob {
  let over = false;
  let stopSwarm: () => void = () => {};
  const job: LiveHostJob = {
    host: null,
    cancel: () => {
      if (over) return;
      over = true;
      job.host?.stop();
      o.emit({ type: 'stopped' });
      setTimeout(stopSwarm, 400);
    },
  };
  void (async () => {
    o.emit({ type: 'starting' });
    const code = o.code ?? makeCode();
    let w: bigint;
    let swarm: SwarmLike;
    try {
      w = await secretToW(code);
      swarm = await o.makeSwarm();
    } catch {
      if (!over) o.emit({ type: 'offline' });
      return;
    }
    let gone = false;
    stopSwarm = () => {
      if (gone) return;
      gone = true;
      try {
        void Promise.resolve(swarm.destroy()).catch(() => {});
      } catch {
        // Down already.
      }
    };
    if (over) return stopSwarm();
    const host = new LiveHost({ w, maxWrong: o.maxWrong, times: o.times, emit: (e) => !over && o.emit(e), onMessage: o.onMessage });
    job.host = host;
    swarm.on('connection', (c) => host.accept(c));
    const discovery = swarm.join(topicFor(code), { client: false, server: true });
    const announced = await Promise.race([
      discovery.flushed().then(() => true, () => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), o.announceMs ?? 30_000)),
    ]);
    if (over) return;
    if (!announced) {
      over = true;
      o.emit({ type: 'offline' });
      host.stop();
      stopSwarm();
      return;
    }
    o.emit({ type: 'ready', code: formatCode(code) });
  })();
  return job;
}

export type LiveJoinEvent =
  | { type: 'starting' }
  | { type: 'looking' }
  | { type: 'offline' }
  | { type: 'noOne' }
  | { type: 'stopped' }
  /** The link broke and is being tried again. */
  | { type: 'retrying'; secondsLeft: number }
  | { type: 'lost' }
  | GuestEvent;

export interface LiveJoinJob {
  guest: LiveGuest | null;
  lanes: Lanes;
  cancel(): void;
}

export interface StartLiveJoin {
  code: ShareCode;
  name: string;
  gid: string;
  makeSwarm: MakeSwarm;
  emit: (e: LiveJoinEvent) => void;
  onMessage: (lane: LaneId, bytes: Uint8Array) => void;
  findMs?: number;
  retryMs?: number;
  times?: Partial<LiveTimes>;
}

/** Looks for the host by the code, proves it, and keeps trying again for a while if the link drops. */
export function startLiveJoin(o: StartLiveJoin): LiveJoinJob {
  let over = false;
  let stopSwarm: () => void = () => {};
  let findTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  const lanes = new Lanes();
  const job: LiveJoinJob = {
    guest: null,
    lanes,
    cancel: () => {
      if (over) return;
      over = true;
      if (findTimer) clearTimeout(findTimer);
      if (retryTimer) clearInterval(retryTimer);
      job.guest?.leave();
      o.emit({ type: 'stopped' });
      setTimeout(stopSwarm, 400);
    },
  };
  const finish = (e: LiveJoinEvent) => {
    if (over) return;
    over = true;
    if (findTimer) clearTimeout(findTimer);
    if (retryTimer) clearInterval(retryTimer);
    o.emit(e);
    setTimeout(stopSwarm, 400);
  };
  void (async () => {
    o.emit({ type: 'starting' });
    let w: bigint;
    let swarm: SwarmLike;
    try {
      w = await secretToW(o.code);
      swarm = await o.makeSwarm();
    } catch {
      return finish({ type: 'offline' });
    }
    let gone = false;
    stopSwarm = () => {
      if (gone) return;
      gone = true;
      try {
        void Promise.resolve(swarm.destroy()).catch(() => {});
      } catch {
        // Down already.
      }
    };
    if (over) return stopSwarm();
    let dropAt = 0;
    let everIn = false;
    const guest = new LiveGuest({
      w,
      name: o.name,
      gid: o.gid,
      times: o.times,
      onMessage: o.onMessage,
      emit: (e) => {
        if (over) return;
        if (e.type === 'in') {
          everIn = true;
          dropAt = 0;
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = null;
        }
        if (e.type === 'dropped' && everIn) startRetry();
        if (e.type === 'refused') return finish(e);
        o.emit(e);
      },
    });
    job.guest = guest;
    const retryMs = o.retryMs ?? 60_000;
    const startRetry = () => {
      if (retryTimer || over) return;
      dropAt = Date.now();
      retryTimer = setInterval(() => {
        const left = Math.ceil((retryMs - (Date.now() - dropAt)) / 1000);
        if (left <= 0) return finish({ type: 'lost' });
        o.emit({ type: 'retrying', secondsLeft: left });
      }, 1000);
      o.emit({ type: 'retrying', secondsLeft: Math.ceil(retryMs / 1000) });
    };
    swarm.on('connection', (c) => guest.attach(c, lanes));
    swarm.join(topicFor(o.code), { client: true, server: false });
    o.emit({ type: 'looking' });
    findTimer = setTimeout(() => {
      if (over || guest.state !== 'idle' || everIn) return;
      finish(guest.triesUsed > 0 ? { type: 'wrong', tries: guest.triesUsed, left: 0 } : { type: 'noOne' });
    }, o.findMs ?? 30_000);
  })();
  return job;
}
