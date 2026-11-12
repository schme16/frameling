/**
 * The document edits behind blend modes, effects, clipping, masks and folders. Pure functions on a (draft)
 * document, so they're tested without the store; ops.ts runs them as undo steps.
 */
import type { BlendMode, Doc, EffectKind, Id, Layer, LayerEffect, LayerFolder } from '../core/format';
import { uid } from '../core/doc';
import { MAX_FOLDER_DEPTH, folderAndDescendants, folderHeight, folderLevel, layerFolders, layerIsUnder } from '../core/folders';
import { clampParam, defaultValues, effectInfo, valuesAt, withKey } from './model';

/** What an edit applies to: a layer, or a folder. */
export type Target = { layer: Id } | { folder: Id };

export function lookOf(doc: Doc, t: Target): Layer | LayerFolder | undefined {
  return 'layer' in t ? doc.layers.find((l) => l.id === t.layer) : doc.folders?.[t.folder];
}

export function setBlend(doc: Doc, t: Target, mode: BlendMode): boolean {
  const o = lookOf(doc, t);
  if (!o || (o.blend ?? 'normal') === mode) return false;
  if (mode === 'normal') delete o.blend;
  else o.blend = mode;
  return true;
}

export function addEffect(doc: Doc, t: Target, kind: EffectKind): Id | null {
  const o = lookOf(doc, t);
  if (!o) return null;
  const e: LayerEffect = { id: uid('fx'), kind, values: defaultValues(kind) };
  (o.effects ??= []).push(e);
  return e.id;
}

function effectOf(doc: Doc, t: Target, id: Id): { o: Layer | LayerFolder; e: LayerEffect; i: number } | null {
  const o = lookOf(doc, t);
  const i = o?.effects?.findIndex((e) => e.id === id) ?? -1;
  return o && i >= 0 ? { o, e: o.effects![i], i } : null;
}

export function removeEffect(doc: Doc, t: Target, id: Id): boolean {
  const f = effectOf(doc, t, id);
  if (!f) return false;
  f.o.effects!.splice(f.i, 1);
  if (!f.o.effects!.length) delete f.o.effects;
  return true;
}

/** Moves an effect one place earlier (-1) or later (1) in the stack. */
export function moveEffect(doc: Doc, t: Target, id: Id, dir: -1 | 1): boolean {
  const f = effectOf(doc, t, id);
  if (!f) return false;
  const j = f.i + dir;
  const list = f.o.effects!;
  if (j < 0 || j >= list.length) return false;
  const [e] = list.splice(f.i, 1);
  list.splice(j, 0, e);
  return true;
}

export function setEffectOn(doc: Doc, t: Target, id: Id, on: boolean): boolean {
  const f = effectOf(doc, t, id);
  if (!f || (f.e.on !== false) === on) return false;
  if (on) delete f.e.on;
  else f.e.on = false;
  return true;
}

/**
 * Changes one setting. Numbers on an animated effect go into a key at `frame` (made if there isn't one), so moving
 * a slider on another frame animates it. Colours are never animated.
 */
export function setEffectValue(doc: Doc, t: Target, id: Id, key: string, value: number | string, frame: number): boolean {
  const f = effectOf(doc, t, id);
  if (!f) return false;
  const p = effectInfo(f.e.kind).params.find((x) => x.key === key);
  if (!p) return false;
  if (p.type === 'color') {
    if (typeof value !== 'string' || f.e.values[key] === value) return false;
    f.e.values[key] = value;
    return true;
  }
  const v = clampParam(p, Number(value));
  if (f.e.keys?.length) {
    f.e.keys = withKey(f.e.keys, frame, { [key]: v });
    return true;
  }
  if (f.e.values[key] === v) return false;
  f.e.values[key] = v;
  return true;
}

/**
 * Turns animating on (the settings as they are become a key at `frame`) or off (the settings as they are at
 * `frame` become the only ones).
 */
export function setEffectAnimated(doc: Doc, t: Target, id: Id, on: boolean, frame: number): boolean {
  const f = effectOf(doc, t, id);
  if (!f || !!f.e.keys?.length === on) return false;
  const now = valuesAt(f.e, frame);
  if (on) {
    const nums: Record<string, number> = {};
    for (const p of effectInfo(f.e.kind).params) if (p.type === 'number') nums[p.key] = Number(now[p.key]);
    f.e.keys = [{ frame, values: nums }];
  } else {
    f.e.values = { ...f.e.values, ...now };
    delete f.e.keys;
  }
  return true;
}

