/**
 * While a symbol is open for editing, the scene around it is drawn dimmed underneath, placed so the symbol's own
 * content lines up with where its instance sits. The instance itself is left out (its live content is drawn on top).
 */
import type { Doc } from '../core/format';
import { celAt } from '../core/doc';
import { renderFrame, type Ctx2D } from '../core/render';
import { editingMatrix, invert, rootDoc } from '../core/symbols';
import type { Rect } from './view';

/** How strongly the surroundings show, 0 to 1. */
export const BACKDROP_ALPHA = 0.35;

const docs = new WeakMap<Doc, Doc>();

/** The saved document with the instance being edited taken out, at the frame editing started on. */
export function backdropDoc(doc: Doc): Doc {
  let out = docs.get(doc);
  if (out) return out;
  const root = rootDoc(doc);
  const f0 = doc.editing?.[0];
  out = root;
  if (f0?.instanceId) {
    const drawings = { ...root.drawings };
    for (const l of root.layers) {
      const c = celAt(l, f0.frame);
      const d = c ? drawings[c.drawingId] : undefined;
      if (d?.kind === 'vector' && d.shapes.some((s) => s.id === f0.instanceId)) drawings[d.id] = { ...d, shapes: d.shapes.filter((s) => s.id !== f0.instanceId) };
    }
    out = { ...root, drawings };
  }
  docs.set(doc, out);
  return out;
}

let cache: { doc: Doc; w: number; h: number; rect: string; canvas: OffscreenCanvas } | null = null;

export function paintEditBackdrop(g: Ctx2D, doc: Doc, rect: Rect): void {
  const stack = doc.editing ?? [];
  // Opened from the Library rather than from an instance: nothing to line up with.
  if (!stack.length || stack.some((f) => !f.instanceId)) return;
  const target = g.canvas as { width: number; height: number };
  const key = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  if (!cache || cache.doc !== doc || cache.w !== target.width || cache.h !== target.height || cache.rect !== key) {
    const canvas = cache && cache.w === target.width && cache.h === target.height ? cache.canvas : new OffscreenCanvas(Math.max(1, target.width), Math.max(1, target.height));
    const bg = canvas.getContext('2d')!;
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.clearRect(0, 0, canvas.width, canvas.height);
    bg.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
    const m = invert(editingMatrix(doc));
    bg.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    renderFrame(bg, backdropDoc(doc), stack[0].frame, { background: false, camera: false });
    cache = { doc, w: target.width, h: target.height, rect: key, canvas };
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = BACKDROP_ALPHA;
  g.drawImage(cache.canvas, 0, 0);
  g.restore();
}
