// Work found after a crash, waiting to be restored. The welcome sheet shows it as its first card; when the sheet isn't
// up, a toast offers it instead.
import { createStore } from '../ui/mini';

export interface PendingRecovery {
  /** The drawing's name. */
  name: string;
  /** When the copy was made (ms since 1970). */
  savedAt: number;
  restore: () => void;
}

export const recovery = createStore<PendingRecovery | null>(null);

/** "today at 22:50", "yesterday at 9:05", or "on 3 Nov at 22:50", in the person's own clock. */
export function whenSaved(savedAt: number, now: number = Date.now()): string {
  const d = new Date(savedAt);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (t: number) => new Date(t).toDateString();
  if (day(savedAt) === day(now)) return `today at ${time}`;
  if (day(savedAt) === day(now - 86_400_000)) return `yesterday at ${time}`;
  return `on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

/** Restores it (and forgets it). */
export function restorePending(): void {
  const p = recovery.get();
  recovery.set(null);
  p?.restore();
}

/** Leaves it in Recover unsaved work and stops offering it. */
export function dismissPending(): void {
  recovery.set(null);
}
