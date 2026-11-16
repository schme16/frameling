// Draw on, on the open document: what the panel and the commands call. The editing itself is in model.ts.
import type { Doc, Id, Trim } from '../core/format';
import { findLayer } from '../core/doc';
import { store } from '../core/store';
import { withChoice } from '../core/choices';
import { toast } from '../ui/toast';
import { clearTrims, drawLineOn, outlineCount, setTrimAt, trimLines, trimView, type DrawWay, type TrimPatch, type TrimView } from './model';
import type { OrderChoice } from './choices';

/** How long (in frames) the next "draw it on" takes. Missing = a second at the document's speed. */
let lastFrames: number | null = null;
export const drawFrames = (): number => lastFrames ?? Math.max(2, Math.min(48, store().get().doc.fps));
export function setDrawFrames(n: number): void {
  lastFrames = Number.isFinite(n) ? Math.max(2, Math.min(600, Math.round(n))) : null;
}

/** The picked shapes' lines on the key at the playhead, and how they look there; null when nothing pickable is picked. */
export function pickedView(): TrimView | null {
  const { doc, ui } = store().get();
  return trimView(doc, ui.activeLayerId, ui.frame, ui.selection);
}

const hint = (why: string) => void toast(why, { kind: 'warn' });

/** The picked shapes' ids and lines, or a hint saying what to do. */
function picked(): { layerId: Id; lines: string[]; ids: Id[]; multi: boolean } | null {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (!layer || layer.kind !== 'vector') {
    hint('Pick a drawing layer, then pick the line you want to draw itself.');
    return null;
  }
  const cel = layer.cels.find((c) => ui.frame >= c.start && ui.frame < c.start + c.length);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!cel || d?.kind !== 'vector') {
    hint('There is no drawing on this frame. Go to a frame with the line on it.');
    return null;
  }
  const lines = trimLines(d.shapes, ui.selection);
  if (!lines.length) {
    hint('Pick a line first: a brush line, or a shape with an outline. Then try again.');
    return null;
  }
  const sel = new Set(ui.selection);
  const multi = d.shapes.some((s) => sel.has(s.id) && outlineCount(s) > 1);
  return { layerId: layer.id, lines, ids: ui.selection, multi };
}

/** Runs a change on the document and hands back what it gave (the store's own update returns nothing). */
function change<T>(label: string, fn: (doc: Doc) => T, opts?: { coalesce?: string }): T {
  let out!: T;
  store().update(label, (doc) => void (out = fn(doc as Doc)), opts);
  return out;
}

/** Sets how much of the picked lines shows at the playhead (a key is cut there when it is not on one). */
export function setPickedTrim(patch: TrimPatch, label = 'Change how much of the line shows'): void {
  const p = picked();
  if (!p) return;
  const { frame } = store().get().ui;
  const part = patch.start !== undefined ? 's' : patch.end !== undefined ? 'e' : patch.offset !== undefined ? 'o' : 'x';
  const out = change(label, (doc) => setTrimAt(doc, p.layerId, frame, p.lines, patch), { coalesce: `trim-${part}-${frame}-${p.lines.join(',')}` });
  if (typeof out === 'string') return hint(out);
  // A key cut at the playhead has shapes with new ids: keep them picked.
  store().setUi({ selection: out.ids });
}

/** Makes the picked lines draw themselves (or erase themselves) from the playhead. */
export function drawPickedLine(way: DrawWay): void {
  const p = picked();
  if (!p) return;
  const go = (order: Trim['order']) => {
    const { frame } = store().get().ui;
    const out = change(way === 'on' ? 'Make the line draw itself' : 'Make the line erase itself', (doc) => drawLineOn(doc, p.layerId, frame, p.lines, way, drawFrames(), order));
    if (typeof out === 'string') return hint(out);
    const now = store().get();
    const cel = findLayer(now.doc, p.layerId)?.cels.find((c) => c.start === out.startFrame);
    const d = cel ? now.doc.drawings[cel.drawingId] : undefined;
    store().setUi({ frame: out.startFrame, playing: false, ...(d?.kind === 'vector' ? { selection: d.shapes.filter((s) => p.lines.includes(s.origin ?? s.id)).map((s) => s.id) } : {}) });
    toast(`${way === 'on' ? 'The line draws itself' : 'The line erases itself'} from frame ${out.startFrame + 1} to frame ${out.endFrame + 1}. Press play, or drag the End slider on either key to change it.`, { kind: 'success', action: { label: 'Undo', run: () => store().undo() } });
  };
  if (p.multi) withChoice<OrderChoice>('trim.order', (v) => go(v === 'inOrder' ? 'inOrder' : undefined));
  else go(undefined);
}

/** Takes the trim off the picked lines on every key, so the whole line shows. */
export function showWholeLine(): void {
  const p = picked();
  if (!p) return;
  let n = 0;
  store().update('Show the whole line', (doc) => void (n = clearTrims(doc, p.layerId, p.lines)));
  toast(n ? 'The whole line shows again, on every key.' : 'That line was already showing all of itself.', { action: n ? { label: 'Undo', run: () => store().undo() } : undefined });
}

export type { TrimView };
