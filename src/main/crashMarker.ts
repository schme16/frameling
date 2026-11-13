// Spotting a crash. A small file in the data folder is written when Frameling starts and taken away when it quits
// properly, so a hard kill, a power cut or a crash of the main process leaves it behind and the next start finds it.
// A drawing window that crashes (but the app is closed properly afterwards) is written into the same file as an
// event and kept. It never claims a crash when there wasn't one: a clean quit leaves nothing behind, another copy
// that is still running is left alone, and a file that doesn't read cleanly counts as no crash.
//
// Everything here is plain functions over a folder, so it can be tested without Electron. main.ts wires it in.
import fs from 'node:fs';
import path from 'node:path';
import type { CrashNotes } from '../preload/api';

/** The marker for the run in progress (or, after a quit with a window crash, for the run that ended). */
export const MARKER_FILE = 'running.json';
/** The notes of the last crash found, kept until a newer one replaces them, so the command can still send them. */
export const LAST_FILE = 'last-crash.json';

export interface Marker {
  v: 1;
  /** `running` while the app is open; `closed` is only left behind when a window crashed during that run. */
  state: 'running' | 'closed';
  pid: number;
  startedAt: number;
  version: string;
  platform: string;
  /** Plain lines about what went wrong in the run (a window that crashed, and how). */
  events: string[];
}

export interface LastCrash {
  notes: CrashNotes;
  /** True once Quill has offered it (or told them about it), so he turns up once. */
  offered: boolean;
}

export type Verdict = { kind: 'clean' } | { kind: 'other-running' } | { kind: 'crash'; notes: CrashNotes };

const MAX_EVENTS = 10;
const MAX_LINE = 300;

/** Reads a marker's text. Anything that isn't one of ours (empty, half-written, someone else's) gives null. */
export function parseMarker(text: string): Marker | null {
  try {
    const m = JSON.parse(text) as Partial<Marker> | null;
    if (!m || typeof m !== 'object' || m.v !== 1) return null;
    if (m.state !== 'running' && m.state !== 'closed') return null;
    if (!Number.isInteger(m.pid) || (m.pid as number) <= 0) return null;
    if (typeof m.startedAt !== 'number' || !Number.isFinite(m.startedAt)) return null;
    const events = Array.isArray(m.events) ? m.events.filter((e): e is string => typeof e === 'string').slice(-MAX_EVENTS).map((e) => e.slice(0, MAX_LINE)) : [];
    return { v: 1, state: m.state, pid: m.pid as number, startedAt: m.startedAt, version: String(m.version ?? '').slice(0, 40), platform: String(m.platform ?? '').slice(0, 40), events };
  } catch {
    return null;
  }
}

/** Whether a process with this id is alive. Asking with signal 0 sends nothing; "not allowed" still means it exists. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/**
 * What the file left from the last run says about it. `me` is this process's id and `alive` asks about another's.
 * - nothing there: clean.
 * - a window crashed in that run: a crash, whether or not the app was then closed properly.
 * - still marked as running and that process is gone: it was killed or fell over.
 * - still marked as running and that process is alive, and it isn't us: another copy is running, so it is nobody's crash.
 */
export function judge(prev: Marker | null, me: number, alive: (pid: number) => boolean = pidAlive): Verdict {
  if (!prev) return { kind: 'clean' };
  const base = { startedAt: prev.startedAt, version: prev.version, platform: prev.platform, events: prev.events };
  if (prev.state === 'running' && prev.pid !== me && alive(prev.pid)) return { kind: 'other-running' };
  if (prev.events.length) return { kind: 'crash', notes: { how: prev.state === 'running' ? 'both' : 'window', ...base } };
  if (prev.state === 'running') return { kind: 'crash', notes: { how: 'killed', ...base } };
  return { kind: 'clean' };
}

