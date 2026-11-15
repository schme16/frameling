// Things that were put into the drawing without a step in the sharer's Undo (a live reviewer's notes and marks, see
// src/livereview). They are ordinary notes, marks and answers, told apart only by an id that starts with `rq`.
//
// Undo and Redo work by patches, and a patch that rewrites a whole list reaches past its own step: taking back "add a
// note" cuts `notes` back to the length it had, and taking back "delete a note" puts the whole old list back, and either
// would take every quiet note that arrived since with it. `applyKeepingQuiet` runs patches the way immer does, and puts
// back any quiet item such a patch took, unless the step itself is the one that removed it (the sharer deleted it).
// So a reviewer's note is never lost to somebody else's Undo, and never becomes an Undo of its own.
import { applyPatches, produce, type Patch } from 'immer';
import type { Doc } from './format';

/** Quiet items carry this at the start of their id (then the reviewer's seat and their own id). */
export const QUIET_PREFIX = 'rq';

export const isQuietId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(QUIET_PREFIX);

type Path = readonly (string | number)[];

/** A list that quiet items go into: the page's notes and marks, and the answers under a note. */
const isQuietList = (path: Path): boolean => (path.length === 1 && (path[0] === 'notes' || path[0] === 'marks')) || (path.length === 3 && path[0] === 'notes' && typeof path[1] === 'number' && path[2] === 'replies');

/** The list a patch rewrites as a whole (cut short, made, replaced or removed), or null for a patch that touches one item. */
function wholeList(p: Patch): Path | null {
  const path = p.path;
  if (p.op === 'replace' && typeof p.value === 'number' && path[path.length - 1] === 'length' && isQuietList(path.slice(0, -1))) return path.slice(0, -1);
  if ((p.op === 'replace' || p.op === 'remove' || p.op === 'add') && isQuietList(path)) return path;
  return null;
}

function at(doc: unknown, path: Path): unknown {
  let cur = doc as Record<string | number, unknown> | undefined;
  for (const k of path) cur = (cur as Record<string | number, unknown> | undefined)?.[k] as Record<string | number, unknown> | undefined;
  return cur;
}

const idsOf = (list: unknown): string[] => (Array.isArray(list) ? list.map((x) => (x as { id?: unknown })?.id).filter((i): i is string => typeof i === 'string') : []);
const same = (a: Path, b: Path): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/** The ids the other side of the step holds in this list: a quiet item in there was in the step, so the step may remove it. */
function idsInStep(opposite: readonly Patch[], where: Path): Set<string> {
  const out = new Set<string>();
  for (const p of opposite) if (same(p.path, where) && p.op !== 'remove') for (const id of idsOf(p.value)) out.add(id);
  return out;
}

/**
 * `applyPatches`, except a patch that rewrites a whole list leaves the quiet items that were in it. `opposite` is the other
 * direction of the same step (its patches when this is its inverse, and the other way round).
 */
export function applyKeepingQuiet(doc: Doc, patches: readonly Patch[], opposite: readonly Patch[] = []): Doc {
  if (!patches.some((p) => wholeList(p))) return applyPatches(doc, patches as Patch[]);
  let cur = doc;
  let from = 0;
  patches.forEach((p, i) => {
    const where = wholeList(p);
    if (!where) return;
    if (i > from) cur = applyPatches(cur, patches.slice(from, i) as Patch[]);
    from = i + 1;
    const held = idsInStep(opposite, where);
    const before = at(cur, where);
    // A cut keeps what is before the cut; only the quiet ones past it are at risk, and the rest are not looked at.
    const cut = p.op === 'replace' && p.path[p.path.length - 1] === 'length' ? (p.value as number) : 0;
    const quiet = Array.isArray(before) ? before.slice(cut).filter((x) => isQuietId((x as { id?: unknown })?.id) && !held.has((x as { id: string }).id)) : [];
    cur = applyPatches(cur, [p]);
    if (!quiet.length) return;
    const now = new Set(idsOf(at(cur, where)));
    const lost = quiet.filter((x) => !now.has((x as { id: string }).id));
    if (!lost.length) return;
    cur = produce(cur, (d) => {
      const parent = at(d, where.slice(0, -1)) as Record<string | number, unknown> | undefined;
      const key = where[where.length - 1];
      if (!parent) return;
      const into = parent[key];
      if (Array.isArray(into)) into.push(...lost);
      else parent[key] = [...lost];
    });
  });
  if (from < patches.length) cur = applyPatches(cur, patches.slice(from) as Patch[]);
  return cur;
}
