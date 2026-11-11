/**
 * Merge drawing ("Merge together") versus separate objects ("Keep separate"), per vector layer. The geometry is in
 * src/geometry/merge.ts; this is the glue the tools use, plus Group, Ungroup, Break apart and the mode commands.
 */
import type { Id, Layer, Shape, VectorDrawing } from '../core/format';
import { findLayer, uid } from '../core/doc';
import { registerChoice } from '../core/choices';
import { registerCommands, registerHelp } from '../core/registry';
import { store, type State } from '../core/store';
import { explode, mergeShapes } from '../geometry/merge';
import { toast } from '../ui/toast';
import { activeDrawing, activeLayer, editActiveDrawing, EDIT_HINTS, type EditResult } from './edit';

export type DrawMode = 'object' | 'merge';

registerChoice<DrawMode>({
  id: 'draw.newLayerMode',
  title: 'New vector layers',
  question: 'When you add a vector layer, how should shapes drawn on it behave?',
  options: [
    { value: 'object', label: 'Keep shapes separate', detail: 'Each shape stays on its own, so you can pick it up and move it later (object drawing).' },
    { value: 'merge', label: 'Merge shapes together', detail: 'Shapes cut and join each other like paint (merge drawing).' },
  ],
  default: 'object',
  category: 'Drawing',
  help: 'merge-drawing',
  silent: true,
});

export const isMergeLayer = (l: Layer | undefined | null): boolean => !!l && l.kind === 'vector' && l.drawMode === 'merge';

/** Is the active layer drawing the merge way? */
export function activeIsMerge(): boolean {
  return isMergeLayer(activeLayer().layer);
}

export function layerDrawMode(l: Layer | undefined | null): DrawMode {
  return isMergeLayer(l) ? 'merge' : 'object';
}

/** Sets a vector layer's drawing mode, as one undo step. */
export function setLayerDrawMode(layerId: Id, mode: DrawMode): void {
  const l = findLayer(store().get().doc, layerId);
  if (!l || l.kind !== 'vector' || layerDrawMode(l) === mode) return;
  store().update(mode === 'merge' ? 'Merge drawing on' : 'Merge drawing off', (doc) => {
    const d = doc.layers.find((x) => x.id === layerId);
    if (!d || d.kind !== 'vector') return;
    if (mode === 'merge') d.drawMode = 'merge';
    else delete d.drawMode;
  });
}

/**
 * Changes the active vector drawing with a function of its shapes (worked out on the current, frozen shapes so the
 * geometry caches hit), in one undo step. A null result changes nothing.
 */
export function editShapes(label: string, fn: (shapes: readonly Shape[]) => Shape[] | null, opts: { coalesce?: string } = {}): EditResult | 'nothing' {
  const d = activeDrawing();
  const before = d && d.kind === 'vector' ? d.shapes : [];
  const next = fn(before);
  if (!next) return 'nothing';
  return editActiveDrawing(label, 'vector', (draft) => void (draft.shapes = next as never), opts);
}

/** Adds shapes to the active drawing: pushed on top on a normal layer, merged in on a merge layer. Returns the new ids. */
export function addShapes(label: string, shapes: Shape[]): { result: EditResult | 'nothing'; ids: Id[] } {
  if (!activeIsMerge()) {
    const r = editActiveDrawing(label, 'vector', (d) => void d.shapes.push(...(shapes as never[])));
    return { result: r, ids: shapes.map((s) => s.id) };
  }
  let ids: Id[] = [];
  const result = editShapes(label, (before) => {
    const m = mergeShapes(before, shapes);
    ids = m.added;
    return m.shapes;
  });
  return { result, ids };
}

// ---------------------------------------------------------------- part of a shape picked with a box

/**
 * A box drawn over part of a merged shape picks just that part. Nothing changes in the document until the part is
 * moved, deleted or changed: until then this holds the drawing as it would be once cut (`shapes`), and the pieces
 * that would lift out (`lifted`). It only counts while the drawing and the selection are the ones it was made for.
 */
export interface PendingCut {
  drawingId: Id;
  from: readonly Shape[];
  selection: Id[];
  shapes: Shape[];
  lifted: Shape[];
}
let cut: PendingCut | null = null;

