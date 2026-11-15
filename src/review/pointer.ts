// Pointers, both ways. A pointer is a place on the drawing in stage pixels (so it lands on the same spot at any zoom or
// window size), sent at most 30 times a second, and only the newest ever matters: a late cursor is worse than a dropped one.
import { MAX_REVIEWERS, POINTER_COLOURS } from './wire';

/** The least time between two pointer messages, in ms (30 a second). */
export const POINTER_EVERY_MS = 33;
/** How long a pointer stays after the last word from it, in ms, before it fades out. */
export const POINTER_FADE_AFTER_MS = 2000;
export const POINTER_FADE_MS = 400;

/** Decides when a pointer message goes: not more than 30 a second, the newest position, and never the same one twice. */
export class PointerSender {
  private n = 0;
  private lastAt = -Infinity;
  private lastX = NaN;
  private lastY = NaN;
  private pending: { x: number; y: number; off?: true } | null = null;

  /** The pointer is here now. Returns a message to send, or null when it should wait (call `due` later). */
  move(now: number, x: number, y: number, off = false): { n: number; x: number; y: number; off?: true } | null {
    this.pending = { x, y, ...(off ? { off: true as const } : {}) };
    return this.due(now);
  }

  /** The held position, if the time is up. Call it again when a timer fires. */
  due(now: number): { n: number; x: number; y: number; off?: true } | null {
    const p = this.pending;
    if (!p) return null;
    if (now - this.lastAt < POINTER_EVERY_MS && !p.off) return null;
    if (p.x === this.lastX && p.y === this.lastY && !p.off) {
      this.pending = null;
      return null;
    }
    this.pending = null;
    this.lastAt = now;
    this.lastX = p.x;
    this.lastY = p.y;
    return { n: ++this.n, ...p };
  }

  /** How long to wait before `due` can give the held position, or null when nothing is held. */
  waitMs(now: number): number | null {
    return this.pending ? Math.max(0, POINTER_EVERY_MS - (now - this.lastAt)) : null;
  }
}

export interface Dot {
  seat: number;
  x: number;
  y: number;
  off: boolean;
  at: number;
  n: number;
}

/** The newest pointer of each seat. An older message than the one held is dropped. */
export class Pointers {
  private dots = new Map<number, Dot>();

  /** True when it was newer (and is kept). */
  see(seat: number, m: { n: number; x: number; y: number; off?: boolean }, now: number): boolean {
    const d = this.dots.get(seat);
    if (d && m.n <= d.n) return false;
    this.dots.set(seat, { seat, x: m.x, y: m.y, off: m.off === true, at: now, n: m.n });
    return true;
  }

  forget(seat: number): void {
    this.dots.delete(seat);
  }

  /** The dots to draw now, each with how opaque it is (they fade out after a pause or when the pointer leaves). */
  visible(now: number): { dot: Dot; alpha: number }[] {
    const out: { dot: Dot; alpha: number }[] = [];
    for (const dot of this.dots.values()) {
      const a = dot.off ? 0 : pointerAlpha(now - dot.at);
      if (a > 0) out.push({ dot, alpha: a });
    }
    return out;
  }
}

/** Fully there for two seconds, then gone over a moment. */
export function pointerAlpha(age: number): number {
  if (age <= POINTER_FADE_AFTER_MS) return 1;
  const t = (age - POINTER_FADE_AFTER_MS) / POINTER_FADE_MS;
  return t >= 1 ? 0 : 1 - t;
}

export const colourOfSeat = (seat: number): string => POINTER_COLOURS[((seat % MAX_REVIEWERS) + MAX_REVIEWERS) % MAX_REVIEWERS];
