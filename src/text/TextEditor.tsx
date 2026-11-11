// Typing straight onto the canvas. A see-through text box sits over the text (same font, size and turn) and holds
// the caret and selection, while the canvas draws the real text underneath, so what you see is what exports.
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import type { Id, TextShape } from '../core/format';
import { uid } from '../core/doc';
import { store, useStore } from '../core/store';
import { screenToDoc } from '../canvas/view';
import { topShapeAt } from '../canvas/geometry';
import { currentKey } from '../symbols/ops';
import { addShapes } from '../tools/merge-mode';
import { reportEdit } from '../tools/util';
import { fontFamilyCss, lineHeightOf, newTextShape } from './model';
import { textLayout, textMatrix } from './draw';
import { textDefaults, updateTexts } from './ops';

interface Session {
  /** The text being changed, once it exists in the drawing. */
  id: Id | null;
  /** New text not yet added (nothing is added until the first letter is typed). */
  pending: TextShape | null;
}

let session: Session | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

export function editingText(): Session | null {
  return session;
}

/** Starts typing into an existing text shape. */
export function editText(id: Id): void {
  session = { id, pending: null };
  store().setUi({ selection: [id] });
  emit();
}

/** Starts new text at a point (the first line's baseline goes a little under it, so the letters sit where clicked). */
export function startNewText(at: { x: number; y: number }): void {
  const d = textDefaults();
  const s = newTextShape(uid('tx'), { x: at.x, y: at.y + d.size * 0.8 }, { font: d.font, size: d.size, weight: d.weight, align: d.align, color: store().get().ui.color });
  session = { id: null, pending: s };
  emit();
}

/** Stops typing. Text that was never typed into is never added. */
export function stopEditingText(): void {
  if (!session) return;
  const id = session.id;
  session = null;
  emit();
  // Text emptied while typing goes away.
  if (id) {
    const k = currentKey();
    const s = k?.drawing.shapes.find((x) => x.id === id);
    if (s?.type === 'text' && !s.text.trim()) {
      store().update('Remove empty text', (doc) => {
        const d = doc.drawings[k!.drawing.id];
        if (d.kind === 'vector') d.shapes = d.shapes.filter((x) => x.id !== id);
      });
      store().setUi({ selection: [] });
    }
  }
}

function setText(value: string): void {
  if (!session) return;
  if (session.id) {
    updateTexts('Type', (s) => void (s.text = value), { id: session.id, coalesce: `type-${session.id}` });
    return;
  }
  if (!session.pending || !value) return;
  const shape = { ...session.pending, text: value };
  const r = addShapes('Add text', [shape]);
  if (r.result === 'ok') {
    session = { id: shape.id, pending: null };
    store().setUi({ selection: [shape.id] });
    emit();
  } else if (r.result !== 'nothing') {
    reportEdit({ zoom: 1, requestOverlay: () => undefined, hint: () => undefined }, r.result);
    session = null;
    emit();
  }
}

let metricsCtx: OffscreenCanvasRenderingContext2D | null | undefined;

/** Where the first baseline sits inside a CSS line box of the text's line height (font ascent, centred). */
function baselineInLine(s: TextShape): number {
  const lh = lineHeightOf(s);
  try {
    if (metricsCtx === undefined) metricsCtx = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2).getContext('2d') : null;
    if (metricsCtx) {
      metricsCtx.font = `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px ${fontFamilyCss(s.font)}`;
      const m = metricsCtx.measureText('Hg');
      const fa = m.fontBoundingBoxAscent;
      const fd = m.fontBoundingBoxDescent;
      if (Number.isFinite(fa) && Number.isFinite(fd)) return (lh - (fa + fd)) / 2 + fa;
    }
  } catch {
    // Fall back to a typical font.
  }
  return (lh - s.size * 1.2) / 2 + s.size * 0.95;
}

/** Double-click on text with the Select or Text tool: type into it. Returns true when it did. */
export function onTextDoubleClick(e: MouseEvent<HTMLElement>): boolean {
  const { ui } = store().get();
  if (ui.tool !== 'select' && ui.tool !== 'text') return false;
  const r = e.currentTarget.getBoundingClientRect();
  const p = screenToDoc({ zoom: ui.zoom, panX: ui.panX, panY: ui.panY }, e.clientX - r.left, e.clientY - r.top);
  const k = currentKey();
  const hit = k ? topShapeAt(k.drawing.shapes, p.x, p.y, 4 / ui.zoom) : undefined;
  if (hit?.type !== 'text' || k?.layer.locked) return false;
  editText(hit.id);
  return true;
}

export function TextEditor() {
  const s = useSyncExternalStore(subscribe, () => session);
  const doc = useStore((st) => st.doc);
  const zoom = useStore((st) => st.ui.zoom);
  const panX = useStore((st) => st.ui.panX);
  const panY = useStore((st) => st.ui.panY);
  const frame = useStore((st) => st.ui.frame);
  const ref = useRef<HTMLTextAreaElement>(null);
  void doc;
  void frame;
  const k = s ? currentKey() : undefined;
  const found = s?.id && k ? k.drawing.shapes.find((x) => x.id === s.id) : undefined;
  const shape: TextShape | null = s?.pending ?? (found?.type === 'text' ? found : null);

  useEffect(() => {
    if (!s) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [s?.id, s?.pending?.id]);

  // The text went away (undo, another frame, deleted): stop.
  useEffect(() => {
    if (s && !shape) stopEditingText();
  });

  if (!s || !shape) return null;
  const layout = textLayout(shape.text ? shape : { ...shape, text: 'M' });
  const m = textMatrix(shape);
  const lh = lineHeightOf(shape);
  const extra = shape.size * 1.5;
  const left = shape.align === 'center' ? layout.box.x - extra / 2 : shape.align === 'right' ? layout.box.x - extra : layout.box.x;
  const top = -baselineInLine(shape);
  const lines = Math.max(1, shape.text.split('\n').length);
  const z = zoom;
  const style = {
    left: 0,
    top: 0,
    width: `${Math.max(shape.size, layout.box.w) + extra}px`,
    height: `${lines * lh + 2}px`,
    font: `${shape.italic ? 'italic ' : ''}${shape.weight} ${shape.size}px ${fontFamilyCss(shape.font)}`,
    lineHeight: `${lh}px`,
    letterSpacing: `${shape.letterSpacing ?? 0}px`,
    textAlign: shape.align,
    outlineWidth: `${1 / Math.max(0.01, z * Math.hypot(m[0], m[1]))}px`,
    transform: `matrix(${z * m[0]}, ${z * m[1]}, ${z * m[2]}, ${z * m[3]}, ${z * m[4] + panX}, ${z * m[5] + panY}) translate(${left}px, ${top}px)`,
  } as const;
  return (
    <textarea
      ref={ref}
      className="tx-editor"
      style={style}
      value={shape.text}
      spellCheck={false}
      aria-label="Text"
      placeholder=""
      onChange={(e) => setText(e.target.value)}
      onBlur={() => stopEditingText()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          stopEditingText();
        }
      }}
    />
  );
}
