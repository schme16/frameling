/**
 * One Transform session: the box round the selection, what has been done to it so far, and landing it.
 *
 * The document is never touched until you commit. The preview is the canvas's live layer (the same way a Select drag
 * shows), so Escape puts everything back by just letting go of it, and the whole session lands as ONE undo step however
 * many drags it took. Landing reuses what the typed numbers use: `landMatrix` for shapes (src/tools/select-land.ts) and
 * `editPixels` for pixels (src/pixel/commands.ts), so a typed turn and a dragged turn go through the same door.
 */
import { useSyncExternalStore } from 'react';
import type { Doc, Id } from '../core/format';
import { store } from '../core/store';
import { requestOverlay, setLive } from '../canvas/controller';
import { transformShape, type Rect } from '../canvas/geometry';
import { gridPixels } from '../core/pixelBounds';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { landMatrix, selectionTarget, type Target } from '../tools/select-land';
import { activeIsMerge, setCut } from '../tools/merge-mode';
import { editPixels } from '../pixel/commands';
import type { Img, PixelBox } from '../pixel/transform';
import { activePixelDrawing, activePixelGrid, dropFloating, isFloating, onPixelSelection, pixelSelection, setSelectionShownAs } from '../select/pixel-state';
import { clearPixels, extractPixels, maskBounds, maskFromAlpha, maskToImage, overlayPixels, type Mask } from '../select/mask';
import { frameOf, isIdentity, toArt, type Frame } from './box';
import { isLossless, pixelOp, resamplePixels, type Resample } from './pixels';
import { resampleWay } from './settings';

export type SessionKind = 'vector' | 'pixel';

interface Pixels {
  size: number;
  mask: Mask;
  box: PixelBox;
  /** The drawing with the selected pixels taken out. */
  base: Uint8ClampedArray;
  /** Only the selected pixels, and the mask as an image: what every preview resamples from. */
  lifted: Img;
  maskImg: Img;
}

export interface Session {
  kind: SessionKind;
  layerId: Id;
  frame: number;
  doc: Doc;
  selection: readonly Id[];
  f: Frame;
  /** What kinds of change were made (Move, Resize, Turn, Slant), to name the undo step. */
  used: Set<string>;
  target?: Target;
  px?: Pixels;
}

let session: Session | null = null;
let version = 0;
const listeners = new Set<() => void>();
let watching: unknown = null;
let unwatch: (() => void) | null = null;

function changed(): void {
  version++;
  for (const fn of listeners) fn();
  requestOverlay();
}

/** Re-renders a component when the session or its box changes. */
export function useTransformVersion(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => version,
  );
}

export const getSession = (): Session | null => session;

/** True when the box has been moved, turned or changed in any way: there is something to apply or put back. */
export const isDirty = (): boolean => !!session && !isIdentity(session.f.m);

// ---------------------------------------------------------------- what is selected

const boundsCache = new WeakMap<Mask, PixelBox | null>();
const boxOfMask = (m: Mask): PixelBox | null => {
  if (!boundsCache.has(m)) boundsCache.set(m, maskBounds(m));
  return boundsCache.get(m) ?? null;
};

/** The box round what is selected on the layer you are on, and which kind of thing it is. Null when nothing is. */
export function selectionBox(): { kind: SessionKind; r0: Rect } | null {
  const a = activePixelGrid();
  if (a) {
    const m = pixelSelection();
    const b = m && boxOfMask(m);
    if (!m || !b) return null;
    const s = a.layer.pixelSize;
    return { kind: 'pixel', r0: { x: b.x0 * s, y: b.y0 * s, w: (b.x1 - b.x0 + 1) * s, h: (b.y1 - b.y0 + 1) * s } };
  }
  const t = selectionTarget();
  return t ? { kind: 'vector', r0: t.bounds } : null;
}

/** The frame to draw and hit-test: the session's, or a fresh one round the selection when no session has begun. */
export function currentFrame(): Frame | null {
  if (session) return session.f;
  const b = selectionBox();
  return b ? frameOf(b.r0) : null;
}

/** Why a session can't begin here, in plain words, or null when it can. */
export function whyNot(): string | null {
  const { layer, problem } = activeLayer();
  if (problem) return EDIT_HINTS[problem];
  if (!layer || (layer.kind !== 'vector' && layer.kind !== 'pixel')) return 'Transform works on vector and pixel layers. Pick one in the timeline first.';
  if (!selectionBox()) return layer.kind === 'pixel' ? 'Select some pixels first (the Select tool), then transform them.' : 'Click a shape to transform it, or pick several with Select first.';
  return null;
}

// ---------------------------------------------------------------- beginning, changing, ending

function watch(): void {
  const st = store();
  if (watching === st) return;
  unwatch?.();
  watching = st;
  unwatch = st.subscribe(() => {
    if (session && !stillHere(session)) drop(true);
  });
  if (!pixelWatch) pixelWatch = onPixelSelection(() => {
    if (session && !stillHere(session)) drop(true);
  });
}
let pixelWatch: (() => void) | null = null;

function stillHere(s: Session): boolean {
  const { doc, ui } = store().get();
  if (doc !== s.doc || ui.frame !== s.frame || ui.activeLayerId !== s.layerId || ui.selection !== s.selection) return false;
  return s.kind !== 'pixel' || pixelSelection() === s.px!.mask;
}

