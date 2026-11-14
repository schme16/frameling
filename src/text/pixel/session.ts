/**
 * Typing on a pixel layer. The words are floating (nothing is in the drawing yet): the canvas shows them as pixels on
 * the grid in the Paint colour, snapped to the palette when the layer has its palette lock on, with a caret and a
 * selection. When you finish they are painted into the layer as one undo step, and from then on they are plain pixels.
 */
import type { PixelLayer } from '../../core/format';
import { findLayer } from '../../core/doc';
import type { ToolContext, ToolPointer } from '../../core/registry';
import { currentChoice } from '../../core/choices';
import { store } from '../../core/store';
import { parseHex } from '../../canvas/colors';
import { getHover } from '../../canvas/controller';
import { docToPixel, type RGBA } from '../../canvas/pixels';
import { activeLayer, EDIT_HINTS, type EditResult } from '../../tools/edit';
import { PixelSession } from '../../tools/pixelSession';
import { noteColorUsed } from '../../tools/recent';
import { solidInk, snapToPalette } from '../../pixel/ink';
import { docPalette } from '../../pixel/palette';
import { caretRect, indexAt, insideText, layoutPixelText, selectionRects, type PixelLayout } from './font';
import { getPixelText, onPixelText } from './settings';

export type ClickAway = 'finish' | 'new';

export interface PixelTextSession {
  layerId: string;
  frame: number;
  /** The cell the text starts at (or is centred on, or ends at, by its line up). */
  at: { x: number; y: number };
  text: string;
  /** The selection, as text indexes (start equals end for a plain caret). */
  start: number;
  end: number;
}

let session: PixelTextSession | null = null;
let lastCtx: ToolContext | null = null;
let unwatch: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const onPixelTextSession = (f: () => void): (() => void) => (subs.add(f), () => void subs.delete(f));
export const pixelTextSession = (): PixelTextSession | null => session;

const redraw = () => lastCtx?.requestOverlay();

export function layoutOfSession(s: PixelTextSession | null = session): PixelLayout | null {
  return s ? layoutPixelText(s.text, getPixelText()) : null;
}

function begin(s: PixelTextSession, ctx: ToolContext): void {
  session = s;
  lastCtx = ctx;
  unwatch?.();
  const offStyle = onPixelText(redraw);
  // The colour well and the palette change what the text looks like while you type.
  const offStore = store().subscribe(redraw);
  unwatch = () => {
    offStyle();
    offStore();
  };
  emit();
  redraw();
}

function end(): void {
  session = null;
  unwatch?.();
  unwatch = null;
  emit();
  redraw();
}

/** Changes the words and the selection (from the hidden text box, or a click). */
export function setPixelTextValue(text: string, start: number, endAt: number): void {
  if (!session) return;
  const t = text.replace(/\r\n?/g, '\n');
  const n = t.length;
  session = { ...session, text: t, start: Math.min(n, Math.max(0, start)), end: Math.min(n, Math.max(0, endAt)) };
  emit();
  redraw();
}

/** Moves the whole text by whole pixels (Alt and the arrow keys). */
export function nudgePixelText(dx: number, dy: number): void {
  if (!session) return;
  session = { ...session, at: { x: session.at.x + dx, y: session.at.y + dy } };
  emit();
  redraw();
}

export function cancelPixelText(): void {
  if (session) end();
}

/** The colour the text paints with: the Paint colour, snapped to the palette on a locked layer. */
export function textColour(layer: PixelLayer): RGBA | null {
  const { doc, ui } = store().get();
  const c = parseHex(ui.color);
  if (!c) return null;
  return layer.paletteLock ? snapToPalette(c, docPalette(doc)) : c;
}

/** Finishes the typing: paints the pixels into the layer as one undo step. Returns how it went. */
export function commitPixelText(): EditResult | 'nothing' {
  const s = session;
  if (!s) return 'nothing';
  end();
  if (!s.text.trim()) return 'nothing';
  const { doc, ui } = store().get();
  const layer = findLayer(doc, s.layerId);
  if (!layer || layer.kind !== 'pixel') return 'no-layer';
  if (layer.locked) return report('locked');
  if (!layer.visible) return report('hidden');
  const color = parseHex(ui.color);
  if (!color) return 'nothing';
  // The edit goes to the layer and frame the typing started on, even if you clicked another one to finish.
  const was = { layer: ui.activeLayerId, frame: ui.frame };
  const moved = was.layer !== s.layerId || was.frame !== s.frame;
  if (moved) store().setUi({ activeLayerId: s.layerId, frame: s.frame });
  const ps = new PixelSession(doc, layer, s.frame, { mirror: false, adds: true });
  const ink = ps.lock(solidInk(color));
  const l = layoutPixelText(s.text, getPixelText());
  for (const r of l.rects) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) ps.paint(s.at.x + r.x + x, s.at.y + r.y + y, ink);
  const r = ps.commit('Type pixel text');
  if (moved) store().setUi({ activeLayerId: was.layer, frame: was.frame });
  if (r === 'ok') noteColorUsed(ui.color);
  else if (r !== 'nothing') report(r);
  return r;
}

