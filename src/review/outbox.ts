// The reviewer's side of "never lost". Everything a reviewer writes (a note, an answer, a mark, a tick) is kept here until the
// sharer's side says it has it. A dropped link costs nothing: what is still waiting goes again when the link comes back, and
// the sharer's side merges by id, so sending twice is harmless. The outbox can be written to a file and read back, which is
// what "Save my comments" and the copy on disk while the review lasts use.
import { itemId, type ReviewItem } from './wire';

export class Outbox {
  private items = new Map<string, ReviewItem>();
  /** Every id ever sent, so the list on screen still knows what was handed over. */
  private done = new Set<string>();

  /** Everything ever written in this review, in order, whether or not it has been handed over (for "Save my comments"). */
  private log = new Map<string, ReviewItem>();

  add(item: ReviewItem): void {
    this.items.set(itemId(item), item);
    this.log.set(itemId(item), item);
  }

  /** Everything written, handed over or not. */
  all(): ReviewItem[] {
    return [...this.log.values()];
  }

  /** The sharer's side has these. */
  ack(ids: readonly string[]): void {
    for (const id of ids) {
      if (this.items.delete(id)) this.done.add(id);
    }
  }

  /** What is still waiting, oldest first. */
  pending(): ReviewItem[] {
    return [...this.items.values()];
  }

  isPending(id: string): boolean {
    return this.items.has(id);
  }

  get waiting(): number {
    return this.items.size;
  }

  sent(id: string): boolean {
    return this.done.has(id);
  }

  /** Everything, for the file: what is waiting and what was acknowledged are told apart by the `waiting` flag. */
  toJSON(): { waiting: ReviewItem[] } {
    return { waiting: this.pending() };
  }

  static from(raw: unknown, read: (item: unknown) => ReviewItem | null): Outbox {
    const o = new Outbox();
    const list = (raw as { waiting?: unknown })?.waiting;
    if (Array.isArray(list)) for (const r of list.slice(0, 5000)) {
      const i = read(r);
      if (i) o.add(i);
    }
    return o;
  }
}