/** Removes the key at `frame`, if there is one. The last key going turns animating off. */
export function removeEffectKey(doc: Doc, t: Target, id: Id, frame: number): boolean {
  const f = effectOf(doc, t, id);
  const i = f?.e.keys?.findIndex((k) => k.frame === frame) ?? -1;
  if (!f || i < 0) return false;
  if (f.e.keys!.length === 1) {
    f.e.values = { ...f.e.values, ...f.e.keys![0].values };
    delete f.e.keys;
  } else f.e.keys!.splice(i, 1);
  return true;
}

/** Puts one effect back to how it starts (keeps it in the stack). */
export function resetEffect(doc: Doc, t: Target, id: Id): boolean {
  const f = effectOf(doc, t, id);
  if (!f) return false;
  f.e.values = defaultValues(f.e.kind);
  delete f.e.keys;
  delete f.e.on;
  return true;
}

/** Back to plain: normal blend and no effects. */
export function resetLook(doc: Doc, t: Target): boolean {
  const o = lookOf(doc, t);
  if (!o || (!o.effects?.length && (o.blend ?? 'normal') === 'normal')) return false;
  delete o.effects;
  delete o.blend;
  return true;
}

// ---------------------------------------------------------------- clipping and masks

export function setClip(doc: Doc, layerId: Id, on: boolean): boolean {
  const l = doc.layers.find((x) => x.id === layerId);
  if (!l || !!l.clipToBelow === on) return false;
  if (on) {
    l.clipToBelow = true;
    delete l.mask;
  } else delete l.clipToBelow;
  return true;
}

export function setMask(doc: Doc, layerId: Id, mode: 'show' | 'hide' | null): boolean {
  const l = doc.layers.find((x) => x.id === layerId);
  if (!l || (l.mask ?? null) === mode) return false;
  if (mode) {
    l.mask = mode;
    delete l.clipToBelow;
  } else delete l.mask;
  return true;
}

/**
 * Makes a layer a mask. Inside a folder it masks the folder's layers under it. On its own it gets a folder first,
 * holding it and either the one layer under it ('below') or every layer under it ('all'), so it can't reach further
 * than meant. Returns the folder's id when it made one.
 */
export function useAsMask(doc: Doc, layerId: Id, scope: 'below' | 'all', mode: 'show' | 'hide' = 'show'): { folder?: Id } | null {
  const i = doc.layers.findIndex((x) => x.id === layerId);
  if (i < 0) return null;
  const l = doc.layers[i];
  if (!l.folder && i > 0) {
    let from = i - 1;
    if (scope === 'all') while (from > 0 && !doc.layers[from - 1].folder) from--;
    const ids = doc.layers.slice(from, i + 1).filter((x) => !x.folder).map((x) => x.id);
    const folder = makeFolder(doc, ids, `Masked by ${l.name}`);
    setMask(doc, layerId, mode);
    return { folder: folder ?? undefined };
  }
  if (!setMask(doc, layerId, mode)) return null;
  return {};
}

// ---------------------------------------------------------------- folders

/**
 * Puts layers in a new folder. They're gathered next to each other, just under the topmost of them, keeping their
 * order. Layers already in another folder leave it, and the new folder sits in the folder they all share (so a layer
 * inside a folder gets a folder of its own inside that one).
 */
