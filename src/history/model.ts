// The History panel's logic, kept apart from the screen so it can be tested: the rows, when they happened in plain
// words, and how many steps a click will go across.
import type { HistoryStep } from '../core/store';

/** Where a row stands: done and behind you, the one you are at, or undone (still there for Redo until you draw). */
export type RowState = 'done' | 'current' | 'undone';

export interface HistoryRow {
  /** The step id, or null for the first row, how the drawing was before any step. */
  id: number | null;
  label: string;
  /** When the step was made (milliseconds), absent for the start row. */
  at?: number;
  state: RowState;
}

export const START_LABEL = 'Start';

/**
 * The rows to show, newest first, with the start of the drawing at the bottom. `done` is oldest first; `undone` is in
 * the order Redo would put the steps back (so the first of them comes right after the last done step).
 */
export function buildRows(done: HistoryStep[], undone: HistoryStep[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (let i = undone.length - 1; i >= 0; i--) rows.push({ id: undone[i].id, label: undone[i].label, at: undone[i].at, state: 'undone' });
  for (let i = done.length - 1; i >= 0; i--) rows.push({ id: done[i].id, label: done[i].label, at: done[i].at, state: i === done.length - 1 ? 'current' : 'done' });
  rows.push({ id: null, label: START_LABEL, state: done.length ? 'done' : 'current' });
  return rows;
}

/** How many steps a click on this row goes across: negative back, positive forward, 0 for the row you are at. */
export function stepsFrom(rows: HistoryRow[], id: number | null): number {
  const current = rows.findIndex((r) => r.state === 'current');
  const target = rows.findIndex((r) => r.id === id);
  if (current < 0 || target < 0) return 0;
  return current - target;
}

/** A short plain-words saying of what a click does ("Go back 3 steps"). */
export function jumpWords(steps: number): string {
  if (steps === 0) return 'You are here';
  const n = Math.abs(steps);
  return `Go ${steps < 0 ? 'back' : 'forward'} ${n} step${n === 1 ? '' : 's'}`;
}

/** "just now", "5 min ago", "2 h ago", or the time of day for older steps. */
export function whenWords(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 6) return `${h} h ago`;
  return clockWords(at);
}

/** The time of day, for example "14:05" or "2:05 pm" as the computer likes it. */
export function clockWords(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** How far the Go back 10 and Go forward 10 commands go. */
export const BIG_JUMP = 10;

/** The id to jump to when going `by` steps from where you are (negative is back), staying inside the list. */
export function targetByOffset(rows: HistoryRow[], by: number): number | null | undefined {
  const current = rows.findIndex((r) => r.state === 'current');
  if (current < 0) return undefined;
  const at = Math.min(rows.length - 1, Math.max(0, current - by));
  if (at === current) return undefined;
  return rows[at].id;
}

/** The name for a version kept from a step, for example "Fill (3 steps back)". */
export function versionName(row: HistoryRow, steps: number): string {
  if (row.id === null) return 'Start of this session';
  return steps === 0 ? row.label : `${row.label} (${Math.abs(steps)} step${Math.abs(steps) === 1 ? '' : 's'} ${steps < 0 ? 'back' : 'ahead'})`;
}
