// The sharer's side of a live review, in the main process and with no Electron in it (the ports and the compressor are handed
// in), so a whole review can be run in a test over the in-memory network.
//
//   drawing window ──(picture messages, the same ones the picture window gets)──> here
//   here: keep only what a reviewer may have (forReviewer), encode once, compress once, hand the same bytes to each seat
//   here <── a reviewer's words, read through the closed list (readFromReviewer) ── the live link
//   here ──(items, pointers, who is knocking)──> the drawing window's inbox
//
// Nothing a reviewer sends reaches the drawing from here: it goes to the drawing window as an event for its inbox, and the
// only way anything gets into the file is the sharer pressing Keep. This file does not know the store exists.
import type { ToPopout } from '../popout/protocol';
import { Encoder, decodePlain, encodePlain } from '../review/codec';
import { ReviewOut } from '../review/forReviewer';
import { Replay } from '../review/replay';
import { unwrapMessage, wrapMessage, type Squeeze } from '../review/pack';
import { itemId, readFromReviewer, type ReviewItem, type ToReviewer } from '../review/wire';
import { startLiveHost, type LiveHostJob, type LiveHostJobEvent, type StartLiveHost } from '../share/live';
import type { MakeSwarm } from '../share/swarm';

/** The least of a message port this needs: Electron's MessagePortMain is wrapped to look like it. */
export interface PortLike {
  postMessage(m: unknown): void;
  onMessage(fn: (m: unknown) => void): void;
  close(): void;
}

/** What the drawing window is told. */
export type HostUiEvent =
  | { type: 'starting' }
  | { type: 'ready'; code: string }
  | { type: 'offline' }
  | { type: 'stopped' }
  | { type: 'wrong'; tries: number; left: number }
  | { type: 'burned' }
  | { type: 'knock'; conn: number; name: string }
  | { type: 'seated'; seat: number; name: string; returning: boolean }
  | { type: 'left'; seat: number; name: string }
  | { type: 'turnedAway'; name: string; why: string }
  | { type: 'item'; seat: number; name: string; item: ReviewItem }
  | { type: 'pointer'; seat: number; n: number; x: number; y: number; off: boolean }
  | { type: 'done'; seat: number; name: string };

export interface HostDeps {
  makeSwarm: MakeSwarm;
  /** The end of the message port the drawing window's mirror talks to. */
  port: PortLike;
  ui: (e: HostUiEvent) => void;
  deflate: Squeeze;
  inflate: Squeeze;
  now?: () => number;
  /** The drawing's name, told to a reviewer on arrival (their window title). */
  sharerName: () => string;
  start?: typeof startLiveHost;
  /** Tests only. */
  times?: StartLiveHost['times'];
  code?: StartLiveHost['code'];
}

const asBytes = (m: unknown) => encodePlain(m);
/** A small message made ready to send with no compression and no waiting. */
const plain = (m: unknown): Uint8Array => {
  const raw = asBytes(m);
  const out = new Uint8Array(1 + raw.byteLength);
  out.set(raw, 1);
  return out;
};

type Kind = 'doc' | 'patch' | 'ink' | 'live' | 'pixels' | 'look';

export class ReviewHostBridge {
  private job: LiveHostJob | null = null;
  private readonly enc = new Encoder();
  private readonly out = new ReviewOut();
  private readonly replay = new Replay();
  private chain: Promise<void> = Promise.resolve();
  private inChain: Promise<void> = Promise.resolve();
  private names = new Map<number, string>();
  private pointerN = 0;
  private over = false;
  /** How many of each kind went to the link, for the numbers in the notes and the tests. */
  stats = { docs: 0, patches: 0, bytes: 0, catchUps: 0 };

  constructor(private readonly d: HostDeps) {
    d.port.onMessage((m) => this.fromDrawing(m));
  }

  get present(): number {
    return this.job?.host?.present.length ?? 0;
  }

  start(): void {
    const begin = this.d.start ?? startLiveHost;
    this.job = begin({
      makeSwarm: this.d.makeSwarm,
      times: this.d.times,
      code: this.d.code,
      emit: (e) => this.onHostEvent(e),
      onMessage: (seat, _lane, bytes) => this.fromReviewer(seat, bytes),
    });
  }

  admit(conn: number): void {
    this.job?.host?.admit(conn);
  }
  refuse(conn: number): void {
    this.job?.host?.refuse(conn);
  }

  /** Sends a goodbye and lets the seat go. */
  remove(seat: number): void {
    const h = this.job?.host;
    if (!h) return;
    h.sendUrgent(seat, plain({ t: 'bye', why: 'removed' } satisfies ToReviewer));
    h.removeSeat(seat);
    this.names.delete(seat);
  }

  /** The sharer's pointer, in stage pixels, to every reviewer. */
  pointer(x: number, y: number, off = false): void {
    const h = this.job?.host;
    if (!h || !this.present) return;
    const m = plain({ t: 'pointer', n: ++this.pointerN, x, y, ...(off ? { off: true } : {}) } satisfies ToReviewer);
    for (const p of h.present) h.setPointer(p.seat, m);
  }

