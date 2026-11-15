// What goes down the one ordered stream to a reviewer, and in what order. The stream has no unreliable channel, so "lossy"
// is done here, by the sender: a slot holds the latest thing and a newer one replaces it, it is not queued behind it.
//
//   urgent    small things that must not wait behind a drawing: acknowledgements, the admit, the goodbye
//   pointer   the sharer's pointer: one slot, only the newest is ever sent
//   ordered   the drawing itself (a whole drawing, then patches): every one goes, in order
//   slots     the stroke in progress, a half-done move, the look: latest wins, a missed one costs nothing
//
// Big messages are cut into chunks, and between two chunks the scheduler may send something from a more urgent lane, so a
// pointer never waits for a whole drawing to finish. A reviewer that falls behind is not sent the backlog: it is sent a
// whole drawing and what followed it (`catchUp`), which is always the smaller thing to send.
//
// Pure: it only hands out frames. The writer loop is in live.ts (it writes while the stream has room, waits for `drain`).

/** The most data in one chunk. Small enough that a pointer waits for at most one of them. */
export const CHUNK_BYTES = 16 * 1024;

export type LaneId = 'urgent' | 'pointer' | 'ordered' | 'ink' | 'live' | 'pixels' | 'look';
const LANE_CODES: Record<LaneId, number> = { urgent: 0, pointer: 1, ordered: 2, ink: 3, live: 4, pixels: 5, look: 6 };
const LANE_NAMES = Object.fromEntries(Object.entries(LANE_CODES).map(([k, v]) => [v, k])) as Record<number, LaneId>;
const SLOTS: LaneId[] = ['ink', 'live', 'pixels', 'look'];

/** One chunk as it goes on the stream: lane, message number, flags (1 = first, 2 = last), then the data. */
export interface Chunk {
  lane: LaneId;
  id: number;
  first: boolean;
  last: boolean;
  data: Uint8Array;
}

export const HEAD_BYTES = 6;

export function chunkToBytes(c: Chunk): Uint8Array {
  const out = new Uint8Array(HEAD_BYTES + c.data.byteLength);
  out[0] = LANE_CODES[c.lane];
  new DataView(out.buffer).setUint32(1, c.id >>> 0);
  out[5] = (c.first ? 1 : 0) | (c.last ? 2 : 0);
  out.set(c.data, HEAD_BYTES);
  return out;
}

export function chunkFromBytes(b: Uint8Array): Chunk | null {
  if (b.byteLength < HEAD_BYTES) return null;
  const lane = LANE_NAMES[b[0]];
  if (!lane) return null;
  return { lane, id: new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(1), first: !!(b[5] & 1), last: !!(b[5] & 2), data: b.subarray(HEAD_BYTES) };
}

interface Msg {
  id: number;
  bytes: Uint8Array;
}

export class Lanes {
  private nextId = 1;
  private urgent: Msg[] = [];
  private pointer: Msg | null = null;
  private ordered: Msg[] = [];
  private slots = new Map<LaneId, Msg>();
  /** The message partly sent in each lane (only the lanes that can be long: ordered and the slots). */
  private flying = new Map<LaneId, { msg: Msg; at: number }>();
  /** Alternates between the drawing and the slots, so neither starves the other. */
  private turn = 0;
  /** How many bytes wait in the ordered lane (the part not sent yet), for deciding to catch up. */
  orderedBytes = 0;

  private msg(bytes: Uint8Array): Msg {
    return { id: this.nextId++, bytes };
  }

  sendUrgent(bytes: Uint8Array): void {
    if (bytes.byteLength > CHUNK_BYTES) throw new Error('urgent messages are small');
    this.urgent.push(this.msg(bytes));
  }

  /** The sharer's pointer. Replaces one that has not gone yet. */
  setPointer(bytes: Uint8Array): void {
    if (bytes.byteLength > CHUNK_BYTES) throw new Error('a pointer is small');
    this.pointer = this.msg(bytes);
  }

  sendOrdered(bytes: Uint8Array): void {
    this.ordered.push(this.msg(bytes));
    this.orderedBytes += bytes.byteLength;
  }