/** Begins a session on what is selected. Null (with the reason in `why`) when it can't. */
export function begin(): Session | null {
  watch();
  if (session) return session;
  if (isFloating()) dropFloating();
  const sel = selectionBox();
  if (!sel || whyNot()) return null;
  const { doc, ui } = store().get();
  const base = { layerId: ui.activeLayerId as Id, frame: ui.frame, doc, selection: ui.selection, f: frameOf(sel.r0), used: new Set<string>() };
  if (sel.kind === 'vector') {
    const target = selectionTarget();
    if (!target) return null;
    session = { ...base, kind: 'vector', target };
  } else {
    const a = activePixelGrid()!;
    const mask = pixelSelection()!;
    const box = boxOfMask(mask)!;
    const d = activePixelDrawing();
    const pixels = d ? gridPixels(d, a.width, a.height) : new Uint8ClampedArray(a.width * a.height * 4);
    const lifted = { width: a.width, height: a.height, pixels: extractPixels(pixels, mask) };
    session = {
      ...base,
      kind: 'pixel',
      px: { size: a.layer.pixelSize, mask, box, base: clearPixels(pixels, mask), lifted, maskImg: { width: a.width, height: a.height, pixels: maskToImage(mask) } },
    };
  }
  changed();
  return session;
}

/** Sets the whole change (and the pivot), and shows it. `used` names what it was, for the undo step. */
export function setFrame(f: Pick<Frame, 'm' | 'pivot'>, used?: string): void {
  if (!session) return;
  session.f = { ...session.f, m: f.m, pivot: f.pivot };
  if (used) session.used.add(used);
  preview();
  changed();
}

/** What a vector or pixel session shows while it is open. */
function preview(): void {
  const s = session;
  if (!s) return;
  if (!isDirty()) {
    setLive(null);
    setSelectionShownAs(null);
    return;
  }
  if (s.kind === 'vector') {
    const t = s.target!;
    const moved = new Map(t.originals.map((o) => [o.id, transformShape(o, s.f.m)]));
    setLive({ layerId: s.layerId, kind: 'vector', drawing: { ...t.drawing, shapes: t.drawing.shapes.map((x) => moved.get(x.id) ?? x) } });
    return;
  }
  const out = pixelsAfter(s);
  if (!out) return;
  const c = liveCanvas(out.width, out.height);
  const g = c?.getContext('2d') as CanvasRenderingContext2D | null | undefined;
  if (!c || !g) return;
  g.putImageData(new ImageData(out.pixels as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  setLive({ layerId: s.layerId, kind: 'pixel', canvas: c, width: out.width, height: out.height });
  setSelectionShownAs(out.mask);
}

/** What the pixels would be with the change landed, and the selection that goes with them. The same as `editPixels` makes. */
export function pixelsAfter(s: Session, how: Resample = resampleWay()): { pixels: Uint8ClampedArray; mask: Mask; width: number; height: number } | null {
  const px = s.px;
  if (!px) return null;
  const { width, height } = px.lifted;
  const ma = toArt(s.f.m, px.size);
  const moved = resamplePixels(px.lifted, px.box, ma, how);
  const movedMask = resamplePixels(px.maskImg, px.box, ma, how);
  return { pixels: overlayPixels(px.base, moved, width, height, 0, 0), mask: maskFromAlpha(movedMask, width, height), width, height };
}

type LiveCanvas = HTMLCanvasElement | OffscreenCanvas;
let canvas: LiveCanvas | null = null;
function liveCanvas(w: number, h: number): LiveCanvas | null {
  if (canvas && canvas.width === w && canvas.height === h) return canvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
  else if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    canvas = c.getContext('2d') ? c : null;
  }
  return canvas;
}

/** Lets go of the session without landing it. `told` is for a change that happened behind its back. */
function drop(told = false): void {
  const s = session;
  if (!s) return;
  const dirty = isDirty();
  session = null;
  setLive(null);
  setSelectionShownAs(null);
  changed();
  if (told && dirty) notify('Transform put back: something else changed while it was open.');
}

/** Puts everything back as it was (Escape). */
export function cancel(): void {
  drop();
}

let say: ((m: string) => void) | null = null;
/** Where friendly one-liners go (the canvas hint); set by the tool when it has a context. */
export function sayWith(fn: ((m: string) => void) | null): void {
  say = fn;
}
const notify = (m: string): void => say?.(m);

export interface Landed {
  ok: boolean;
  /** The pixels were picked again, so what came out is not exactly what went in. */
  lossy: boolean;
}

/** The name of the undo step: what was done, or Transform when it was several things. */
export const labelOf = (s: Session): string => (s.used.size === 1 ? [...s.used][0] : 'Transform');

/**
 * Lands the session as one undo step. Nothing to land (the box was never changed) just ends it. What is selected stays
 * selected, so the box is still there for another go.
 */
export function commit(): Landed {
  const s = session;
  if (!s) return { ok: true, lossy: false };
  if (!isDirty()) {
    drop();
    return { ok: true, lossy: false };
  }
  if (!stillHere(s)) {
    drop(true);
    return { ok: false, lossy: false };
  }
  session = null;
  const label = labelOf(s);
  if (s.kind === 'vector') {
    const { result, ids } = landMatrix(label, s.target!, s.f.m);
    setLive(null);
    if (activeIsMerge() && result === 'ok') {
      // Landed the merge way: joins its colour and cuts what it covers, and what came out is the new selection.
      setCut(null);
      store().setUi({ selection: (ids ?? []) as Id[] });
    }
    if (result !== 'ok' && result !== 'nothing') notify(EDIT_HINTS[result]);
    changed();
    return { ok: result === 'ok', lossy: false };
  }
  const px = s.px!;
  const ma = toArt(s.f.m, px.size);
  const how = resampleWay();
  const lossy = !isLossless(ma, px.box);
  const ok = editPixels(label, pixelOp(ma, how), 'transform');
  setLive(null);
  setSelectionShownAs(null);
  changed();
  return { ok, lossy: ok && lossy };
}
