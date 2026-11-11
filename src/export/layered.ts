// How a frame's layers become the layers of a PSD or a PDF: what stays a layer, what becomes a group, and (for PDF)
// what has to be flattened into a picture because the format can't express it. Pure, so it can be tested.
import type { Doc, Layer, LayerFolder } from '../core/format';
import { activeEffects } from '../effects/model';

export type LayeredItem =
  | { kind: 'layer'; layer: Layer; clipping: boolean; hidden: boolean; mask: boolean }
  | { kind: 'group'; folder: LayerFolder; passThrough: boolean; masks: Layer[]; layers: LayeredItem[] };

/** The layers that export at all (reference layers never do). */
const exported = (l: Layer) => !l.reference && l.kind !== 'camera';

export function folderPassThrough(f: LayerFolder, members: Layer[], frame = 0): boolean {
  return (f.blend ?? 'normal') === 'normal' && f.opacity >= 1 && !activeEffects(f.effects, frame).length && !members.some((l) => l.mask);
}

/** Layers bottom first, folders as groups (folders are one level deep). Hidden layers are kept, marked hidden. */
export function layeredPlan(doc: Doc, frame = 0): LayeredItem[] {
  const out: LayeredItem[] = [];
  const layers = doc.layers.filter(exported);
  let i = 0;
  while (i < layers.length) {
    const l = layers[i];
    const f = l.folder ? doc.folders?.[l.folder] : undefined;
    if (!f) {
      out.push({ kind: 'layer', layer: l, clipping: !!l.clipToBelow && i > 0, hidden: !l.visible || !!l.mask, mask: !!l.mask });
      i++;
      continue;
    }
    const members: Layer[] = [];
    while (i < layers.length && layers[i].folder === l.folder) members.push(layers[i++]);
    out.push({
      kind: 'group',
      folder: f,
      passThrough: folderPassThrough(f, members, frame),
      masks: members.filter((m) => m.mask && m.visible),
      layers: members.map((m, k) => ({ kind: 'layer', layer: m, clipping: !!m.clipToBelow && k > 0, hidden: !m.visible || !f.visible || !!m.mask, mask: !!m.mask })),
    });
  }
  return out;
}

/**
 * For formats without clipping, masks or effects (PDF, .ai): which layers stay vector and which sets of layers are
 * flattened into one picture. A picture unit keeps the layers' blend and opacity inside it.
 */
export type FlatUnit =
  | { kind: 'vector'; layer: Layer }
  | { kind: 'picture'; layers: Layer[]; /** One layer with effects: its own blend and opacity go on the picture. */ own?: Layer }
  | { kind: 'folder'; folder: LayerFolder; units: FlatUnit[] };

export function needsPicture(l: Layer, frame: number): boolean {
  // A layer bent by bones has no vector equivalent either, so it goes in as a picture.
  return (l.kind !== 'vector' && l.kind !== 'camera') || activeEffects(l.effects, frame).length > 0 || !!l.bind?.mesh;
}

function stageUnits(layers: Layer[], frame: number): FlatUnit[] {
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
    units.push(needsPicture(l, frame) ? { kind: 'picture', layers: [l], own: l } : { kind: 'vector', layer: l });
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
      out.push(...stageUnits(layers.slice(i, j), frame));
      i = j;
      continue;
    }
    const members: Layer[] = [];
    while (i < layers.length && layers[i].folder === l.folder) members.push(layers[i++]);
    if (!f.visible) continue;
    // A folder with effects or masks inside is one picture; otherwise it stays vector, faded and blended as a group.
    if (activeEffects(f.effects, frame).length || members.some((m) => m.mask && m.visible)) out.push({ kind: 'picture', layers: members.filter((m) => m.visible) });
    else out.push({ kind: 'folder', folder: f, units: stageUnits(members, frame) });
  }
  return out.filter((u) => u.kind !== 'picture' || u.layers.length);
}