function report(r: Exclude<EditResult, 'ok'>): EditResult {
  lastCtx?.hint(EDIT_HINTS[r]);
  return r;
}

// ---------------------------------------------------------------- the tool

/** Mouse down with the Text tool on a pixel layer: start typing here, or move the caret, or finish and start somewhere new. */
export function pixelTextDown(e: ToolPointer, ctx: ToolContext, layer: PixelLayer): void {
  lastCtx = ctx;
  const cell = docToPixel(e.x, e.y, layer.pixelSize);
  if (session) {
    const l = layoutOfSession()!;
    const x = cell.x - session.at.x;
    const y = cell.y - session.at.y;
    if (session.layerId === layer.id && insideText(l, x, y)) {
      const i = indexAt(l, x, y);
      dragFrom = i;
      setPixelTextValue(session.text, i, i);
      return;
    }
    const how: ClickAway = currentChoice<ClickAway>('text.pixelClickAway') === 'new' ? 'new' : 'finish';
    commitPixelText();
    if (how === 'finish') return;
  }
  const { problem } = activeLayer();
  if (problem) return ctx.hint(EDIT_HINTS[problem]);
  dragFrom = null;
  begin({ layerId: layer.id, frame: store().get().ui.frame, at: cell, text: '', start: 0, end: 0 }, ctx);
}

let dragFrom: number | null = null;

/** Dragging over the text selects it. */
export function pixelTextMove(e: ToolPointer, layer: PixelLayer): void {
  if (!session || dragFrom === null) return;
  const l = layoutOfSession()!;
  const cell = docToPixel(e.x, e.y, layer.pixelSize);
  const i = indexAt(l, cell.x - session.at.x, cell.y - session.at.y);
  setPixelTextValue(session.text, Math.min(dragFrom, i), Math.max(dragFrom, i));
}

export function pixelTextUp(): void {
  dragFrom = null;
}

const MARK_FILL = 'rgb(155 123 255 / 0.4)';

/** The floating text, the selection, the caret, and where the next click would start. */
export function pixelTextOverlay(g: CanvasRenderingContext2D, ctx: ToolContext, layer: PixelLayer): void {
  lastCtx = ctx;
  const { doc } = store().get();
  const ps = layer.pixelSize;
  const gw = Math.ceil(doc.width / ps);
  const gh = Math.ceil(doc.height / ps);
  const px = 1 / ctx.zoom;
  const s = session && session.layerId === layer.id ? session : null;
  if (!s) {
    const h = getHover();
    if (!h) return;
    // Where the words would start: the caret, on its cell.
    const c = docToPixel(h.x, h.y, ps);
    const lay = layoutPixelText('', getPixelText());
    const k = caretRect(lay, 0);
    g.save();
    g.globalAlpha = 0.55;
    g.lineWidth = 1.5 * px;
    g.strokeStyle = 'rgb(155 123 255)';
    g.strokeRect((c.x + k.x) * ps, (c.y + k.y) * ps, k.w * ps, k.h * ps);
    g.restore();
    return;
  }
  const l = layoutOfSession(s)!;
  const col = textColour(layer);
  g.save();
  g.beginPath();
  g.rect(0, 0, gw * ps, gh * ps);
  g.clip();
  if (col) {
    g.fillStyle = `rgb(${col[0]} ${col[1]} ${col[2]} / ${col[3] / 255})`;
    for (const r of l.rects) g.fillRect((s.at.x + r.x) * ps, (s.at.y + r.y) * ps, r.w * ps, r.h * ps);
  }
  g.restore();
  g.save();
  // A dashed box says the words are still floating: not in the drawing until you finish.
  const b = l.box;
  g.setLineDash([6 * px, 4 * px]);
  g.lineWidth = 3 * px;
  g.strokeStyle = 'rgb(255 255 255 / 0.7)';
  const bx = (s.at.x + b.x - 1) * ps;
  const by = (s.at.y + b.y - 1) * ps;
  const bw = (Math.max(b.w, l.scale) + 2) * ps;
  const bh = (b.h + 2) * ps;
  g.strokeRect(bx, by, bw, bh);
  g.lineWidth = 1.5 * px;
  g.strokeStyle = 'rgb(155 123 255 / 0.95)';
  g.strokeRect(bx, by, bw, bh);
  g.setLineDash([]);
  g.fillStyle = MARK_FILL;
  for (const r of selectionRects(l, s.start, s.end)) g.fillRect((s.at.x + r.x) * ps, (s.at.y + r.y) * ps, r.w * ps, r.h * ps);
  if (s.start === s.end) {
    const k = caretRect(l, s.end);
    g.fillStyle = 'rgb(255 255 255 / 0.95)';
    g.fillRect((s.at.x + k.x) * ps, (s.at.y + k.y) * ps, k.w * ps, k.h * ps);
    g.lineWidth = 1.5 * px;
    g.strokeStyle = 'rgb(155 123 255)';
    g.strokeRect((s.at.x + k.x) * ps, (s.at.y + k.y) * ps, k.w * ps, k.h * ps);
  }
  g.restore();
}