export function makeFolder(doc: Doc, layerIds: Id[], name?: string): Id | null {
  const set = new Set(layerIds);
  const picked = doc.layers.filter((l) => set.has(l.id));
  if (!picked.length) return null;
  const id = uid('f');
  const n = Object.keys(doc.folders ?? {}).length + 1;
  // The folder every picked layer is in, as deep as they all agree.
  const chains = picked.map((l) => layerFolders(doc, l));
  let common = chains[0];
  for (const c of chains) {
    let k = 0;
    while (k < common.length && k < c.length && common[k].id === c[k].id) k++;
    common = common.slice(0, k);
  }
  // Keep within the depth cap: a layer too deep to get a folder of its own makes it beside its folder instead.
  if (common.length >= MAX_FOLDER_DEPTH) common = common.slice(0, MAX_FOLDER_DEPTH - 1);
  (doc.folders ??= {})[id] = { id, name: name ?? `Folder ${n}`, visible: true, opacity: 1, ...(common.length ? { parent: common[common.length - 1].id } : {}) };
  const top = Math.max(...picked.map((l) => doc.layers.indexOf(l)));
  const rest = doc.layers.filter((l) => !set.has(l.id));
  const before = doc.layers.slice(0, top + 1).filter((l) => !set.has(l.id)).length;
  for (const l of picked) l.folder = id;
  doc.layers.splice(0, doc.layers.length, ...rest.slice(0, before), ...picked, ...rest.slice(before));
  tidyFolders(doc);
  return id;
}

/**
 * Takes the layers out of a folder and removes it. The layers, and any folders inside it, move up into the folder it
 * was in (or the stage). They stay where they are and look the same where they can.
 */
export function ungroupFolder(doc: Doc, folderId: Id): boolean {
  const f = doc.folders?.[folderId];
  if (!f) return false;
  for (const l of doc.layers) if (l.folder === folderId) (f.parent ? (l.folder = f.parent) : delete l.folder);
  for (const o of Object.values(doc.folders!)) if (o.parent === folderId) (f.parent ? (o.parent = f.parent) : delete o.parent);
  delete doc.folders![folderId];
  if (!Object.keys(doc.folders!).length) delete doc.folders;
  return true;
}

export function setFolderProps(doc: Doc, folderId: Id, props: Partial<Pick<LayerFolder, 'name' | 'visible' | 'opacity'>>): boolean {
  const f = doc.folders?.[folderId];
  if (!f) return false;
  let changed = false;
  if (props.name !== undefined && props.name.trim() && props.name.trim() !== f.name) ((f.name = props.name.trim()), (changed = true));
  if (props.visible !== undefined && props.visible !== f.visible) ((f.visible = props.visible), (changed = true));
  if (props.opacity !== undefined) {
    const o = Math.min(1, Math.max(0, props.opacity));
    if (o !== f.opacity) ((f.opacity = o), (changed = true));
  }
  return changed;
}

/** Moves a layer to array index `to`, joining `folder` (or leaving its folder with null). One step for a drag. */
export function moveLayerInto(doc: Doc, layerId: Id, to: number, folder: Id | null): boolean {
  const from = doc.layers.findIndex((l) => l.id === layerId);
  if (from < 0) return false;
  const dest = Math.max(0, Math.min(doc.layers.length - 1, Math.round(to)));
  const l = doc.layers[from];
  const same = (l.folder ?? null) === folder;
  if (from === dest && same) return false;
  if (from !== dest) {
    doc.layers.splice(from, 1);
    doc.layers.splice(dest, 0, l);
  }
  if (folder && doc.folders?.[folder]) l.folder = folder;
  else delete l.folder;
  tidyFolders(doc);
  return true;
}

// ---------------------------------------------------------------- moving layers and folders about

/** A layer or a folder (with everything in it), as something to move. */
export type Node = { layer: Id } | { folder: Id };

/** Where a drop lands next to its target: above or below it, inside a folder at its top, or inside at its bottom. */
export type Drop = 'above' | 'below' | 'into' | 'into-bottom';

function nodeLayerIds(doc: Doc, n: Node): Id[] {
  return 'layer' in n ? [n.layer] : doc.layers.filter((l) => layerIsUnder(doc, l, n.folder)).map((l) => l.id);
}

/**
 * Moves a layer, or a folder with everything in it, next to another layer or folder: above or below it (at its level),
 * or into a folder. One undo step for a drag. False when it can't (onto itself, into its own insides, too deep).
 */
