/**
 * The document edits behind blend modes, effects, clipping, masks and folders. Pure functions on a (draft)
 * document, so they're tested without the store; ops.ts runs them as undo steps.
 */
import type { BlendMode, Doc, EffectKind, Id, Layer, LayerEffect, LayerFolder } from '../core/format';
import { uid } from '../core/doc';
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
 * order. Layers already in another folder leave it.
 */
export function makeFolder(doc: Doc, layerIds: Id[], name?: string): Id | null {
  const set = new Set(layerIds);
  const picked = doc.layers.filter((l) => set.has(l.id));
  if (!picked.length) return null;
  const id = uid('f');
  const n = Object.keys(doc.folders ?? {}).length + 1;
  (doc.folders ??= {})[id] = { id, name: name ?? `Folder ${n}`, visible: true, opacity: 1 };
  const top = Math.max(...picked.map((l) => doc.layers.indexOf(l)));
  const rest = doc.layers.filter((l) => !set.has(l.id));
  const before = doc.layers.slice(0, top + 1).filter((l) => !set.has(l.id)).length;
  for (const l of picked) l.folder = id;
  doc.layers.splice(0, doc.layers.length, ...rest.slice(0, before), ...picked, ...rest.slice(before));
  pruneFolders(doc);
  return id;
}

/** Takes the layers out of a folder and removes it. The layers stay where they are and look the same where they can. */
export function ungroupFolder(doc: Doc, folderId: Id): boolean {
  if (!doc.folders?.[folderId]) return false;
  for (const l of doc.layers) if (l.folder === folderId) delete l.folder;
  delete doc.folders[folderId];
  if (!Object.keys(doc.folders).length) delete doc.folders;
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
  pruneFolders(doc);
  return true;
}

/** Drops folders no layer is in. */
export function pruneFolders(doc: Doc): void {
  if (!doc.folders) return;
  const used = new Set(doc.layers.map((l) => l.folder));
  for (const id of Object.keys(doc.folders)) if (!used.has(id)) delete doc.folders[id];
  if (!Object.keys(doc.folders).length) delete doc.folders;
}
