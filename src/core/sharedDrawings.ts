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

/** What the symbols and the other artboards add to each drawing's count (every drawing, shared or not). Nothing from the open layers. */
function restOf(doc: Doc): Tally {
  const m: Tally = new Map();
  for (const s of Object.values(doc.symbols ?? {})) countLayers(m, s.layers, 'symbols');
  // The open artboard is the document's own layers; the others keep theirs in `content`.
  for (const a of doc.artboards ?? []) {
    if (a.variationOf || !a.content) continue;
    countLayers(m, a.content.layers, { board: a.name });
    countCels(m, a.content.cels, a.name);
  }
  return m;
}

/** How many cels of the open layers point at each drawing. */
function hereOf(layers: readonly Layer[]): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const l of layers) addCels(m, l.cels, 1);
  return m;
}

function addCels(m: Map<Id, number>, cels: readonly Cel[], by: 1 | -1): void {
  for (const c of cels) {
    const n = (m.get(c.drawingId) ?? 0) + by;
    if (n > 0) m.set(c.drawingId, n);
    else m.delete(c.drawingId);
  }
}

/** One drawing's use, or nothing when it is on its own. */
function useOf(id: Id, here: Map<Id, number>, rest: Tally): DrawingUse | null {
  const h = here.get(id) ?? 0;
  const r = rest.get(id);
  const total = h + (r?.total ?? 0);
  return total < 2 ? null : { total, here: h, boards: r ? r.boards.slice() : [], symbols: r?.symbols ?? 0 };
}

/** Every drawing shown in more than one place, with where. Nothing while a symbol is open for editing in place. */
function tally(here: Map<Id, number>, rest: Tally): Tally {
  const out: Tally = new Map();
  for (const id of new Set([...here.keys(), ...rest.keys()])) {
    const u = useOf(id, here, rest);
    if (u) out.set(id, u);
  }
  return out;
}

const same = (a: Tally, b: Tally): boolean => {
  if (a.size !== b.size) return false;
  for (const [id, u] of a) {
    const v = b.get(id);
    if (!v || v.total !== u.total || v.here !== u.here || v.symbols !== u.symbols || v.boards.join('\n') !== u.boards.join('\n')) return false;
  }
  return true;
};

/**
 * What the last answer was made from. `here` and `rest` are kept so an edit to a few layers only has to look at those
 * layers (the store keeps every layer it did not touch as the very same object), not at every cel of a big file.
 */
interface Memo {
  layers: unknown;
  artboards: unknown;
  symbols: unknown;
  editing: unknown;
  out: Tally;
  /** The open layers as they were counted, each with the cels array it had then. Missing while a symbol was open. */
  counted: { layer: Layer; cels: readonly Cel[]; n: number }[] | null;
  here: Map<Id, number>;
  rest: Tally;
}

let memo: Memo | null = null;

/** The work for a change to the open layers only: take away the layers that left, add the ones that arrived. */
function nudge(prev: Memo, layers: readonly Layer[]): { counted: NonNullable<Memo['counted']>; here: Map<Id, number>; out: Tally } {
  const old = new Map<Layer, { cels: readonly Cel[]; n: number }>();
  for (const c of prev.counted!) old.set(c.layer, c);
  // The counts are this memo's own and the memo is replaced right after, so they are changed in place rather than copied.
  const here = prev.here;
  const touched = new Set<Id>();
  const kept = new Set<Layer>();
  const counted: NonNullable<Memo['counted']> = [];
  for (const l of layers) {
    const was = old.get(l);
    if (was && was.cels === l.cels && was.n === l.cels.length && !kept.has(l)) {
      kept.add(l);
    } else {
      addCels(here, l.cels, 1);
      for (const c of l.cels) touched.add(c.drawingId);
    }
    counted.push({ layer: l, cels: l.cels, n: l.cels.length });
  }
  // A layer counted before is taken away unless it came back as the same layer once (a layer listed twice is counted twice).
  const seen = new Set<Layer>();
  for (const c of prev.counted!) {
    if (kept.has(c.layer) && !seen.has(c.layer)) {
      seen.add(c.layer);
      continue;
    }
    addCels(here, c.cels, -1);
    for (const x of c.cels) touched.add(x.drawingId);
  }
  const out: Tally = new Map(prev.out);
  for (const id of touched) {
    const u = useOf(id, here, prev.rest);
    if (u) out.set(id, u);
    else out.delete(id);
  }
  return { counted, here, out };
}

/**
 * The drawings shown in more than one place. The same object comes back until the layers, artboards or symbols change,
 * and again when they changed but nothing about sharing did, so a screen can use it without redrawing for nothing.
 */
export function sharedDrawings(doc: Doc): ReadonlyMap<Id, DrawingUse> {
  if (memo && memo.layers === doc.layers && memo.artboards === doc.artboards && memo.symbols === doc.symbols && memo.editing === doc.editing) return memo.out;
  const editing = !!doc.editing?.length;
  let counted: Memo['counted'] = null;
  let here: Map<Id, number>;
  let rest: Tally;
  let out: Tally;
  if (editing) {
    here = new Map();
    rest = new Map();
    out = new Map();
  } else if (memo?.counted && memo.artboards === doc.artboards && memo.symbols === doc.symbols) {
    // Only the open layers moved, which is every ordinary edit.
    ({ counted, here, out } = nudge(memo, doc.layers));
    rest = memo.rest;
  } else {
    here = hereOf(doc.layers);
    rest = restOf(doc);
    out = tally(here, rest);
    counted = doc.layers.map((layer) => ({ layer, cels: layer.cels, n: layer.cels.length }));
  }
  const keep = memo && same(memo.out, out) ? memo.out : out;
  memo = { layers: doc.layers, artboards: doc.artboards, symbols: doc.symbols, editing: doc.editing, out: keep, counted, here, rest };
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