export function moveNode(doc: Doc, drag: Node, target: Node, where: Drop): boolean {
  const ids = new Set(nodeLayerIds(doc, drag));
  if (!ids.size) return false;
  const tids = nodeLayerIds(doc, target);
  if (!tids.length) return false;
  if ('layer' in target && ids.has(target.layer)) return false;
  if ('folder' in drag && 'folder' in target && folderAndDescendants(doc.folders, drag.folder).has(target.folder)) return false;
  const tparent: Id | undefined = 'layer' in target ? doc.layers.find((l) => l.id === target.layer)?.folder : doc.folders?.[target.folder]?.parent;
  const into = where === 'into' || where === 'into-bottom';
  if (into && !('folder' in target)) return false;
  const parent = into ? (target as { folder: Id }).folder : tparent && doc.folders?.[tparent] ? tparent : undefined;
  if ('folder' in drag && parent && folderLevel(doc, parent) + 1 + folderHeight(doc.folders, drag.folder) > MAX_FOLDER_DEPTH) return false;
  const block = doc.layers.filter((l) => ids.has(l.id));
  const rest = doc.layers.filter((l) => !ids.has(l.id));
  // Where the target sits in the list as it is now (a folder holding the dragged thing includes it), then how many
  // of the other layers end up below the dropped block.
  const where0 = doc.layers.map((l, i) => (tids.includes(l.id) ? i : -1)).filter((i) => i >= 0);
  const lo = Math.min(...where0);
  const hi = Math.max(...where0);
  const index = rest.filter((l) => doc.layers.indexOf(l) <= (where === 'above' || where === 'into' ? hi : lo - 1)).length;
  const next = [...rest.slice(0, index), ...block, ...rest.slice(index)];
  const was = 'layer' in drag ? block[0].folder : doc.folders?.[drag.folder]?.parent;
  const moved = next.some((l, i) => l !== doc.layers[i]);
  if (!moved && (was ?? null) === (parent ?? null)) return false;
  doc.layers.splice(0, doc.layers.length, ...next);
  if ('layer' in drag) {
    if (parent) block[0].folder = parent;
    else delete block[0].folder;
  } else {
    const f = doc.folders![drag.folder];
    if (parent) f.parent = parent;
    else delete f.parent;
  }
  tidyFolders(doc);
  return true;
}

/** The node next to a layer or folder, one step up or down the list, at the same level (null at the edge of its folder). */
export function siblingOf(doc: Doc, n: Node, dir: 'up' | 'down'): Node | null {
  const ids = new Set(nodeLayerIds(doc, n));
  if (!ids.size) return null;
  const idx = doc.layers.map((l, i) => (ids.has(l.id) ? i : -1)).filter((i) => i >= 0);
  const nb = doc.layers[dir === 'up' ? Math.max(...idx) + 1 : Math.min(...idx) - 1];
  if (!nb) return null;
  const parent = 'layer' in n ? doc.layers.find((l) => l.id === n.layer)?.folder : doc.folders?.[n.folder]?.parent;
  const level = parent ? folderLevel(doc, parent) : 0;
  const chain = layerFolders(doc, nb);
  // The neighbour has to be inside the same folder (or on the stage with it).
  if (parent && !chain.some((f) => f.id === parent)) return null;
  return chain[level] ? { folder: chain[level].id } : { layer: nb.id };
}

/**
 * Moves a layer or folder one place with the arrow keys, like the list shows it: past the layer or folder next to it,
 * and out of its folder when it is at the edge. A layer next to a folder steps into it first (a folder does not: use
 * `nestNode` for that).
 */
export function stepNode(doc: Doc, n: Node, dir: 'up' | 'down'): boolean {
  if ('layer' in n) return stepLayerThroughFolders(doc, n.layer, dir);
  const sib = siblingOf(doc, n, dir);
  if (sib) return moveNode(doc, n, sib, dir === 'up' ? 'above' : 'below');
  const f = doc.folders?.[n.folder];
  if (!f?.parent) return false;
  return moveNode(doc, n, { folder: f.parent }, dir === 'up' ? 'above' : 'below');
}

/** Takes a layer or folder out of the folder it is in, to just above that folder. False on the stage. */
export function outdentNode(doc: Doc, n: Node): boolean {
  const parent = 'layer' in n ? doc.layers.find((l) => l.id === n.layer)?.folder : doc.folders?.[n.folder]?.parent;
  if (!parent || !doc.folders?.[parent]) return false;
  return moveNode(doc, n, { folder: parent }, 'above');
}

/**
 * Puts a layer or folder into the folder next to it: the one just above (at its bottom edge, so it stays put), else
 * the one just below (at its top). False when no folder is next to it.
 */