/** Whether a notes object from disk is one we can trust the shape of. */
export function parseNotes(raw: unknown): CrashNotes | null {
  const n = raw as Partial<CrashNotes> | null;
  if (!n || typeof n !== 'object') return null;
  if (n.how !== 'killed' && n.how !== 'window' && n.how !== 'both') return null;
  if (typeof n.startedAt !== 'number' || !Array.isArray(n.events)) return null;
  return { how: n.how, startedAt: n.startedAt, version: String(n.version ?? ''), platform: String(n.platform ?? ''), events: n.events.filter((e): e is string => typeof e === 'string').slice(-MAX_EVENTS) };
}

const markerPath = (dir: string) => path.join(dir, MARKER_FILE);
const lastPath = (dir: string) => path.join(dir, LAST_FILE);

function write(file: string, text: string): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readMarker(dir: string): Marker | null {
  try {
    return parseMarker(fs.readFileSync(markerPath(dir), 'utf8'));
  } catch {
    return null;
  }
}

export interface Start {
  dir: string;
  pid: number;
  version: string;
  platform: string;
  now?: number;
  alive?: (pid: number) => boolean;
}

/**
 * Called once when this copy of Frameling starts (and only by the copy that holds the single-instance lock). Judges the
 * last run, keeps its notes if it crashed, and writes the marker for this one. Never throws: not being able to
 * write a marker is never worth stopping the app for.
 */
export function startRun(o: Start): Verdict {
  try {
    fs.mkdirSync(o.dir, { recursive: true });
    const verdict = judge(readMarker(o.dir), o.pid, o.alive);
    // Another copy is alive: leave its marker as it is, and write none of our own.
    if (verdict.kind === 'other-running') return verdict;
    if (verdict.kind === 'crash') write(lastPath(o.dir), JSON.stringify({ notes: verdict.notes, offered: false } satisfies LastCrash));
    const mine: Marker = { v: 1, state: 'running', pid: o.pid, startedAt: o.now ?? Date.now(), version: o.version, platform: o.platform, events: [] };
    write(markerPath(o.dir), JSON.stringify(mine));
    return verdict;
  } catch {
    return { kind: 'clean' };
  }
}

/** Notes something went wrong in this run (the drawing window crashed). Only ever touches this run's own marker. */
export function noteEvent(dir: string, pid: number, what: string): void {
  try {
    const m = readMarker(dir);
    if (!m || m.pid !== pid || m.state !== 'running') return;
    write(markerPath(dir), JSON.stringify({ ...m, events: [...m.events, what.slice(0, MAX_LINE)].slice(-MAX_EVENTS) }));
  } catch {
    // Nothing to do about it.
  }
}

/**
 * Called when Frameling quits properly. A run with nothing wrong leaves no file. A run where the window crashed keeps
 * its notes (as `closed`), so the next start still tells Quill. Another copy's marker is never touched.
 */
export function endRun(dir: string, pid: number): void {
  try {
    const m = readMarker(dir);
    if (!m || m.pid !== pid) return;
    if (m.events.length) write(markerPath(dir), JSON.stringify({ ...m, state: 'closed' }));
    else fs.rmSync(markerPath(dir), { force: true });
  } catch {
    // Nothing to do about it.
  }
}

/** The notes of the last crash found, and whether Quill has offered them yet. */
export function readLast(dir: string): LastCrash | null {
  try {
    const raw = JSON.parse(fs.readFileSync(lastPath(dir), 'utf8')) as { notes?: unknown; offered?: unknown };
    const notes = parseNotes(raw.notes);
    return notes ? { notes, offered: raw.offered === true } : null;
  } catch {
    return null;
  }
}

/** Quill has offered it: he won't turn up for it again (the command still can). */
export function markOffered(dir: string): void {
  try {
    const last = readLast(dir);
    if (last) write(lastPath(dir), JSON.stringify({ ...last, offered: true } satisfies LastCrash));
  } catch {
    // Nothing to do about it.
  }
}
