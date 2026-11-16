/**
 * Masks as the layer list sees them: which layers a mask cuts, which mask cuts a layer, what the layer under a mask
 * would look like if the mask were the other way round. Pure, built on the same plan the renderer draws, so what the
 * list says is what the picture does.
 *
 * A mask is a layer with `mask: 'show' | 'hide'`. It is "on" while it is visible (the eye): a hidden mask is never
 * drawn and cuts nothing, which is how every exporter already treats it, so "off for a moment" needs no new field.
 */
import { folderChain } from '../core/folders';
import type { Doc, Id, Layer } from '../core/format';
import { buildPlan, planLayers, type PlanStep } from './plan';

/** The layers the mask cuts: everything under it in its own level (the stage, or its folder), masks left out. */
export function maskTargets(doc: Doc, maskId: Id): Layer[] {
  const find = (steps: PlanStep[]): Layer[] | null => {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === 'mask') {
        if (s.layer.id === maskId) return planLayers(steps.slice(0, i)).filter((l) => !l.mask);
      } else if (s.node.type === 'folder') {
        const inner = find(s.node.steps);
        if (inner) return inner;
      }
    }
    return null;
  };
  return find(buildPlan(doc, () => true, true)) ?? [];
}

export interface MaskLinks {
  /** Each cut layer, and the nearest mask above it that cuts it. */
  by: Map<Id, Layer>;
  /** Each mask, and the layers it cuts, bottom first. */
  targets: Map<Id, Layer[]>;
}

/** Every mask in the document and what it cuts. */
export function maskLinks(doc: Doc): MaskLinks {
  const by = new Map<Id, Layer>();
  const targets = new Map<Id, Layer[]>();
  for (const l of doc.layers) {
    if (!l.mask) continue;
    const t = maskTargets(doc, l.id);
    targets.set(l.id, t);
    for (const x of t) if (!by.has(x.id)) by.set(x.id, l);
  }
  return { by, targets };
}

/**
 * The other half of a pair, for "switch between the mask and the layer": from a mask, the layer just under it; from a
 * layer a mask cuts, that mask. Undefined when the layer has no partner.
 */
export function maskPartner(doc: Doc, layerId: Id): Layer | undefined {
  const l = doc.layers.find((x) => x.id === layerId);
  if (!l) return undefined;
  const links = maskLinks(doc);
  if (l.mask) {
    const t = links.targets.get(l.id) ?? [];
    return t[t.length - 1];
  }
  return links.by.get(l.id);
}

/** Words for a row: what the mask cuts ("Ball and Shadow"), at most three names. */
export function namesList(layers: Layer[]): string {
  const names = layers.map((l) => l.name);
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function flipMode(mode: 'show' | 'hide'): 'show' | 'hide' {
  return mode === 'show' ? 'hide' : 'show';
}

/**
 * What a mask hides, as a plan the canvas can draw faintly while the mask is being painted: the layers it cuts, cut
 * the other way round. Null when there is nothing to show (not a mask, switched off, cuts nothing).
 */
export function ghostPlan(doc: Doc, maskId: Id): { doc: Doc; steps: PlanStep[] } | null {
  const mask = doc.layers.find((l) => l.id === maskId);
  if (!mask?.mask || !mask.visible) return null;
  const targets = maskTargets(doc, maskId);
  if (!targets.length) return null;
  const ids = new Set<Id>([maskId, ...targets.map((l) => l.id)]);
  const flipped: Doc = { ...doc, layers: doc.layers.map((l) => (l.id === maskId ? { ...l, mask: flipMode(l.mask!) } : l)) };
  const steps = buildPlan(flipped, (l) => l.visible, false, (l) => ids.has(l.id));
  return steps.length ? { doc: flipped, steps } : null;
}

/**
 * Masks that were in a folder and are not any more (moved out, or their folder was removed). Their mask now reaches
 * further than it did, so the app asks what to do. `before` and `after` are the document around one edit.
 */
export function masksThatLeft(before: Doc, after: Doc): Id[] {
  const out: Id[] = [];
  for (const l of before.layers) {
    if (!l.mask || !l.folder) continue;
    const now = after.layers.find((x) => x.id === l.id);
    if (!now?.mask) continue;
    if (!folderChain(after.folders, now.folder).some((f) => f.id === l.folder)) out.push(l.id);
  }
  return out;
}