export function setCut(c: PendingCut | null): void {
  cut = c;
}

/** The cut, if it still matches the active drawing and selection. */
export function pendingCut(): PendingCut | null {
  if (!cut) return null;
  const d = activeDrawing();
  const sel = store().get().ui.selection;
  if (!d || d.kind !== 'vector' || d.id !== cut.drawingId || d.shapes !== cut.from || sel.length !== cut.selection.length || sel.some((x, i) => x !== cut!.selection[i])) {
    cut = null;
    return null;
  }
  return cut;
}

/** The shapes to change: the cut-up ones when part of a shape is picked, else the drawing's own. */
export function cutBase(before: readonly Shape[]): readonly Shape[] {
  return pendingCut()?.shapes ?? before;
}

// ---------------------------------------------------------------- group and break apart

function vectorDrawing(): VectorDrawing | undefined {
  const d = activeDrawing();
  return d && d.kind === 'vector' ? d : undefined;
}

function selected(): Shape[] {
  const c = pendingCut();
  if (c) return c.lifted;
  const d = vectorDrawing();
  if (!d) return [];
  const ids = new Set(store().get().ui.selection);
  return d.shapes.filter((s) => ids.has(s.id));
}

/** Every id in the same groups as these, so a click on one part picks up the whole group. */
export function withGroups(shapes: readonly Shape[], ids: Iterable<Id>): Id[] {
  const want = new Set(ids);
  const groups = new Set<Id>();
  for (const s of shapes) if (want.has(s.id) && s.group) groups.add(s.group);
  if (!groups.size) return shapes.filter((s) => want.has(s.id)).map((s) => s.id);
  return shapes.filter((s) => want.has(s.id) || (s.group && groups.has(s.group))).map((s) => s.id);
}

/** Puts the shapes into one new group, keeping their order but moving them together above the topmost one. */
export function groupShapes(shapes: readonly Shape[], ids: ReadonlySet<Id>): { shapes: Shape[]; group: Id } {
  const group = uid('g');
  const top = shapes.reduce((a, s, i) => (ids.has(s.id) ? i : a), -1);
  const picked = shapes.filter((s) => ids.has(s.id)).map((s) => ({ ...s, group }));
  const out: Shape[] = [];
  shapes.forEach((s, i) => {
    if (!ids.has(s.id)) out.push(s);
    if (i === top) out.push(...picked);
  });
  return { shapes: out, group };
}

export function ungroupShapes(shapes: readonly Shape[], ids: ReadonlySet<Id>): Shape[] {
  return shapes.map((s) => {
    if (!ids.has(s.id) || !s.group) return s;
    const c = { ...s };
    delete c.group;
    return c;
  });
}

/**
 * Break apart: the shapes become plain fills (brush strokes and outlines turn into painted areas) and leave their
 * group. On a merge layer they then merge with what's around them.
 */
export function breakApart(shapes: readonly Shape[], ids: ReadonlySet<Id>, merge: boolean): { shapes: Shape[]; ids: Id[] } {
  if (!merge) {
    const out: Shape[] = [];
    const made: Id[] = [];
    for (const s of shapes) {
      if (!ids.has(s.id)) {
        out.push(s);
        continue;
      }
      const f = explode(s);
      out.push(...f);
      made.push(...f.map((x) => x.id));
    }
    return { shapes: out, ids: made };
  }
  const rest = shapes.filter((s) => !ids.has(s.id));
  const loose = shapes.filter((s) => ids.has(s.id)).map((s) => {
    const c = { ...s };
    delete c.group;
    return c;
  });
  const r = mergeShapes(rest, loose);
  return { shapes: r.shapes, ids: r.added };
}

const say = (r: EditResult | 'nothing') => {
  if (r !== 'ok' && r !== 'nothing') toast(EDIT_HINTS[r]);
};

const hasSelection = (s: State) => s.ui.selection.length > 0;
const isVector = () => activeLayer().layer?.kind === 'vector';

