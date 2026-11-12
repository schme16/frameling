/**
 * Turns the flat layer list into the compositing plan: folders, clipping runs and masks. Pure, so it's tested
 * without a canvas.
 *
 * The rules, bottom to top within a level (the stage, or one folder):
 * - A layer or folder is drawn onto what's under it with its blend mode and opacity.
 * - "Clip to the layer below" layers sit on the nearest layer or folder under them that isn't clipped (their base),
 *   and only show where the base has drawing. A hidden base hides its clipped layers. With no base, they draw as usual.
 * - A mask layer isn't drawn. It cuts out everything under it in the same level ('show' keeps what's inside its
 *   drawing, 'hide' removes it). At the stage level it masks every layer under it, never the background.
 * - Folders can hold folders (see core/folders.ts), each level composed on its own: the inner folder is drawn into the
 *   outer one with its own opacity, blend mode and effects, then the outer folder's look applies to the lot. A folder's
 *   layers are the run of layers next to each other; if they got split up, each run is drawn as its own copy.
 */
import { layerTree, type TreeNode } from '../core/folders';
import type { Doc, Layer, LayerFolder } from '../core/format';

export type PlanNode = { type: 'layer'; layer: Layer } | { type: 'folder'; folder: LayerFolder; steps: PlanStep[]; isolate: boolean };

export type PlanStep = { type: 'draw'; node: PlanNode; clips: Layer[] } | { type: 'mask'; layer: Layer };

/**
 * The plan for a frame. `include` says which layers are drawn at all (visibility, reference layers, filters).
 * A folder that's hidden hides everything in it. `only` picks layers for another reason (the eyedropper's "this layer",
 * exports leaving reference layers out): a base it leaves out doesn't take its clipped layers with it.
 */
export function buildPlan(doc: Doc, include: (l: Layer) => boolean, includeHiddenFolders = false, only?: (l: Layer) => boolean): PlanStep[] {
  const entries = (nodes: TreeNode[]): Entry[] =>
    nodes.map((n): Entry => {
      if (n.type === 'layer') return entry(n.layer);
      if (!n.folder.visible && !includeHiddenFolders) return { type: 'hidden' };
      const steps = toSteps(entries(n.children), include, only);
      return steps.length ? { type: 'folder', folder: n.folder, steps, isolate: folderIsolates(n.folder, steps) } : { type: 'hidden' };
    });
  return toSteps(entries(layerTree(doc)), include, only);
}

type Entry = PlanNode | { type: 'mask'; layer: Layer } | { type: 'clip'; layer: Layer } | { type: 'hidden' };

function entry(l: Layer): Entry {
  if (l.mask) return { type: 'mask', layer: l };
  if (l.clipToBelow) return { type: 'clip', layer: l };
  return { type: 'layer', layer: l };
}

function toSteps(entries: Entry[], include: (l: Layer) => boolean, only?: (l: Layer) => boolean): PlanStep[] {
  const steps: PlanStep[] = [];
  // The current base for clipped layers: the last draw step, or 'hidden' when the base isn't drawn.
  let base: { type: 'draw'; node: PlanNode; clips: Layer[] } | 'hidden' | null = null;
  for (const e of entries) {
    if (e.type === 'hidden') {
      base = 'hidden';
      continue;
    }
    if (e.type === 'mask') {
      if (include(e.layer) && (!only || only(e.layer))) steps.push({ type: 'mask', layer: e.layer });
      base = null;
      continue;
    }
    if (e.type === 'clip') {
      if (!include(e.layer) || (only && !only(e.layer))) continue;
      if (base === 'hidden') continue;
      if (base) base.clips.push(e.layer);
      else steps.push({ type: 'draw', node: { type: 'layer', layer: e.layer }, clips: [] });
      continue;
    }
    if (e.type === 'layer' && !include(e.layer)) {
      base = 'hidden';
      continue;
    }
    if (e.type === 'layer' && only && !only(e.layer)) {
      base = null;
      continue;
    }
    const s = { type: 'draw' as const, node: e, clips: [] as Layer[] };
    steps.push(s);
    base = s;
  }
  return steps;
}

/** A folder draws into its own buffer when it changes how its layers combine with what's under the folder. */
function folderIsolates(f: LayerFolder, steps: PlanStep[]): boolean {
  if (f.opacity < 1 || (f.blend && f.blend !== 'normal') || f.effects?.some((e) => e.on !== false)) return true;
  return steps.some((s) => s.type === 'mask');
}

/** Every layer the plan draws (masks included), bottom first. */
export function planLayers(steps: PlanStep[]): Layer[] {
  const out: Layer[] = [];
  for (const s of steps) {
    if (s.type === 'mask') out.push(s.layer);
    else {
      if (s.node.type === 'layer') out.push(s.node.layer);
      else out.push(...planLayers(s.node.steps));
      out.push(...s.clips);
    }
  }
  return out;
}
