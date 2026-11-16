/**
 * Learning what one notch of this machine's mouse wheel says. A plain wheel says 100 pixels a notch, but some say 45,
 * 53, 120 or 48 (three lines), and a notch should zoom the same quarter on all of them. So we watch the plain wheel
 * events and take the size that keeps turning up as the notch. It is live: a different mouse, or the same one on
 * another day, is picked up once a dozen or so events have gone by. The last answer is remembered between sessions, only so the first
 * notch after start-up is already right. Pure apart from that one remembered number.
 */

/** What a notch is taken to be until we have seen better: the usual wheel. */
export const DEFAULT_NOTCH = 100;
/** Smaller than this is a high-resolution wheel's small step or a trackpad's scroll, not a notch. */
export const MIN_NOTCH = 30;
/** Bigger than this is not a notch either (a fast fling, or a mouse with its own acceleration). */
export const MAX_NOTCH = 160;
/** How many recent events are compared. */
export const NOTCH_WINDOW = 12;
/** How many of them have to be the same size before that size is the notch. */
export const NOTCH_AGREE = 3;
/** Within this many pixels counts as the same size. */
const SAME = 0.5;

/** The size that most of the recent events agree on, or null when no size has enough of them (or none is a notch). */
export function agreedNotch(recent: number[]): number | null {
  let best: { size: number; n: number } | null = null;
  for (const a of recent) {
    if (a < MIN_NOTCH || a > MAX_NOTCH) continue;
    const same = recent.filter((b) => Math.abs(a - b) <= SAME);
    if (same.length >= NOTCH_AGREE && (!best || same.length > best.n)) best = { size: same.reduce((s, v) => s + v, 0) / same.length, n: same.length };
  }
  return best ? Math.round(best.size * 10) / 10 : null;
}

/** Whether a notch is far enough from 100 to be worth pointing out. */
export function isUnusualNotch(notch: number): boolean {
  return Math.abs(notch - DEFAULT_NOTCH) > 5;
}

export class NotchLearner {
  private recent: number[] = [];
  private current: number;
  /** True once this run has seen enough events to agree on a size (as against only trusting the remembered one). */
  settled = false;

  constructor(
    seed: number = DEFAULT_NOTCH,
    private onChange?: (notch: number) => void,
  ) {
    this.current = seed >= MIN_NOTCH && seed <= MAX_NOTCH ? seed : DEFAULT_NOTCH;
  }

  get notch(): number {
    return this.current;
  }

  /** Take what one plain wheel event said, in pixels (sign does not matter). */
  see(px: number): void {
    const a = Math.abs(px);
    if (!(a > 0)) return;
    this.recent.push(a);
    if (this.recent.length > NOTCH_WINDOW) this.recent.shift();
    const size = agreedNotch(this.recent);
    if (size === null) return;
    this.settled = true;
    if (Math.abs(size - this.current) > SAME) {
      this.current = size;
      this.onChange?.(size);
    }
  }

  reset(): void {
    this.recent = [];
    this.settled = false;
  }
}

const KEY = 'frameling.wheelNotch';
let shared: NotchLearner | null = null;

/** The one learner the canvas and the Diagnostics readout share, seeded from, and saved to, what was learned last time. */
export function sharedNotch(): NotchLearner {
  if (shared) return shared;
  let seed = DEFAULT_NOTCH;
  try {
    const n = Number(localStorage.getItem(KEY));
    if (Number.isFinite(n) && n >= MIN_NOTCH && n <= MAX_NOTCH) seed = n;
  } catch {
    // no storage: start from the usual
  }
  shared = new NotchLearner(seed, (n) => {
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      // not remembered, still learned
    }
  });
  return shared;
}

/** Forget the shared learner and what was saved (for tests, and for a person who swaps mouse and wants a clean start). */
export function resetSharedNotch(): void {
  shared = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing saved to forget
  }
}
