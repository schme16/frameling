// What is kept, already encoded, so a reviewer who joins (or falls behind) can be brought up to date without bothering the
// drawing window: the latest whole drawing, the patches that followed it, and the latest of each slot. Once the patches since
// the last whole drawing weigh more than the drawing itself, a fresh whole one is cheaper to send than the trail, so the
// cache says "refresh" and the drawing window is asked for one (which every reviewer then gets in order).
import type { LaneId } from './lanes';

export class Replay {
  private doc: Uint8Array | null = null;
  private tail: Uint8Array[] = [];
  private tailBytes = 0;
  private slots = new Map<LaneId, Uint8Array>();

  /** True once a whole drawing has been seen: before that there is nothing to catch anybody up with. */
  get ready(): boolean {
    return this.doc !== null;
  }

  /** The whole drawing, and how big the patches since are (for the tests and the numbers). */
  get sizes(): { doc: number; tail: number } {
    return { doc: this.doc?.byteLength ?? 0, tail: this.tailBytes };
  }

  /** A whole drawing or a patch went out, encoded. Returns true when the trail has got heavier than the drawing. */
  ordered(kind: 'doc' | 'patch', bytes: Uint8Array): boolean {
    if (kind === 'doc') {
      this.doc = bytes;
      this.tail = [];
      this.tailBytes = 0;
      return false;
    }
    if (!this.doc) return false;
    this.tail.push(bytes);
    this.tailBytes += bytes.byteLength;
    return this.tailBytes > this.doc.byteLength;
  }

  slot(lane: LaneId, bytes: Uint8Array | null): void {
    if (bytes) this.slots.set(lane, bytes);
    else this.slots.delete(lane);
  }

  /** The drawing and what followed it, in the order to send them. */
  catchUp(): Uint8Array[] {
    return this.doc ? [this.doc, ...this.tail] : [];
  }

  /** The slots worth sending to somebody who has just joined (a stroke in progress is not one: it arrives as a patch). */
  latestSlots(): { lane: LaneId; bytes: Uint8Array }[] {
    return (['look', 'live', 'ink'] as LaneId[]).flatMap((lane) => {
      const bytes = this.slots.get(lane);
      return bytes ? [{ lane, bytes }] : [];
    });
  }

  clear(): void {
    this.doc = null;
    this.tail = [];
    this.tailBytes = 0;
    this.slots.clear();
  }
}
