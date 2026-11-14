/**
 * The pixel selection, and pixels lifted off the drawing while they're being moved (a "floating selection").
 *
 * The selection is a mask over the active pixel layer's art grid. It isn't part of the document, and it stays put
 * across frames, so you can select a spot once and work on it frame after frame. Each undo step remembers the
 * selection from before and after it, so Undo and Redo bring the outline back along with the pixels.
 *
 * Moving selected pixels lifts them: the drawing shows the move live (through the canvas's live preview) and nothing
 * in the document changes until they're dropped (deselect, switch tool, frame or layer). The whole move, however many
 * drags and nudges it took, lands as one undo step. Undo while they're lifted just puts them back.
 */
import { useSyncExternalStore } from 'react';
import type { Id, PixelDrawing, PixelLayer } from '../core/format';
import { celAt, findLayer, pixelGrid } from '../core/doc';
import { store, type Store } from '../core/store';
import { hint, requestOverlay, setLive } from '../canvas/controller';
import { activeLayer, setActivePixels, EDIT_HINTS } from '../tools/edit';
import { gridPixels, setGridPixels } from '../core/pixelBounds';
import { clearPixels, extractPixels, maskEmpty, overlayPixels, shiftMask, type Mask } from './mask';
import { reducedMotion } from '../ui/prefs';

/** The pixel Select tool's id. Lifted pixels drop when another tool is picked. */
export const PIXEL_SELECT_TOOL = 'pixel-select';

interface Floating {
  layerId: Id;
  frame: number;
  /** The drawing they came from (null when pasted onto an empty frame). */
  drawingId: Id | null;
  /** That drawing's pixels when they were lifted, to notice anything else changing it meanwhile. */
  from: Uint8ClampedArray | null;
  width: number;
  height: number;
  /** The drawing with the lifted pixels taken out (or as it was, for a paste or a copy). */
  base: Uint8ClampedArray;
  /** The lifted pixels, where they started. */
  src: Uint8ClampedArray;
  /** The selection, where it started. */
  mask: Mask;
  dx: number;
  dy: number;
  label: string;
  /** A paste always lands, even if it wasn't moved. */
  pasted: boolean;
  /** The selection before this started, for Undo to go back to. */
  selBefore: Mask | null;
}

let sel: Mask | null = null;
let float: Floating | null = null;
let shifted: { f: Floating; dx: number; dy: number; m: Mask } | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  if (!float) committed = sel;
  version++;
  for (const fn of listeners) fn();
  animateAnts();
  requestOverlay();
}

/** Re-renders a component when the selection changes (React). */
export function usePixelSelectionVersion(): number {
  watch();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => version,
  );
}

export function onPixelSelection(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The active layer when it's a pixel layer, with its grid size. */
export function activePixelGrid(): { layer: PixelLayer; width: number; height: number } | null {
  const { doc, ui } = store().get();
  const l = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!l || l.kind !== 'pixel') return null;
  return { layer: l, ...pixelGrid(doc, l) };
}

/** The drawing on the active pixel layer at this frame, if any. */
export function activePixelDrawing(): PixelDrawing | null {
  const { doc, ui } = store().get();
  const a = activePixelGrid();
  if (!a) return null;
  const cel = celAt(a.layer, ui.frame);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  return d && d.kind === 'pixel' ? d : null;
}

/** The selection on the active pixel layer (where the lifted pixels are now, while they're moving), or null. */
export function pixelSelection(): Mask | null {
  watch();
  const a = activePixelGrid();
  if (!a) return null;
  if (float) {
    if (float.layerId !== a.layer.id) return null;
    if (!shifted || shifted.f !== float || shifted.dx !== float.dx || shifted.dy !== float.dy) shifted = { f: float, dx: float.dx, dy: float.dy, m: shiftMask(float.mask, float.dx, float.dy) };
    return shifted.m;
  }
  if (!sel || sel.width !== a.width || sel.height !== a.height) return null;
  return sel;
}

export function hasPixelSelection(): boolean {
  return !!pixelSelection();
}

