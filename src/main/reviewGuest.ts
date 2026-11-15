// The reviewer's side of a live review, in the main process and with no Electron in it. It owns the link and the outbox, and
// hands the reviewer's window (which has no way to reach a network or a file) what to show:
//
//   the sharer ──(compressed, chunked)──> here: put back together, followed along, then posted to the window as the same
//                                         picture messages the picture window already understands, plus a few of its own
//   the window ──(a pointer, a note, a mark...)──> here: read through the closed list, kept in the outbox until the sharer
//                                         says it has it, and sent
//
// The window is sandboxed and has only this port. It never holds the link, so there is nothing in it that could send a
// document edit, and nothing here that would take one from it.
import { Decoder, encodePlain } from '../review/codec';
import { Outbox } from '../review/outbox';
import { unwrapMessage, wrapMessage, type Squeeze } from '../review/pack';
import { itemId, isToReviewer, readFromReviewer, type FromReviewer, type ReviewItem } from '../review/wire';
import { startLiveJoin, type LiveJoinEvent, type LiveJoinJob, type StartLiveJoin } from '../share/live';
import type { MakeSwarm } from '../share/swarm';
import type { ShareCode } from '../share/code';
import type { PortLike } from './reviewHost';

/** What the window is told about the link, besides the picture. */
export type GuestStatus =
  | { t: 'status'; state: 'starting' | 'looking' | 'checking' | 'knocking' | 'in' | 'offline' | 'noOne' | 'wrong' | 'refused' | 'full' | 'dropped' | 'lost' | 'stopped'; seat?: number; secondsLeft?: number; left?: number }
  /** How many things are waiting to be handed over, for the "waiting to send" chip. */
  | { t: 'waiting'; count: number };

export interface GuestDeps {
  makeSwarm: MakeSwarm;
  /** The end of the message port the reviewer's window talks to. */
  port: PortLike;
  code: ShareCode;
  name: string;
  gid: string;
  deflate: Squeeze;
  inflate: Squeeze;
  /** A copy of what is still waiting, kept on disk while the review lasts; null when there is nothing left. */
  keep?: (outbox: { waiting: ReviewItem[] } | null) => void;
  /** An outbox from a previous run of this same review, to carry on from. */
  resume?: Outbox;
  join?: typeof startLiveJoin;
  now?: () => number;
  times?: StartLiveJoin['times'];
  findMs?: number;
  retryMs?: number;
}

const plain = (m: unknown): Uint8Array => {
  const raw = encodePlain(m);
  const out = new Uint8Array(1 + raw.byteLength);
  out.set(raw, 1);
  return out;
};

export class ReviewGuestBridge {
  private job: LiveJoinJob | null = null;
  private readonly dec = new Decoder();
  readonly outbox: Outbox;
  private inChain: Promise<void> = Promise.resolve();
  private outChain: Promise<void> = Promise.resolve();
  private seat = -1;
  private linked = false;
  private done = false;
  private asked = false;
  /** The sharer said goodbye: what the window shows is that, not our own letting go. */
  private bye = false;

  constructor(private readonly d: GuestDeps) {
    this.outbox = d.resume ?? new Outbox();
    d.port.onMessage((m) => this.fromWindow(m));
  }

  /** Whether the link is up and the sharer has let this reviewer in. */
  get isIn(): boolean {
    return this.linked;
  }

  private tell(m: GuestStatus): void {
    this.d.port.postMessage(m);
  }

  start(): void {
    const begin = this.d.join ?? startLiveJoin;
    this.job = begin({
      code: this.d.code,
      name: this.d.name,
      gid: this.d.gid,
      makeSwarm: this.d.makeSwarm,
      times: this.d.times,
      findMs: this.d.findMs,
      retryMs: this.d.retryMs,
      emit: (e) => this.onEvent(e),
      onMessage: (_lane, bytes) => this.fromSharer(bytes),
    });
  }

  /** Leaves the review. What is still waiting stays in the outbox for "Save my comments". */
  leave(): void {
    this.job?.cancel();
  }

