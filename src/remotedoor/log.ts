// What the remote door was asked to do and when, kept in memory for as long as the app is open and shown in the app
// (the pill's card, and Show the remote door log). Never written to a file, never sent anywhere. It holds what each
// request did in plain words and how it went, and never the text of a script or anything else a caller sent.
import { createStore } from '../ui/mini';

export type LogOutcome = 'done' | 'refused' | 'failed';

export interface LogEntry {
  id: number;
  /** When, in milliseconds since 1970. */
  at: number;
  /** What it was, in plain words ("Pressed Duplicate"). */
  what: string;
  outcome: LogOutcome;
  /** Why not, when it was not done (plain words). */
  note?: string;
}

export const LOG_LIMIT = 200;

export const remoteLog = createStore<LogEntry[]>([]);
let n = 0;

/** Adds one entry, newest first, dropping the oldest past the limit. */
export function note(what: string, outcome: LogOutcome, noteText?: string, at: number = Date.now()): void {
  const e: LogEntry = { id: ++n, at, what, outcome, ...(noteText ? { note: noteText } : {}) };
  remoteLog.set((l) => [e, ...l].slice(0, LOG_LIMIT));
}

export const clearLog = (): void => remoteLog.set([]);

/** "14:32:07" in the person's own clock. */
export const clock = (at: number): string => new Date(at).toLocaleTimeString([], { hour12: false });