  /** The latest of something. Replaces one not sent yet; one half sent is finished (a receiver cannot be left with half). */
  setSlot(lane: 'ink' | 'live' | 'pixels' | 'look', bytes: Uint8Array): void {
    this.slots.set(lane, this.msg(bytes));
  }

  /** Throws away the drawing backlog (and any slot waiting) and puts the given messages in its place, in order. */
  catchUp(messages: readonly Uint8Array[]): void {
    this.ordered = [];
    this.orderedBytes = 0;
    this.flying.delete('ordered');
    this.slots.clear();
    for (const m of messages) this.sendOrdered(m);
  }

  get idle(): boolean {
    return !this.urgent.length && !this.pointer && !this.ordered.length && !this.slots.size && !this.flying.size;
  }

  /** The next chunk to write, or null when there is nothing. */
  next(): Chunk | null {
    const u = this.urgent[0];
    if (u) return this.take('urgent', u, () => this.urgent.shift());
    if (this.pointer) {
      const p = this.pointer;
      return this.take('pointer', p, () => void (this.pointer = null));
    }
    // A message that is partly sent goes on first in its own lane: chunks of one message are not mixed with another's in that lane.
    const order: ('ordered' | 'slots')[] = this.turn++ % 2 ? ['slots', 'ordered'] : ['ordered', 'slots'];
    for (const which of order) {
      const c = which === 'ordered' ? this.nextOrdered() : this.nextSlot();
      if (c) return c;
    }
    return null;
  }

  private nextOrdered(): Chunk | null {
    const f = this.flying.get('ordered');
    const m = f?.msg ?? this.ordered[0];
    if (!m) return null;
    return this.take('ordered', m, () => {
      this.ordered.shift();
    });
  }

  private nextSlot(): Chunk | null {
    for (const lane of SLOTS) {
      const f = this.flying.get(lane);
      const m = f?.msg ?? this.slots.get(lane);
      if (!m) continue;
      return this.take(lane, m, () => void (this.slots.get(lane) === m && this.slots.delete(lane)));
    }
    return null;
  }

  private take(lane: LaneId, m: Msg, done: () => void): Chunk {
    const f = this.flying.get(lane);
    const at = f && f.msg === m ? f.at : 0;
    const end = Math.min(m.bytes.byteLength, at + CHUNK_BYTES);
    const first = at === 0;
    const last = end >= m.bytes.byteLength;
    const chunk: Chunk = { lane, id: m.id, first, last, data: m.bytes.subarray(at, end) };
    if (lane === 'ordered') this.orderedBytes -= end - at;
    if (last) {
      this.flying.delete(lane);
      done();
    } else this.flying.set(lane, { msg: m, at: end });
    return chunk;
  }
}

/** Puts chunks back together. One message at a time per lane: a new first chunk drops a half message of that lane. */
export class Reassembler {
  private parts = new Map<LaneId, { id: number; pieces: Uint8Array[]; size: number }>();

  constructor(private maxBytes: number) {}

  /** A whole message when this chunk finishes one, otherwise null. Throws on a chunk that cannot belong anywhere. */
  push(c: Chunk): { lane: LaneId; bytes: Uint8Array } | null {
    if (c.first) {
      if (c.last) {
        this.parts.delete(c.lane);
        return { lane: c.lane, bytes: c.data };
      }
      this.parts.set(c.lane, { id: c.id, pieces: [c.data], size: c.data.byteLength });
      return null;
    }
    const p = this.parts.get(c.lane);
    // A chunk of a message whose start we dropped (a replaced slot): nothing to do with it.
    if (!p || p.id !== c.id) return null;
    p.pieces.push(c.data);
    p.size += c.data.byteLength;
    if (p.size > this.maxBytes) throw new Error('message too big');
    if (!c.last) return null;
    this.parts.delete(c.lane);
    const out = new Uint8Array(p.size);
    let at = 0;
    for (const piece of p.pieces) {
      out.set(piece, at);
      at += piece.byteLength;
    }
    return { lane: c.lane, bytes: out };
  }
}