/** Replaces the selection (null or an empty mask = nothing selected). Drops lifted pixels first. */
export function setPixelSelection(m: Mask | null): void {
  watch();
  if (float) dropFloating();
  const next = m && !maskEmpty(m) ? m : null;
  if (next === sel) return;
  sel = next;
  changed();
}

/** The selection as stored, whichever layer is active (for tests and the overlay). */
export function rawPixelSelection(): Mask | null {
  return sel;
}

export function isFloating(): boolean {
  watch();
  return !!float;
}

export function floatingOffset(): { dx: number; dy: number } | null {
  return float ? { dx: float.dx, dy: float.dy } : null;
}

// ---------------------------------------------------------------- lifting and dropping

/**
 * Lifts the selected pixels off the active drawing so they can be moved. `copy` leaves the originals where they
 * are. Returns false (with a friendly hint) when there's nothing it can lift.
 */
export function liftSelection(copy = false, label = copy ? 'Copy pixels' : 'Move pixels'): boolean {
  watch();
  if (float) return true;
  const m = pixelSelection();
  const a = activePixelGrid();
  if (!m || !a) return false;
  const { problem } = activeLayer();
  if (problem) {
    hint(EDIT_HINTS[problem]);
    return false;
  }
  const d = activePixelDrawing();
  const pixels = d ? gridPixels(d, a.width, a.height) : new Uint8ClampedArray(a.width * a.height * 4);
  float = {
    layerId: a.layer.id,
    frame: store().get().ui.frame,
    drawingId: d?.id ?? null,
    from: d?.pixels ?? null,
    width: a.width,
    height: a.height,
    base: copy ? pixels : clearPixels(pixels, m),
    src: extractPixels(pixels, m),
    mask: m,
    dx: 0,
    dy: 0,
    label,
    pasted: copy,
    selBefore: sel,
  };
  showLive();
  changed();
  return true;
}

/** Puts pixels down as floating, ready to move: a paste. `src` and `mask` are the size of the active layer's grid. */
export function floatPixels(src: Uint8ClampedArray, mask: Mask, label = 'Paste'): boolean {
  watch();
  if (float) dropFloating();
  const a = activePixelGrid();
  if (!a || mask.width !== a.width || mask.height !== a.height) return false;
  const { problem } = activeLayer();
  if (problem) {
    hint(EDIT_HINTS[problem]);
    return false;
  }
  const d = activePixelDrawing();
  float = {
    layerId: a.layer.id,
    frame: store().get().ui.frame,
    drawingId: d?.id ?? null,
    from: d?.pixels ?? null,
    width: a.width,
    height: a.height,
    base: d ? gridPixels(d, a.width, a.height) : new Uint8ClampedArray(a.width * a.height * 4),
    src,
    mask,
    dx: 0,
    dy: 0,
    label,
    pasted: true,
    selBefore: sel,
  };
  sel = mask;
  showLive();
  changed();
  return true;
}

/** Moves the lifted pixels to an offset (whole art pixels) from where they started. */
export function moveFloatingTo(dx: number, dy: number): void {
  if (!float || (float.dx === dx && float.dy === dy)) return;
  float.dx = dx;
  float.dy = dy;
  showLive();
  changed();
}

/** How far a duplicate lands from the original, in art pixels (right and down). */
export const DUPLICATE_STEP = 1;

/**
 * Duplicate (Ctrl+D): a copy of the selected pixels, lifted and set one pixel down and right, ready to drag. The
 * originals stay. Lifted pixels land first, so it copies them where they are.
 */
export function duplicateSelection(): boolean {
  watch();
  if (float) dropFloating();
  if (!liftSelection(true, 'Duplicate pixels')) return false;
  moveFloatingTo(DUPLICATE_STEP, DUPLICATE_STEP);
  return true;
}

/** Nudges the selected pixels (lifting them first). Every nudge before they drop is one undo step. */
export function nudgeSelection(dx: number, dy: number): boolean {
  if (!float && !liftSelection()) return false;
  moveFloatingTo(float!.dx + dx, float!.dy + dy);
  return true;
}

