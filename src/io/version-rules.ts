// Version history rules, kept pure so they can be tested: which versions to keep, how files are named, and how a
// version's time reads. The storage and the dialog are in versions.ts and VersionsDialog.tsx.

export interface VersionMeta {
  /** The library file id (see versionFileId). */
  id: string;
  docId: string;
  /** When it was taken (ms since 1970). */
  takenAt: number;
  /** A name the person gave it. Named versions are never pruned. */
  name?: string;
  /** Why an automatic one was taken: 'timer', 'save', 'restore' (just before a restore). Missing for named ones. */
  reason?: 'timer' | 'save' | 'restore';
  /** File size in bytes. */
  size: number;
  /** A small picture of the first frame (data: URL). */
  thumb?: string;
  /** How many frames long it was, and the stage size, for the list. */
  frames?: number;
  width?: number;
  height?: number;
}

export interface PruneLimits {
  /** Keep every automatic version this new (ms). */
  allWithin: number;
  /** Then one per hour up to this age. */
  hourlyWithin: number;
  /** Then one per day up to this age. Older automatic ones go. */
  dailyWithin: number;
  /** At most this many automatic versions per drawing. */
  maxAuto: number;
  /** At most this many bytes of automatic versions per drawing (named ones don't count against it). */
  maxAutoBytes: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const DEFAULT_LIMITS: PruneLimits = {
  allWithin: HOUR,
  hourlyWithin: DAY,
  dailyWithin: 14 * DAY,
  maxAuto: 60,
  maxAutoBytes: 400 * 1024 * 1024,
};

/** How often an automatic version is taken while there are changes. */
export const VERSION_EVERY_MS = 10 * 60_000;

/**
 * Splits versions into the ones to keep and the ones to delete. Named versions always stay. Automatic ones: all from
 * the last hour, the newest of each hour for a day, the newest of each day for two weeks, then within the count and
 * size caps (newest first).
 */
export function pruneVersions(list: VersionMeta[], now: number, limits: PruneLimits = DEFAULT_LIMITS): { keep: VersionMeta[]; drop: VersionMeta[] } {
  const sorted = [...list].sort((a, b) => b.takenAt - a.takenAt);
  const keep: VersionMeta[] = [];
  const drop: VersionMeta[] = [];
  const buckets = new Set<string>();
  let autoCount = 0;
  let autoBytes = 0;
  for (const v of sorted) {
    if (v.name) {
      keep.push(v);
      continue;
    }
    const age = now - v.takenAt;
    let ok: boolean;
    if (age < limits.allWithin) ok = true;
    else if (age < limits.hourlyWithin) ok = claim(buckets, `h${Math.floor(v.takenAt / HOUR)}`);
    else if (age < limits.dailyWithin) ok = claim(buckets, `d${dayKey(v.takenAt)}`);
    else ok = false;
    if (ok && (autoCount + 1 > limits.maxAuto || autoBytes + v.size > limits.maxAutoBytes)) ok = false;
    if (ok) {
      autoCount++;
      autoBytes += v.size;
      keep.push(v);
    } else drop.push(v);
  }
  return { keep, drop };
}

function claim(set: Set<string>, key: string): boolean {
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

// The local calendar day, so "one a day" follows the person's own clock.
function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Library ids allow letters, numbers, dashes and underscores (80 at most). */
export function safeDocKey(docId: string): string {
  const s = docId.replace(/[^A-Za-z0-9]/g, '').slice(0, 48);
  return s || 'doc';
}

/** The file id for a version: the drawing's key, then the time in base 36 (sorts and never clashes in practice). */
export function versionFileId(docId: string, takenAt: number, salt = ''): string {
  return `${safeDocKey(docId)}_${takenAt.toString(36)}${salt ? '_' + salt : ''}`;
}

/** "just now", "5 minutes ago", "2 hours ago", "yesterday at 9:05", "3 Nov at 22:50". */
export function timeAgo(t: number, now: number = Date.now()): string {
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return 'a minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  const d = new Date(t);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (hours < 6) return hours === 1 ? `an hour ago (${time})` : `${hours} hours ago (${time})`;
  const day = (x: number) => new Date(x).toDateString();
  if (day(t) === day(now)) return `today at ${time}`;
  if (day(t) === day(now - DAY)) return `yesterday at ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

/** What a version is called in the list: its name, or why it was taken. */
export function versionLabel(v: VersionMeta): string {
  if (v.name) return v.name;
  if (v.reason === 'save') return 'When you saved';
  if (v.reason === 'restore') return 'Before a restore';
  return 'Automatic';
}

/** Reads a stored index back, dropping anything that doesn't look like a version. */
export function parseIndex(text: string | null): VersionMeta[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text) as { versions?: unknown };
    if (!raw || !Array.isArray(raw.versions)) return [];
    return raw.versions.filter(
      (v): v is VersionMeta => !!v && typeof v === 'object' && typeof (v as VersionMeta).id === 'string' && typeof (v as VersionMeta).takenAt === 'number' && typeof (v as VersionMeta).docId === 'string',
    );
  } catch {
    return [];
  }
}