  private onEvent(e: LiveJoinEvent): void {
    switch (e.type) {
      case 'in':
        this.seat = e.seat;
        this.linked = true;
        this.asked = false;
        this.tell({ t: 'status', state: 'in', seat: e.seat });
        // Whatever was waiting while the link was down goes again: the sharer's side merges by id, so twice is harmless.
        this.sendPending();
        return;
      case 'dropped':
        this.linked = false;
        this.tell({ t: 'status', state: 'dropped' });
        return;
      case 'retrying':
        this.tell({ t: 'status', state: 'dropped', secondsLeft: e.secondsLeft });
        return;
      case 'lost':
        this.linked = false;
        this.tell({ t: 'status', state: 'lost' });
        return;
      case 'refused':
        this.tell({ t: 'status', state: e.why === 'full' ? 'full' : 'refused' });
        return;
      case 'wrong':
        this.tell({ t: 'status', state: 'wrong', left: e.left });
        return;
      case 'checking':
      case 'knocking':
      case 'looking':
      case 'offline':
      case 'noOne':
      case 'stopped':
      case 'starting':
        if (e.type === 'stopped' && this.bye) return;
        this.tell({ t: 'status', state: e.type });
        return;
    }
  }

  // ------------------------------------------------------------------ from the sharer

  private fromSharer(bytes: Uint8Array): void {
    this.inChain = this.inChain
      .then(async () => {
        const raw = await unwrapMessage(bytes, this.d.inflate);
        // The decoder follows the drawing along (pixel rectangles need it) and passes everything else through as it is.
        const m = this.dec.decode(raw);
        if (!isToReviewer(m)) return;
        if (m.t === 'ack') {
          this.outbox.ack(m.ids);
          this.d.keep?.(this.outbox.waiting ? this.outbox.toJSON() : null);
          this.tell({ t: 'waiting', count: this.outbox.waiting });
          this.d.port.postMessage(m);
          return;
        }
        if (m.t === 'bye') {
          this.bye = true;
          this.d.port.postMessage(m);
          this.job?.cancel();
          return;
        }
        this.d.port.postMessage(m);
      })
      .catch(() => this.askWhole());
  }

  /** Out of step: ask for the whole drawing, once until it arrives. */
  private askWhole(): void {
    if (this.asked || !this.linked) return;
    this.asked = true;
    this.dec.reset();
    this.sendNow({ t: 'hello' });
  }

  // ------------------------------------------------------------------ from the window

  private fromWindow(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    // The window can say only what a reviewer may say. A request to save is not a message to the sharer, so it is not here.
    const m = readFromReviewer(raw, (this.d.now ?? Date.now)());
    if (!m || m.t === 'join') return;
    switch (m.t) {
      case 'hello':
        // The window lost its place: the decoder starts over too, so the whole drawing is read as the first thing.
        this.asked = false;
        this.dec.reset();
        this.sendNow(m);
        return;
      case 'point':
        this.sendPointer(m);
        return;
      case 'done':
        this.sendNow(m);
        return;
      default: {
        // A note, an answer, a mark, a tick: kept until acknowledged. The window's own words are read again here, so what is
        // kept and sent is what the sharer's reader will see.
        this.outbox.add(m);
        this.d.keep?.(this.outbox.toJSON());
        this.tell({ t: 'waiting', count: this.outbox.waiting });
        this.sendItem(m);
      }
    }
  }

  private sendPending(): void {
    for (const i of this.outbox.pending()) this.sendItem(i);
    this.tell({ t: 'waiting', count: this.outbox.waiting });
  }

  private sendItem(i: ReviewItem): void {
    const j = this.job;
    if (!j?.guest || !this.linked) return;
    // Large (a long sketch) is compressed; small goes as it is. Either way it is in the ordered lane and never dropped, and an
    // answer never overtakes the note it answers.
    this.outChain = this.outChain
      .then(() => wrapMessage(encodePlain(i), this.d.deflate))
      .then((b) => {
        j.lanes.sendOrdered(b);
        j.guest?.kick();
      })
      .catch(() => undefined);
  }

  private sendNow(m: FromReviewer): void {
    const j = this.job;
    if (!j?.guest || !this.linked) return;
    j.lanes.sendUrgent(plain(m));
    j.guest.kick();
  }

  private sendPointer(m: FromReviewer): void {
    const j = this.job;
    if (!j?.guest || !this.linked) return;
    j.lanes.setPointer(plain(m));
    j.guest.kick();
  }
}

export { itemId };