/** The drawing as it would be with the lifted pixels put down where they are now. */
export function floatingComposite(): Uint8ClampedArray | null {
  const f = float;
  if (!f) return null;
  return overlayPixels(f.base, f.src, f.width, f.height, f.dx, f.dy);
}

/** Puts the lifted pixels down where they are, as one undo step. The selection moves with them. */
export function dropFloating(): void {
  const f = float;
  if (!f) return;
  const out = floatingComposite()!;
  const moved = shiftMask(f.mask, f.dx, f.dy);
  float = null;
  sel = maskEmpty(moved) ? null : moved;
  if (f.dx || f.dy || f.pasted) landing(f, () => writeBack(f, out));
  setLive(null);
  changed();
}

/** Writes the lifted pixels' result into the drawing they belong to. */
function writeBack(f: Floating, pixels: Uint8ClampedArray): void {
  const { doc, ui } = store().get();
  if (ui.activeLayerId === f.layerId && ui.frame === f.frame) {
    const r = setActivePixels(f.label, pixels);
    if (r !== 'ok') hint(EDIT_HINTS[r]);
    return;
  }
  // Already somewhere else (another frame or layer): put them back into the drawing they came from.
  const d = f.drawingId ? doc.drawings[f.drawingId] : undefined;
  if (d && d.kind === 'pixel' && d.pixels === f.from) {
    store().update(f.label, (doc2) => {
      const dd = doc2.drawings[f.drawingId!];
      if (dd && dd.kind === 'pixel') setGridPixels(dd, pixels, f.width, f.height);
    });
    return;
  }
  hint('The pasted pixels were let go of, because the frame they were on changed.');
}

/** Puts lifted pixels back where they came from, without changing anything (Escape on a move, or Undo). */
export function cancelFloating(): void {
  const f = float;
  if (!f) return;
  float = null;
  sel = f.pasted && f.label === 'Paste' ? null : f.mask;
  setLive(null);
  changed();
}

/** Throws the lifted pixels away, keeping the hole they left (Delete while moving). One undo step. */
export function deleteFloating(label = 'Delete pixels'): void {
  const f = float;
  if (!f) return;
  float = null;
  sel = shiftMask(f.mask, f.dx, f.dy);
  if (maskEmpty(sel)) sel = null;
  if (f.base !== f.from) landing(f, () => writeBack({ ...f, label }, f.base));
  setLive(null);
  changed();
}

/** The lifted pixels and their mask where they are now (for Copy while moving). */
export function floatingPixels(): { pixels: Uint8ClampedArray; mask: Mask } | null {
  const f = float;
  if (!f) return null;
  const empty = new Uint8ClampedArray(f.src.length);
  return { pixels: overlayPixels(empty, f.src, f.width, f.height, f.dx, f.dy), mask: shiftMask(f.mask, f.dx, f.dy) };
}

// ---------------------------------------------------------------- the selection in undo and redo

/** The selection before and after each undo step, by the step's id. */
const marks = new Map<number, { before: Mask | null; after: Mask | null }>();
const MARKS_KEPT = 400;
/** The selection as it stood after the last step or selection change. */
let committed: Mask | null = null;
/** Set while lifted pixels land, so their step remembers the selection from before they were lifted. */
let landingBefore: { m: Mask | null } | null = null;
let seenIds: { undo: number | null; redo: number | null } = { undo: null, redo: null };
let newestId = 0;

function landing(f: Floating, write: () => void): void {
  landingBefore = { m: f.selBefore };
  try {
    write();
  } finally {
    landingBefore = null;
  }
}

/** Called on every store change: notes the selection for new steps, and puts it back on Undo and Redo. */
function followHistory(s: Store, docChanged: boolean): void {
  const was = seenIds;
  const now = s.historyIds();
  seenIds = now;
  if (!docChanged) return;
  if (now.undo !== null && now.undo > newestId) {
    // A new step.
    newestId = now.undo;
    marks.set(now.undo, { before: landingBefore ? landingBefore.m : committed, after: sel });
    if (marks.size > MARKS_KEPT) marks.delete(marks.keys().next().value!);
    committed = sel;
    return;
  }
  if (now.undo !== null && now.undo === was.undo && now.redo === null) {
    // More of the same step (a drag that keeps going).
    const m = marks.get(now.undo);
    if (m) m.after = sel;
    return;
  }
  let to: Mask | null | undefined;
  if (now.redo !== null && now.redo === was.undo && now.redo !== was.redo) to = marks.get(now.redo)?.before;
  else if (now.undo !== null && now.undo === was.redo && now.undo !== was.undo) to = marks.get(now.undo)?.after;
  if (to === undefined || float || to === sel) return;
  sel = to;
  changed();
}

