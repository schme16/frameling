/**
 * Drawings that more than one cel points at. A cel is one place a drawing is shown, so a drawing on two layers, on two
 * artboards or twice in one timeline is "shown in 2 places", and changing it changes every one of them. Most files never
 * have any (copying a drawing makes a real copy); a file built by hand, like Quill's, can have a lot.
 *
 * Pure functions on a document, no DOM. A variation's cels are left out: a closed variation points straight at its
 * original's drawings on purpose, and an open one has its own copies (see src/artboards/variations.ts).
 */
import type { Cel, Doc, Id, Layer } from './format';

/** Where a shared drawing is shown. `total` is every cel that points at it (so at least 2). */
export interface DrawingUse {
  total: number;
  /** On the open artboard (the timeline you are looking at). */
  here: number;
  /** The names of the other artboards that show it, in artboard order. */
  boards: string[];
  /** In symbols (the reusable drawings with a timeline of their own). */
  symbols: number;
}

type Tally = Map<Id, DrawingUse>;

const bump = (m: Tally, id: Id, where: 'here' | 'symbols' | { board: string }): void => {
  let u = m.get(id);
  if (!u) m.set(id, (u = { total: 0, here: 0, boards: [], symbols: 0 }));
  u.total++;
  if (where === 'here') u.here++;
  else if (where === 'symbols') u.symbols++;
  else if (!u.boards.includes(where.board)) u.boards.push(where.board);
};

const countLayers = (m: Tally, layers: readonly Layer[] | undefined, where: 'here' | 'symbols' | { board: string }): void => {
  for (const l of layers ?? []) for (const c of l.cels) bump(m, c.drawingId, where);
};

const countCels = (m: Tally, cels: Record<Id, Cel[]> | undefined, board: string): void => {
  for (const list of Object.values(cels ?? {})) for (const c of list) bump(m, c.drawingId, { board });
};

/** Every drawing shown in more than one place, with where. Nothing while a symbol is open for editing in place. */
function tally(doc: Doc): Tally {
  const m: Tally = new Map();
  if (doc.editing?.length) return m;
  countLayers(m, doc.layers, 'here');
  for (const s of Object.values(doc.symbols ?? {})) countLayers(m, s.layers, 'symbols');
  // The open artboard is the document's own layers (above); the others keep theirs in `content`.
  for (const a of doc.artboards ?? []) {
    if (a.variationOf || !a.content) continue;
    countLayers(m, a.content.layers, { board: a.name });
    countCels(m, a.content.cels, a.name);
  }
  for (const [id, u] of m) if (u.total < 2) m.delete(id);
  return m;
}

const same = (a: Tally, b: Tally): boolean => {
  if (a.size !== b.size) return false;
  for (const [id, u] of a) {
    const v = b.get(id);
    if (!v || v.total !== u.total || v.here !== u.here || v.symbols !== u.symbols || v.boards.join('\n') !== u.boards.join('\n')) return false;
  }
  return true;
};

let memo: { layers: unknown; artboards: unknown; symbols: unknown; editing: unknown; out: Tally } | null = null;

/**
 * The drawings shown in more than one place. The same object comes back until the layers, artboards or symbols change,
 * and again when they changed but nothing about sharing did, so a screen can use it without redrawing for nothing.
 */
export function sharedDrawings(doc: Doc): ReadonlyMap<Id, DrawingUse> {
  if (memo && memo.layers === doc.layers && memo.artboards === doc.artboards && memo.symbols === doc.symbols && memo.editing === doc.editing) return memo.out;
  const out = tally(doc);
  const keep = memo && same(memo.out, out) ? memo.out : out;
  memo = { layers: doc.layers, artboards: doc.artboards, symbols: doc.symbols, editing: doc.editing, out: keep };
  return keep;
}

/** How many places show this drawing (1 when it is on its own). */
export function placesOf(doc: Doc, drawingId: Id): number {
  return sharedDrawings(doc).get(drawingId)?.total ?? 1;
}

/** "Shown in 3 places: 2 on this artboard and 1 on walk." for a tooltip, or null when it is on its own. */
export function sharedWords(use: DrawingUse | undefined): string | null {
  if (!use) return null;
  const bits: string[] = [];
  if (use.here) bits.push(use.here === 1 ? 'here' : `${use.here} here`);
  if (use.boards.length) bits.push(`on ${use.boards.length === 1 ? 'the artboard' : 'the artboards'} ${list(use.boards)}`);
  if (use.symbols) bits.push(use.symbols === 1 ? 'in a symbol' : `${use.symbols} times in symbols`);
  return `Shown in ${use.total} places: ${list(bits)}.`;
}

function list(a: string[]): string {
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