registerCommands([
  {
    id: 'draw.toggleMerge',
    label: 'Merge shapes on this layer',
    category: 'Draw',
    keys: ['J'],
    description: 'Switch the active layer between keeping shapes separate and merging them together (merge drawing).',
    help: 'merge-drawing',
    keywords: ['merge drawing', 'object drawing', 'flash', 'cut', 'join', 'paint mode'],
    enabled: () => isVector(),
    checked: (s) => isMergeLayer(findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]),
    run: () => {
      const { layer } = activeLayer();
      if (!layer || layer.kind !== 'vector') return void toast('Merge drawing works on vector layers. Pick one in the timeline first.');
      const next: DrawMode = isMergeLayer(layer) ? 'object' : 'merge';
      setLayerDrawMode(layer.id, next);
      toast(next === 'merge' ? `${layer.name}: shapes now merge together.` : `${layer.name}: shapes now stay separate.`);
    },
  },
  {
    id: 'arrange.group',
    label: 'Group',
    category: 'Arrange',
    keys: ['Mod+G'],
    description: 'Tie the selected shapes together so they select and move as one. Grouped shapes never merge.',
    help: 'merge-drawing',
    keywords: ['protect', 'object', 'combine'],
    enabled: hasSelection,
    run: () => {
      const ids = new Set(selected().map((s) => s.id));
      if (!ids.size) return;
      const r = editShapes('Group', (before) => groupShapes(cutBase(before), ids).shapes);
      say(r);
      if (r === 'ok') store().setUi({ selection: [...ids] });
    },
  },
  {
    id: 'arrange.ungroup',
    label: 'Ungroup',
    category: 'Arrange',
    keys: ['Mod+Shift+G'],
    description: 'Untie a group, so its shapes select one by one again. They stay as they are.',
    help: 'merge-drawing',
    enabled: (s) => hasSelection(s) && selected().some((x) => x.group),
    run: () => {
      const ids = new Set(selected().map((s) => s.id));
      if (!ids.size) return;
      say(editShapes('Ungroup', (before) => ungroupShapes(cutBase(before), ids)));
    },
  },
  {
    id: 'arrange.breakApart',
    label: 'Break apart',
    category: 'Arrange',
    keys: ['Mod+B'],
    description: 'Turn the selection into plain painted areas that merge with the drawing.',
    help: 'merge-drawing',
    keywords: ['explode', 'flatten', 'ungroup', 'convert to fills'],
    enabled: hasSelection,
    run: () => {
      const ids = new Set(selected().map((s) => s.id));
      if (!ids.size) return;
      let made: Id[] = [];
      const merge = activeIsMerge();
      const r = editShapes('Break apart', (before) => {
        const b = breakApart(cutBase(before), ids, merge);
        made = b.ids;
        return b.shapes;
      });
      say(r);
      if (r === 'ok') store().setUi({ selection: made });
    },
  },
]);

registerHelp({
  id: 'merge-drawing',
  title: 'Merge shapes or keep them separate',
  section: 'Drawing',
  media: 'merge-drawing.mp4',
  summary: 'Choose per layer: shapes that stay separate (object drawing), or shapes that cut and join like paint (merge drawing).',
  keywords: ['merge drawing', 'object drawing', 'flash', 'cut', 'join', 'group', 'break apart', 'shapes'],
  body: `Each vector layer has a **Merge shapes together** switch at the top of the tool options, and **J** flips it.

**Off** (object drawing) is how layers start. Every line and shape stays on its own. You can click it later, move it, and everything under it is still there.

**On** (merge drawing) works like paint:
- Draw over the **same colour** and the two join into one shape.
- Draw a **different colour** on top and it cuts away what's underneath. Move it off again and there's a hole.
- A line drawn **across** a filled shape splits it, so the paint bucket and Select work on each side by itself.
- The **eraser** rubs out just the area under it, not whole lines.
- With Select, **drag a box** over part of a shape to pick just that part. Drag it away and it lifts out, leaving a hole.

**Protect a shape** with **Group** (Ctrl+G). Grouped shapes never merge or get cut, and select as one. **Ungroup** (Ctrl+Shift+G) unties them.

**Break apart** (Ctrl+B) does the opposite: it turns the selection into plain painted areas, which merge with the drawing on a merge layer.

Every merge is one step, so Undo puts things back exactly. New layers start as **Keep separate**. To change that, see Preferences > Behaviour.`,
});
