/**
 * One stack of layers for the whole drawing (frames on boards): turning it on for a drawing whose boards have layers of
 * their own, and turning it off again. Pure functions on a document (an immer draft or a plain object), no DOM.
 * The reading side (what a closed board sees) is in src/core/sharedLayers.ts and model.ts.
 */
import { current, isDraft } from 'immer';
import type { Cel, Doc, Id, Layer } from '../core/format';
import { uid } from '../core/doc';
import { allLayerLists } from '../core/symbols';
import { activeId, ensureArtboards } from './model';

export type SharedChange = { ok: true; note: string } | { ok: false; problem: string };

const plain = <T>(x: T): T => structuredClone(isDraft(x) ? (current(x as never) as T) : x);
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Why the layers cannot be shared right now, in plain words, or null when they can. */
export function whyNotShare(d: Doc): string | null {
  if (d.sharedLayers) return 'The frames already share one stack of layers.';
  if (d.editing?.length) return 'Leave the symbol you are editing first.';
  if ((d.artboards ?? []).some((a) => a.variationOf)) return 'Some boards are variations (linked copies), and a variation needs layers of its own. Detach them first, then try again.';
  return null;
}

/** Why making a variation is off, or null when it is allowed. */
export function whyNoVariation(d: Doc): string | null {
  return d.sharedLayers ? 'The frames share one stack of layers, and a variation needs layers of its own. Give each board its own layers first.' : null;
}

/** Two layers are the same layer when they have the same kind, name and (for pixel layers) pixel size. */
const baseKey = (l: Layer): string => `${l.kind}|${l.name.trim().toLowerCase()}|${'pixelSize' in l ? l.pixelSize : ''}`;

/** How many layers a merge would fold into others, for the dialog: layers across boards minus layers in the stack. */
export function countShared(d: Doc): { boards: number; stack: number } {
  const boards = Math.max(1, d.artboards?.length ?? 1);
  const seen = new Set<string>();
  const add = (layers: readonly Layer[]) => {
    const used = new Map<string, number>();
    for (const l of layers) {
      const b = baseKey(l);
      const n = (used.get(b) ?? 0) + 1;
      used.set(b, n);
      seen.add(`${b}#${n}`);
    }
  };
  add(d.layers);
  for (const a of d.artboards ?? []) if (a.content) add(a.content.layers);
  return { boards, stack: seen.size };
}

/**
 * Puts the boards on one stack of layers. The layers of the open board are the start; the other boards' layers join
 * them by kind, name and pixel size, so 23 frames that each have "Lines" end up with one "Lines". A layer only some
 * boards have is added to the stack, near the layer that was beneath it. Each board keeps exactly what it drew.
 * With `fresh`, a board with nothing drawn on any layer, and no layer that matches, joins without adding any (a board that
 * was only just made).
 */
export function shareLayers(d: Doc, o: { fresh?: boolean } = {}): SharedChange {
  const why = whyNotShare(d);
  if (why) return { ok: false, problem: why };
  const list = ensureArtboards(d);
  const open = activeId(d);
  const byKey = new Map<string, Layer>();
  const index = (layers: readonly Layer[]): Map<Id, Layer> => {
    const used = new Map<string, number>();
    const out = new Map<Id, Layer>();
    for (const l of layers) {
      const b = baseKey(l);
      const n = (used.get(b) ?? 0) + 1;
      used.set(b, n);
      byKey.set(`${b}#${n}`, l);
      out.set(l.id, l);
    }
    return out;
  };
  index(d.layers);
  const lostFolders = new Set<Id>();
  let folded = 0;
  const celsByBoard = new Map<Id, Record<Id, Cel[]>>();
  for (const a of list) {
    if (a.id === open || !a.content) continue;
    const used = new Map<string, number>();
    const rec: Record<Id, Cel[]> = {};
    const idMap = new Map<Id, Id>();
    const made: Layer[] = [];
    let prev: Id | null = null;
    const blank = !!o.fresh && a.content.layers.every((l) => !l.cels.length);
    for (const l of a.content.layers) {
      const b = baseKey(l);
      const n = (used.get(b) ?? 0) + 1;
      used.set(b, n);
      let target = byKey.get(`${b}#${n}`);
      if (!target && blank) continue;
      if (target) {
        folded++;
        if (l.folder) lostFolders.add(l.folder);
      } else {
        const copy = { ...plain(l), cels: [] } as Layer;
        if (d.layers.some((x) => x.id === copy.id)) copy.id = uid('l');
        d.layers.splice(prev ? d.layers.findIndex((x) => x.id === prev) + 1 : 0, 0, copy);
        byKey.set(`${b}#${n}`, copy);
        made.push(copy);
        target = copy;
      }
      if (l.cels.length) rec[target.id] = l.cels;
      idMap.set(l.id, target.id);
      prev = target.id;
    }
    // A layer that was bound to a bones layer on its own board is bound to that bones layer in the stack.
    for (const m of made) if (m.bind) m.bind.rig = idMap.get(m.bind.rig) ?? m.bind.rig;
    celsByBoard.set(a.id, rec);
  }
  for (const a of list) {
    const rec = celsByBoard.get(a.id);
    if (!a.content || !rec) continue;
    a.content.layers = [];
    a.content.cels = rec;
  }
  d.sharedLayers = true;
  // Folders only the folded-away layers sat in have no one left.
  if (lostFolders.size && d.folders) {
    const keep = new Set<Id>();
    for (const layers of allLayerLists(d)) for (const l of layers) {
      for (let f = l.folder; f && !keep.has(f); f = d.folders[f]?.parent) keep.add(f);
    }
    for (const f of lostFolders) if (!keep.has(f)) delete d.folders[f];
  }
  const boards = list.length;
  return { ok: true, note: boards > 1 ? `${plural(boards, 'board')} now share one stack of ${plural(d.layers.length, 'layer')}.${folded ? ` ${plural(folded, 'layer')} that matched by name joined up.` : ''}` : 'New boards will share these layers.' };
}

/** Gives every board layers of its own again, copied from the stack (the open board keeps the stack's own). */
export function unshareLayers(d: Doc): SharedChange {
  if (!d.sharedLayers) return { ok: false, problem: 'The boards already have layers of their own.' };
  if (d.editing?.length) return { ok: false, problem: 'Leave the symbol you are editing first.' };
  const list = ensureArtboards(d);
  const open = activeId(d);
  const stack = plain(d.layers);
  for (const a of list) {
    if (a.id === open || !a.content) continue;
    const ids = new Map<Id, Id>(stack.map((l) => [l.id, uid('l')]));
    const folders = new Map<Id, Id>();
    const copyFolder = (old: Id): Id => {
      let nf = folders.get(old);
      if (nf) return nf;
      nf = uid('f');
      folders.set(old, nf);
      const src = d.folders![old];
      d.folders![nf] = { ...plain(src), id: nf };
      if (src.parent && d.folders![src.parent]) d.folders![nf].parent = copyFolder(src.parent);
      return nf;
    };
    const cels = a.content.cels ?? {};
    a.content.layers = stack.map((l) => {
      const copy: Layer = { ...structuredClone(l), id: ids.get(l.id)!, cels: cels[l.id] ?? [] };
      if (copy.bind) copy.bind.rig = ids.get(copy.bind.rig) ?? copy.bind.rig;
      if (copy.folder) {
        if (d.folders?.[copy.folder]) copy.folder = copyFolder(copy.folder);
        else delete copy.folder;
      }
      return copy;
    });
    delete a.content.cels;
  }
  delete d.sharedLayers;
  return { ok: true, note: 'Each board has layers of its own again.' };
}
