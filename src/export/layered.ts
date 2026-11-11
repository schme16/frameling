// How a frame's layers become the layers of a PSD or a PDF: what stays a layer, what becomes a group, and (for PDF)
// what has to be flattened into a picture because the format can't express it. Pure, so it can be tested.
import type { Doc, Layer, LayerFolder } from '../core/format';
import { activeEffects } from '../effects/model';
import { poseAt, isPosed, type PosedLook } from '../core/symbols';
import type { Drawing } from '../core/format';

export type LayeredItem =
  | { kind: 'layer'; layer: Layer; clipping: boolean; hidden: boolean; mask: boolean }
  /** `baked`: the folder has effects, so the group holds one finished picture of it (the layers stay inside, hidden). */
  | { kind: 'group'; folder: LayerFolder; passThrough: boolean; baked: boolean; masks: Layer[]; layers: LayeredItem[] }
  /** A mask layer on the stage: everything under it, as a group that takes the mask. The mask layer sits on top, hidden. */
  | { kind: 'masked'; mask: Layer; layers: LayeredItem[] };

/** The layers that export at all (reference layers never do). */
const exported = (l: Layer) => !l.reference && l.kind !== 'camera';

export function folderPassThrough(f: LayerFolder, members: Layer[], frame = 0): boolean {
  return (f.blend ?? 'normal') === 'normal' && f.opacity >= 1 && !activeEffects(f.effects, frame).length && !members.some((l) => l.mask);
}

/**
 * A folder's layers as items. Like on the stage, a visible mask cuts only what is under it in the folder: those layers
 * become a "masked" item, and layers above the mask are left alone.
 */
function folderItems(members: Layer[], f: LayerFolder): LayeredItem[] {
  let out: LayeredItem[] = [];
  members.forEach((m, k) => {
    const item: LayeredItem = { kind: 'layer', layer: m, clipping: !!m.clipToBelow && k > 0 && !members[k - 1].mask, hidden: !m.visible || !f.visible || !!m.mask, mask: !!m.mask };
    if (m.mask && m.visible && out.length) out = [{ kind: 'masked', mask: m, layers: [...out, item] }];
    else out.push(item);
  });
  return out;
}

/** The plain layers in a list of items, bottom first, looking inside masked wrappers. */
export function itemLayers(items: LayeredItem[]): Extract<LayeredItem, { kind: 'layer' }>[] {
  return items.flatMap((x) => (x.kind === 'layer' ? [x] : x.kind === 'masked' ? itemLayers(x.layers) : []));
}

/** Layers bottom first, folders as groups (folders are one level deep). Hidden layers are kept, marked hidden. */
export function layeredPlan(doc: Doc, frame = 0): LayeredItem[] {
  let out: LayeredItem[] = [];
  const layers = doc.layers.filter(exported);
  let i = 0;
  while (i < layers.length) {
    const l = layers[i];
    const f = l.folder ? doc.folders?.[l.folder] : undefined;
    if (!f) {
      // A layer right after a mask has nothing to clip to (the mask ends the run), same as on the canvas.
      const item: LayeredItem = { kind: 'layer', layer: l, clipping: !!l.clipToBelow && i > 0 && !layers[i - 1].mask, hidden: !l.visible || !!l.mask, mask: !!l.mask };
      i++;
      // A visible mask on the stage cuts out everything under it: that becomes a group with a layer mask, which
      // later masks wrap in turn (each one cuts what's under it, masked layers included).
      if (l.mask && l.visible && out.length) out = [{ kind: 'masked', mask: l, layers: [...out, item] }];
      else out.push(item);
      continue;
    }
    const members: Layer[] = [];
    while (i < layers.length && layers[i].folder === l.folder) members.push(layers[i++]);
    out.push({
      kind: 'group',
      folder: f,
      passThrough: folderPassThrough(f, members, frame),
      baked: activeEffects(f.effects, frame).length > 0,
      masks: members.filter((m) => m.mask && m.visible),
      layers: folderItems(members, f),
    });
  }
  return out;
}

/**
 * The document for a picture of a folder with its effects, but not its own opacity or blend (a PSD group keeps those
 * as settings). The folder is shown even if it's switched off, since a hidden group needs its picture all the same.
 */
export function bakedFolderDoc(doc: Doc, folderId: string): Doc {
  const f = doc.folders?.[folderId];
  if (!f) return doc;
  return { ...doc, folders: { ...doc.folders, [folderId]: { ...f, visible: true, opacity: 1, blend: undefined } } };
}

/**
 * The document for a picture of one layer on its own: no opacity, blend, clipping, mask or folder (PSD keeps those
 * itself). Keeps the camera, and the bones layer the layer is attached to, or a bent layer would come out straight.
 */
export function soloDoc(doc: Doc, layer: Layer): Doc {
  const solo: Layer = { ...layer, opacity: 1, blend: undefined, clipToBelow: false, mask: undefined, folder: undefined, visible: true };
  const keep = doc.layers.filter((l) => l.kind === 'camera' || (layer.bind && l.id === layer.bind.rig));
  return { ...doc, layers: [...keep, solo] };
}

