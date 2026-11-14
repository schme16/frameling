// Locking the tool rail and the panels: the pure parts. What a lock is, how a saved one is tidied, what a person is
// told when something is refused, and when a move looks like a slip. The live state is in dock.ts and lockState.ts.

/** The two things that can be locked: the tool rail ("tools"), and the panels with their windows. */
export type LockKind = 'tools' | 'panels';

/** Per workspace. A kind that is missing is "not decided": unlocked, or whatever the workspace brings. */
export interface Locks {
  tools?: boolean;
  panels?: boolean;
}

/** What is being refused, so the reason can say it in words. */
export type Doing = 'move' | 'size' | 'arrange' | 'edit' | 'reset';

const KINDS: LockKind[] = ['tools', 'panels'];

/** Locks out of storage or a file made safe. `onlyLocked` keeps just what is locked (what a workspace file carries). */
export function cleanLocks(raw: unknown, onlyLocked = false): Locks | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: Locks = {};
  for (const k of KINDS) if (typeof r[k] === 'boolean' && (!onlyLocked || r[k] === true)) out[k] = r[k] as boolean;
  return Object.keys(out).length ? out : undefined;
}

/** The saved per-workspace locks made safe. */
export function sanitizeLockMap(raw: unknown): Record<string, Locks> {
  const out: Record<string, Locks> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw).slice(0, 64)) {
    const l = /^[\w-]{1,40}$/.test(id) && id !== '__proto__' ? cleanLocks(v) : undefined;
    if (l) out[id] = l;
  }
  return out;
}

/** What a workspace file or saved workspace carries: only what is locked, or nothing. */
export const savedLocks = (l: Locks | undefined): { tools?: true; panels?: true } | undefined => cleanLocks(l, true) as { tools?: true; panels?: true } | undefined;

/** The locks in force: your own choice for the workspace on top of what the workspace brings. */
export function mergeLocks(brought: Locks | undefined, own: Locks | undefined): Locks {
  return { ...brought, ...own };
}

export const isLockedIn = (l: Locks | undefined, kind: LockKind): boolean => l?.[kind] === true;

/** Your own choice after locking or unlocking one kind: only what differs from what the workspace brings, or undefined when nothing does. */
export function withLock(own: Locks | undefined, brought: Locks | undefined, kind: LockKind, on: boolean): Locks | undefined {
  const next: Locks = { ...own, [kind]: on };
  for (const k of KINDS) if (k in next && (next[k] === true) === (brought?.[k] === true)) delete next[k];
  return Object.keys(next).length ? next : undefined;
}

const WHAT: Record<LockKind, string> = { tools: 'The tools are', panels: 'The panels are' };
const NOT: Record<LockKind, Record<Doing, string>> = {
  tools: {
    move: "the tool rail can't be moved to another side",
    size: "the tool rail can't be made wider or narrower",
    arrange: "tools can't be moved, put away, renamed or grouped",
    edit: "they can't be changed",
    reset: "they can't be put back",
  },
  panels: {
    move: "panels and windows can't be moved",
    size: "panels and windows can't be resized",
    arrange: "panels can't be closed, renamed or regrouped",
    edit: "they can't be changed",
    reset: "the layout can't be reset",
  },
};
const WAY_OUT: Record<LockKind, string> = { tools: "Unlock them from the rail's right-click menu.", panels: "Unlock them from a panel's right-click menu." };

/** The plain reason for a refusal: it says what is locked, what that stops, and where to undo it. */
export function lockedReason(kind: LockKind, doing: Doing): string {
  return `${WHAT[kind]} locked, so ${NOT[kind][doing]}. ${WAY_OUT[kind]}`;
}

/** The short reason under a greyed menu entry. */
export const lockedWhy = (kind: LockKind): string => `Locked. Unlock the ${kind} to do this.`;

/**
 * A move that looks like a slip: it was quick, or it didn't go far. Someone who carries a tool or a panel somewhere on
 * purpose takes a moment and goes the distance; the first time it isn't, Quill offers to lock it.
 */
export function looksAccidental(drag: { ms: number; px: number }): boolean {
  return drag.ms < 400 || drag.px < 60;
}