export function nestNode(doc: Doc, n: Node): boolean {
  for (const dir of ['up', 'down'] as const) {
    const sib = siblingOf(doc, n, dir);
    if (sib && 'folder' in sib && moveNode(doc, n, sib, dir === 'up' ? 'into-bottom' : 'into')) return true;
  }
  return false;
}


/** Drops folders no layer is in or under. */
export function pruneFolders(doc: Doc): void {
  if (!doc.folders) return;
  const used = new Set<Id>();
  for (const l of doc.layers) for (const f of layerFolders(doc, l)) used.add(f.id);
  for (const id of Object.keys(doc.folders)) if (!used.has(id)) delete doc.folders[id];
  for (const f of Object.values(doc.folders)) if (f.parent && !doc.folders[f.parent]) delete f.parent;
  if (!Object.keys(doc.folders).length) delete doc.folders;
}

/**
 * One step up or down, folder by folder like the timeline shows it. A layer at the edge of its folder steps out of
 * it (staying put, now just outside); a layer next to a folder steps into it at that edge, one folder at a time when
 * folders are inside folders; anything else swaps with its neighbour.
 */
export function stepLayerThroughFolders(doc: Doc, layerId: Id, dir: 'up' | 'down'): boolean {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  if (i < 0) return false;
  const l = doc.layers[i];
  const j = i + (dir === 'up' ? 1 : -1);
  const nb = doc.layers[j];
  const mine = layerFolders(doc, l);
  if (l.folder && mine.length) {
    const f = mine[mine.length - 1];
    if (!nb || !layerIsUnder(doc, nb, f.id)) {
      if (f.parent && doc.folders?.[f.parent]) l.folder = f.parent;
      else delete l.folder;
      pruneFolders(doc);
      return true;
    }
  }
  if (!nb) return false;
  const theirs = layerFolders(doc, nb);
  const into = theirs[mine.length];
  if (into && theirs.slice(0, mine.length).every((f, k) => f.id === mine[k].id)) {
    l.folder = into.id;
    return true;
  }
  doc.layers[i] = nb;
  doc.layers[j] = l;
  return true;
}

/**
 * Keeps every folder in one piece after layers move. The moved layer joins the folder it lands in the middle of, and
 * leaves its own when it lands away from it; if a folder (with the folders inside it) still ends up in more than one
 * run, what sits outside its longest run steps out to the folder it is in.
 */
export function tidyFolders(doc: Doc, movedId?: Id): void {
  if (!doc.folders) return;
  const ls = doc.layers;
  const i = movedId ? ls.findIndex((l) => l.id === movedId) : -1;
  if (i > 0 && i < ls.length - 1) {
    const m = ls[i];
    const a = layerFolders(doc, ls[i - 1]);
    const b = layerFolders(doc, ls[i + 1]);
    let k = 0;
    while (k < a.length && k < b.length && a[k].id === b[k].id) k++;
    if (k > 0) m.folder = a[k - 1].id;
    else if (m.folder && !a.some((f) => f.id === m.folder) && !b.some((f) => f.id === m.folder)) delete m.folder;
  }
  // Deepest folders first, so the ones inside are whole before the ones around them are looked at.
  const ids = Object.keys(doc.folders).sort((x, y) => folderLevel(doc, y) - folderLevel(doc, x));
  for (const id of ids) {
    const f = doc.folders[id];
    if (!f) continue;
    const runs: { start: number; len: number }[] = [];
    let start = -1;
    for (let k = 0; k <= ls.length; k++) {
      const inside = k < ls.length && layerIsUnder(doc, ls[k], id);
      if (inside && start < 0) start = k;
      if (!inside && start >= 0) {
        runs.push({ start, len: k - start });
        start = -1;
      }
    }
    if (runs.length < 2) continue;
    const keep = runs.reduce((x, y) => (y.len > x.len ? y : x));
    for (const r of runs) {
      if (r === keep) continue;
      for (let k = r.start; k < r.start + r.len; k++) {
        const chain = layerFolders(doc, ls[k]);
        const at = chain.findIndex((x) => x.id === id);
        if (at < 0) continue;
        const holder = chain[at + 1];
        if (holder) {
          if (f.parent) holder.parent = f.parent;
          else delete holder.parent;
        } else if (f.parent) ls[k].folder = f.parent;
        else delete ls[k].folder;
      }
    }
  }
  pruneFolders(doc);
}