/**
 * For formats without clipping, masks or effects (PDF, .ai): which layers stay vector and which sets of layers are
 * flattened into one picture. A picture unit keeps the layers' blend and opacity inside it.
 */
export type FlatUnit =
  | { kind: 'vector'; layer: Layer }
  | { kind: 'picture'; layers: Layer[]; /** One layer with effects: its own blend and opacity go on the picture. */ own?: Layer }
  | { kind: 'folder'; folder: LayerFolder; units: FlatUnit[] };

/** True when a drawing has art bent on a mesh somewhere in it (a rigged layer, or one inside a symbol instance). */
export function drawingHasMesh(d: Drawing | undefined, depth = 0): boolean {
  if (!d || d.kind !== 'vector' || depth > 8) return false;
  return d.shapes.some((s) => s.type === 'instance' && isPosed(s) && s.posed.layers.some((pl) => !!pl.mesh || drawingHasMesh(pl.drawing, depth + 1)));
}

/** A symbol's own looks PDF can't draw as vector: effects, clipping, masks, or a folder that changes how it combines. */
export function lookNeedsPicture(look: PosedLook): boolean {
  return look.layers.some((l) => {
    if (!l.visible || l.reference) return false;
    if (activeEffects(l.effects, look.frame).length || l.clipToBelow || l.mask) return true;
    const f = l.folder ? look.folders?.[l.folder] : undefined;
    return !!f && f.visible && !folderPassThrough(f, [], look.frame);
  });
}

/** True when a drawing holds a symbol copy whose own looks PDF can't draw (anywhere inside it). */
export function drawingHasLook(d: Drawing | undefined, depth = 0): boolean {
  if (!d || d.kind !== 'vector' || depth > 8) return false;
  return d.shapes.some((s) => s.type === 'instance' && isPosed(s) && ((!!s.posed.look && lookNeedsPicture(s.posed.look)) || s.posed.layers.some((pl) => drawingHasLook(pl.drawing, depth + 1))));
}

/**
 * PDF can't bend art on a mesh, or draw effects, clipping or masks (on the layer or inside a symbol on it), so such a
 * layer comes in as a picture the canvas's own drawing made.
 */
export function needsPicture(l: Layer, frame: number, doc?: Doc): boolean {
  if ((l.kind !== 'vector' && l.kind !== 'camera') || activeEffects(l.effects, frame).length > 0) return true;
  if (!doc || l.kind !== 'vector') return false;
  const d = poseAt(doc, l, frame);
  return drawingHasMesh(d) || drawingHasLook(d);
}

function stageUnits(doc: Doc, layers: Layer[], frame: number): FlatUnit[] {
  // A mask cuts everything under it at its level, and clipped layers sit on the one under them: both flatten.
  const units: FlatUnit[] = [];
  const lastMask = layers.map((l) => !!l.mask && l.visible).lastIndexOf(true);
  let i = 0;
  if (lastMask >= 0) {
    units.push({ kind: 'picture', layers: layers.slice(0, lastMask + 1) });
    i = lastMask + 1;
  }
  for (; i < layers.length; i++) {
    const l = layers[i];
    if (!l.visible) continue;
    // Gather a base and the clipped layers above it.
    if (i + 1 < layers.length && layers[i + 1].clipToBelow) {
      const set = [l];
      while (i + 1 < layers.length && layers[i + 1].clipToBelow) set.push(layers[++i]);
      units.push({ kind: 'picture', layers: set });
      continue;
    }
    units.push(needsPicture(l, frame, doc) ? { kind: 'picture', layers: [l], own: l } : { kind: 'vector', layer: l });
  }
  return units;
}

/** Layers bottom first as PDF units. Hidden layers and folders are left out (like every other export). */
export function flatPlan(doc: Doc, frame = 0): FlatUnit[] {
  const out: FlatUnit[] = [];
  const layers = doc.layers.filter(exported);
  let i = 0;
  while (i < layers.length) {
    const l = layers[i];
    const f = l.folder ? doc.folders?.[l.folder] : undefined;
    if (!f) {
      let j = i;
      while (j < layers.length && !(layers[j].folder && doc.folders?.[layers[j].folder!])) j++;
      out.push(...stageUnits(doc, layers.slice(i, j), frame));
      i = j;
      continue;
    }
    const members: Layer[] = [];
    while (i < layers.length && layers[i].folder === l.folder) members.push(layers[i++]);
    if (!f.visible) continue;
    // A folder with effects or masks inside is one picture; otherwise it stays vector, faded and blended as a group.
    if (activeEffects(f.effects, frame).length || members.some((m) => m.mask && m.visible)) out.push({ kind: 'picture', layers: members.filter((m) => m.visible) });
    else out.push({ kind: 'folder', folder: f, units: stageUnits(doc, members, frame) });
  }
  return out.filter((u) => u.kind !== 'picture' || u.layers.length);
}