  /** These items of a reviewer's are safe in the inbox. */
  ack(seat: number, ids: string[]): void {
    const h = this.job?.host;
    if (!h || !ids.length) return;
    for (let i = 0; i < ids.length; i += 100) h.sendUrgent(seat, plain({ t: 'ack', ids: ids.slice(i, i + 100) } satisfies ToReviewer));
  }

  /** Ends the review: reviewers are told, then everything is let go. */
  stop(): void {
    if (this.over) return;
    this.over = true;
    const h = this.job?.host;
    if (h) for (const p of h.present) h.sendUrgent(p.seat, plain({ t: 'bye', why: 'ended' } satisfies ToReviewer));
    this.job?.cancel();
    this.d.port.close();
  }

  // ------------------------------------------------------------------ from the drawing window

  private askWhole(): void {
    this.d.port.postMessage({ t: 'hello' });
  }

  private fromDrawing(m: unknown): void {
    if (this.over || typeof m !== 'object' || m === null) return;
    // With nobody in there is nothing to encode: the first person in asks for the drawing, which comes as a fresh whole one.
    if (!this.present) {
      this.replay.clear();
      this.enc.reset();
      return;
    }
    const msg = m as ToPopout;
    const mapped = this.out.map(msg);
    if (this.out.wantsWhole) {
      this.out.wantsWhole = false;
      this.askWhole();
    }
    if (!mapped) return;
    let raw: Uint8Array;
    try {
      raw = this.enc.encode(mapped as never);
    } catch {
      this.askWhole();
      return;
    }
    const kind = mapped.t as Kind;
    // Order is kept by one chain: compressing is asynchronous, and a patch must never overtake the drawing before it.
    this.chain = this.chain
      .then(async () => this.deliver(kind, await wrapMessage(raw, this.d.deflate)))
      .catch(() => this.askWhole());
  }

  private deliver(kind: Kind, bytes: Uint8Array): void {
    const h = this.job?.host;
    if (!h || this.over) return;
    this.stats.bytes += bytes.byteLength;
    if (kind === 'doc' || kind === 'patch') {
      this.stats[kind === 'doc' ? 'docs' : 'patches']++;
      const refresh = this.replay.ordered(kind, bytes);
      for (const p of h.present) {
        h.sendOrdered(p.seat, bytes);
        // Somebody far behind is not sent the backlog: they are sent the drawing and what followed it, which is less.
        const { doc } = this.replay.sizes;
        if (h.backlog(p.seat) > Math.max(1_000_000, doc * 2)) {
          this.stats.catchUps++;
          h.catchUp(p.seat, this.replay.catchUp());
        }
      }
      if (refresh) this.askWhole();
      return;
    }
    this.replay.slot(kind, bytes);
    for (const p of h.present) h.setSlot(p.seat, kind, bytes);
  }

  // ------------------------------------------------------------------ from the live link

  private onHostEvent(e: LiveHostJobEvent): void {
    switch (e.type) {
      case 'seated': {
        this.names.set(e.seat, e.name);
        const h = this.job!.host!;
        h.sendUrgent(e.seat, plain({ t: 'admitted', seat: e.seat, name: this.d.sharerName() } satisfies ToReviewer));
        this.bringUp(e.seat);
        this.d.ui(e);
        return;
      }
      case 'left':
        this.d.ui(e);
        return;
      default:
        this.d.ui(e as HostUiEvent);
    }
  }

  /** Gets a seat up to date: the drawing and what followed (or asks the drawing window for one), and the latest of the slots. */
  private bringUp(seat: number): void {
    const h = this.job?.host;
    if (!h) return;
    if (!this.replay.ready) {
      this.askWhole();
      return;
    }
    this.stats.catchUps++;
    h.catchUp(seat, this.replay.catchUp());
    for (const s of this.replay.latestSlots()) h.setSlot(seat, s.lane as 'ink' | 'live' | 'look', s.bytes);
  }

  private fromReviewer(seat: number, bytes: Uint8Array): void {
    this.inChain = this.inChain
      .then(async () => {
        const raw = decodePlain(await unwrapMessage(bytes, this.d.inflate));
        const m = readFromReviewer(raw, (this.d.now ?? Date.now)());
        if (!m) return;
        const name = this.names.get(seat) ?? 'Reviewer';
        switch (m.t) {
          case 'hello':
            this.bringUp(seat);
            return;
          case 'point':
            this.d.ui({ type: 'pointer', seat, n: m.n, x: m.x, y: m.y, off: m.off === true });
            return;
          case 'done':
            this.d.ui({ type: 'done', seat, name });
            return;
          case 'join':
            return;
          default:
            this.d.ui({ type: 'item', seat, name, item: m });
        }
      })
      .catch(() => undefined);
  }
}

export { itemId };