// ---------------------------------------------------------------- live preview

type LiveCanvas = HTMLCanvasElement | OffscreenCanvas;
let liveCanvas: LiveCanvas | null = null;

function canvasFor(w: number, h: number): LiveCanvas | null {
  if (liveCanvas && liveCanvas.width === w && liveCanvas.height === h) return liveCanvas;
  if (typeof OffscreenCanvas !== 'undefined') liveCanvas = new OffscreenCanvas(w, h);
  else if (typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      liveCanvas = c.getContext('2d') ? c : null;
    } catch {
      liveCanvas = null;
    }
  }
  return liveCanvas;
}

function showLive(): void {
  const f = float;
  if (!f) return;
  const c = canvasFor(f.width, f.height);
  if (!c) return;
  const g = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!g) return;
  const out = floatingComposite()!;
  g.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, f.width, f.height), 0, 0);
  setLive({ layerId: f.layerId, kind: 'pixel', canvas: c, width: f.width, height: f.height });
}

// ---------------------------------------------------------------- keeping up with the document

let watching: Store | null = null;
let lastDocId = '';

/** Follows the store: a new document clears the selection; lifted pixels drop or go back when things change. */
function watch(): void {
  const s = store();
  if (watching === s) return;
  watching = s;
  sel = null;
  float = null;
  shifted = null;
  committed = null;
  marks.clear();
  seenIds = s.historyIds();
  newestId = Math.max(newestId, seenIds.undo ?? 0, seenIds.redo ?? 0);
  lastDocId = s.get().doc.id;
  let prev = s.get();
  s.subscribe(() => {
    if (store() !== s) return;
    const now = s.get();
    const was = prev;
    prev = now;
    if (now.doc.id !== lastDocId) {
      lastDocId = now.doc.id;
      marks.clear();
      seenIds = s.historyIds();
      if (sel || float) {
        sel = null;
        float = null;
        changed();
      }
      return;
    }
    followHistory(s, now.doc !== was.doc);
    const f = float;
    if (!f) return;
    const ui = now.ui;
    if (ui.tool !== PIXEL_SELECT_TOOL || ui.activeLayerId !== f.layerId || ui.frame !== f.frame) {
      // Leaving the pixels: they land where they are, in the drawing they came from.
      if (ui.tool !== was.ui.tool || ui.activeLayerId !== was.ui.activeLayerId || ui.frame !== was.ui.frame) dropFloating();
      return;
    }
    if (now.doc !== was.doc) {
      // Something else changed the drawing underneath (undo, a command): let go and put the pixels back.
      const layer = findLayer(now.doc, f.layerId);
      const cel = layer ? celAt(layer, f.frame) : undefined;
      const d = cel ? now.doc.drawings[cel.drawingId] : undefined;
      const pixels = d && d.kind === 'pixel' ? d.pixels : null;
      if (pixels !== f.from) cancelFloating();
    }
  });
}

// ---------------------------------------------------------------- marching ants

let antsTimer: ReturnType<typeof setInterval> | null = null;

function animateAnts(): void {
  const want = !!(sel || float) && typeof window !== 'undefined' && !reducedMotion();
  if (want && !antsTimer) antsTimer = setInterval(() => requestOverlay(), 120);
  else if (!want && antsTimer) {
    clearInterval(antsTimer);
    antsTimer = null;
  }
}

/** For tests: forget everything. */
export function resetPixelSelection(): void {
  sel = null;
  float = null;
  shifted = null;
  committed = null;
  marks.clear();
  watching = null;
  setLive(null);
  animateAnts();
}
