/**
 * Swap the fonts a drawing uses: which fonts its text asks for (and where), and applying a swap. Pure on a document
 * (a plain object or an immer draft), with "is this font on this computer" passed in, so tests run with no canvas.
 * The window is in FontSwapDialog.tsx.
 */
import type { Doc, Id, Layer, TextShape } from '../core/format';
import { boardLayers, rootDoc } from '../core/symbols';

/** Where some of a font's text sits: a board and layer (or a symbol and layer), with how many text items. */
export interface FontPlace {
  /** "Board 2, Title" or "Symbol Logo, Letters". Just the layer name when the drawing has one board. */
  label: string;
  items: number;
}

/** One font the drawing asks for. */
export interface FontUse {
  /** The name as the first text spelled it. */
  font: string;
  /** How many text items use it (a title held across many keys counts once). */
  items: number;
  /** The first words of the first text that uses it, to show the font with. */
  sample: string;
  places: FontPlace[];
  /** Not on this computer (so the drawing shows a stand-in). */
  missing: boolean;
}

/** Which text to change: only the fonts this computer lacks, or every font in the list. */
export type SwapScope = 'missing' | 'all';

/** The key two spellings of one font share ("arial", "ARIAL "). */
export const fontKey = (font: string): string => font.trim().toLowerCase();

/** A drawing the stage can reach, and where it was found. */
interface Reach {
  place: string;
  drawingId: Id;
}

/** Every vector drawing the document shows, with the board and layer (or symbol and layer) it is on. */
function reachable(doc: Doc): Reach[] {
  const root = rootDoc(doc);
  const out: Reach[] = [];
  const boards = root.artboards ?? [];
  const named = boards.length > 1;
  const walk = (prefix: string, layers: readonly Layer[]) => {
    for (const l of layers) {
      const seen = new Set<Id>();
      for (const c of l.cels) {
        if (seen.has(c.drawingId)) continue;
        seen.add(c.drawingId);
        out.push({ place: prefix ? `${prefix}, ${l.name}` : l.name, drawingId: c.drawingId });
      }
    }
  };
  if (boards.length) for (const a of boards) walk(named ? a.name : '', boardLayers(root, a));
  else walk('', root.layers);
  for (const s of Object.values(root.symbols ?? {})) walk(`Symbol ${s.name}`, s.layers);
  return out;
}

const isText = (s: { type: string }): s is TextShape => s.type === 'text';

/**
 * The fonts the drawing's text uses, most used first. `here` says whether a font is on this computer. A text that
 * was copied to a new key counts once (it is one title on the stage), however many keys hold it.
 */
export function collectFontUses(doc: Doc, here: (font: string) => boolean): FontUse[] {
  const uses = new Map<string, { use: FontUse; seen: Set<string>; places: Map<string, Set<string>> }>();
  for (const r of reachable(doc)) {
    const d = doc.drawings[r.drawingId];
    if (!d || d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (!isText(s)) continue;
      const k = fontKey(s.font);
      let u = uses.get(k);
      if (!u) {
        u = { use: { font: s.font.trim() || s.font, items: 0, sample: '', places: [], missing: !here(s.font) }, seen: new Set(), places: new Map() };
        uses.set(k, u);
      }
      const item = s.origin ?? s.id;
      if (u.seen.has(item)) continue;
      u.seen.add(item);
      u.use.items++;
      if (!u.use.sample) u.use.sample = s.text.trim().split('\n')[0].slice(0, 40);
      const at = u.places.get(r.place) ?? new Set<string>();
      at.add(item);
      u.places.set(r.place, at);
    }
  }
  const list: FontUse[] = [];
  for (const { use, places } of uses.values()) {
    use.places = [...places].map(([label, items]) => ({ label, items: items.size }));
    list.push(use);
  }
  return list.sort((a, b) => Number(b.missing) - Number(a.missing) || b.items - a.items || a.font.localeCompare(b.font));
}

/**
 * What to change, as a map from a font (by `fontKey`) to the font that replaces it. `picked` is the replacement chosen for
 * each font name as the window lists it; a font with no pick, or one that picks itself, stays. With the scope on
 * 'missing', fonts that are here stay as they are.
 */
export function planSwaps(uses: readonly FontUse[], picked: Readonly<Record<string, string>>, scope: SwapScope): Map<string, string> {
  const plan = new Map<string, string>();
  for (const u of uses) {
    const to = picked[u.font]?.trim();
    if (!to || fontKey(to) === fontKey(u.font)) continue;
    if (scope === 'missing' && !u.missing) continue;
    plan.set(fontKey(u.font), to);
  }
  return plan;
}

/** How many text items a plan changes. */
export function swapItemCount(uses: readonly FontUse[], plan: ReadonlyMap<string, string>): number {
  return uses.reduce((n, u) => n + (plan.has(fontKey(u.font)) ? u.items : 0), 0);
}

/** The ids of the drawings a swap reaches: the ones the stage and the symbols show. Work this out before the edit starts. */
export function swapTargets(doc: Doc): Id[] {
  return [...new Set(reachable(doc).map((r) => r.drawingId))];
}

/** Changes the font of every text in `targets` (see `swapTargets`) as the plan says; weight, size and the rest stay. Returns how many text shapes changed. */
export function applyFontSwap(doc: Doc, plan: ReadonlyMap<string, string>, targets: readonly Id[] = swapTargets(doc)): number {
  let changed = 0;
  for (const id of targets) {
    const d = doc.drawings[id];
    if (!d || d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (!isText(s)) continue;
      const to = plan.get(fontKey(s.font));
      if (to !== undefined && s.font !== to) {
        s.font = to;
        changed++;
      }
    }
  }
  return changed;
}

/** The words for a place list: the first few, then "and 3 more". */
export function placesNote(places: readonly FontPlace[], show = 3): string {
  const first = places.slice(0, show).map((p) => (p.items > 1 ? `${p.label} (${p.items})` : p.label));
  const more = places.length - first.length;
  return more > 0 ? `${first.join('; ')}; and ${more} more` : first.join('; ');
}
