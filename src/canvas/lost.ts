/**
 * "Where did my drawing go?": when a frame looks empty but something is drawn on it, works out why it can't be seen
 * (a hidden layer or folder, see-through, masked away, or off the page) so a hint can offer to bring it back.
 * A frame with nothing drawn on it at all isn't lost: the empty frame ghost (ghost.ts) covers that.
 * Pure: reads the document only.
 */
import type { Doc, Drawing, Id, Layer, PixelDrawing, Shape } from '../core/format';
import { celAt } from '../core/doc';
import { isInstance, nextKey, poseAt } from '../core/symbols';
import { instanceBounds, shapeBounds, unionRects } from './geometry';
import type { Rect } from './view';

export type LostKind = 'hidden-layer' | 'hidden-folder' | 'clear-layer' | 'clear-folder' | 'masked' | 'clear-shapes' | 'off-page';

export interface LostCause {
  kind: LostKind;
  layerId: Id;
  layerName: string;
  /** The folder that hides it (hidden-folder, clear-folder). */
  folderId?: Id;
  /** The mask layer cutting it away (masked). */
  maskId?: Id;
  /** The see-through shapes (clear-shapes). */
  shapeIds?: Id[];
  /** Where the drawing is, in stage pixels. */
  bounds?: Rect;
}

/** Below this, something is as good as invisible. */
const FAINT = 0.02;

const pixelBoundsCache = new WeakMap<Uint8ClampedArray, Rect | null>();

/** The box of a pixel drawing's painted pixels in art pixels (null when it's empty). */
export function pixelBounds(d: PixelDrawing): Rect | null {
  const hit = pixelBoundsCache.get(d.pixels);
  if (hit !== undefined) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const p = d.pixels;
  for (let y = 0; y < d.height; y++) {
    const row = y * d.width * 4;
    for (let x = 0; x < d.width; x++) {
      if (p[row + x * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  const r = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  pixelBoundsCache.set(d.pixels, r);
  return r;
}

const boundsOf = (doc: Doc, s: Shape): Rect => (isInstance(s) ? instanceBounds(s, doc) : shapeBounds(s));

/** True when the instance's symbol draws something (an empty symbol isn't a lost drawing). */
const meaningful = (doc: Doc, s: Shape): boolean => {
  const b = boundsOf(doc, s);
  return b.w > 0 || b.h > 0;
};

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Content {
  /** Box of everything drawn (null = nothing). */
  all: Rect | null;
  /** Box of what's opaque enough to see. */
  seen: Rect | null;
  /** Shapes drawn but see-through. */
  clear: Id[];
}

function contentOf(doc: Doc, layer: Layer, d: Drawing | undefined): Content {
  const none: Content = { all: null, seen: null, clear: [] };
  if (!d) return none;
  if (d.kind === 'pixel') {
    const r = pixelBounds(d);
    const ps = layer.kind === 'pixel' ? layer.pixelSize : 1;
    const b = r ? { x: r.x * ps, y: r.y * ps, w: r.w * ps, h: r.h * ps } : null;
    return { all: b, seen: b, clear: [] };
  }
  if (d.kind === 'tilemap') {
    const any = d.cells.some((c) => c !== 0);
    const b = any ? { x: 0, y: 0, w: doc.width, h: doc.height } : null;
    return { all: b, seen: b, clear: [] };
  }
  if (d.kind !== 'vector') return none;
  const shapes = d.shapes.filter((s) => meaningful(doc, s));
  if (!shapes.length) return none;
  const opacity = (s: Shape) => ('opacity' in s && typeof s.opacity === 'number' ? s.opacity : 1);
  const seen = shapes.filter((s) => opacity(s) > FAINT);
  return {
    all: unionRects(shapes.map((s) => boundsOf(doc, s))),
    seen: unionRects(seen.map((s) => boundsOf(doc, s))),
    clear: shapes.filter((s) => opacity(s) <= FAINT).map((s) => s.id),
  };
}

/** A key that moves (in-betweens into it or out of it): see-through and off-page are on purpose there. */
function moving(layer: Layer, frame: number): boolean {
  const cel = celAt(layer, frame);
  if (!cel) return false;
  if (cel.tween && nextKey(layer, cel)) return true;
  const prev = layer.cels.find((c) => c.start + c.length === cel.start);
  return !!prev?.tween;
}

/**
 * Why the frame looks empty. null when something can be seen on it (nothing is lost), an empty list when nothing is
 * drawn on it at all, otherwise one cause per layer that has a drawing nobody can see, most likely first.
 */
export function findLost(doc: Doc, frame: number): LostCause[] | null {
  const page: Rect = { x: 0, y: 0, w: doc.width, h: doc.height };
  const causes: LostCause[] = [];
  let shown = false;
  const order: LostKind[] = ['hidden-layer', 'hidden-folder', 'clear-layer', 'clear-folder', 'masked', 'clear-shapes', 'off-page'];
  doc.layers.forEach((layer, i) => {
    if (layer.kind === 'camera' || layer.mask) return;
    const d = poseAt(doc, layer, frame);
    const c = contentOf(doc, layer, d);
    if (!c.all) return;
    const base = { layerId: layer.id, layerName: layer.name, bounds: c.all };
    const folder = layer.folder ? doc.folders?.[layer.folder] : undefined;
    if (!layer.visible) return void causes.push({ kind: 'hidden-layer', ...base });
    if (folder && !folder.visible) return void causes.push({ kind: 'hidden-folder', folderId: folder.id, ...base });
    if (layer.opacity <= FAINT) return void causes.push({ kind: 'clear-layer', ...base });
    if (folder && folder.opacity <= FAINT) return void causes.push({ kind: 'clear-folder', folderId: folder.id, ...base });
    // A 'show' mask above it in the same folder, with nothing drawn where this is, cuts it all away.
    const mask = doc.layers.slice(i + 1).find((m) => m.mask && m.visible && (m.folder ?? null) === (layer.folder ?? null));
    if (mask?.mask === 'show') {
      const mc = contentOf(doc, mask, poseAt(doc, mask, frame));
      const area = c.seen ?? c.all;
      if (!mc.all || !overlaps(mc.all, area)) return void causes.push({ kind: 'masked', maskId: mask.id, ...base });
    }
    // A see-through or off-page drawing on a key that moves is on purpose (fading in, flying in): not lost.
    if (!c.seen) return void (moving(layer, frame) ? (shown = true) : causes.push({ kind: 'clear-shapes', shapeIds: c.clear, ...base }));
    if (!overlaps(c.seen, page)) return void (moving(layer, frame) ? (shown = true) : causes.push({ kind: 'off-page', ...base, bounds: c.seen }));
    shown = true;
  });
  if (shown) return null;
  return causes.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** The plain words for a cause, as the hint says it. */
export function lostMessage(c: LostCause): string {
  const name = `"${c.layerName}"`;
  switch (c.kind) {
    case 'hidden-layer':
      return `Your drawing is here, on the hidden layer ${name}.`;
    case 'hidden-folder':
      return `Your drawing is here, but the folder holding ${name} is hidden.`;
    case 'clear-layer':
      return `Your drawing is here, but layer ${name} is fully see-through (opacity 0).`;
    case 'clear-folder':
      return `Your drawing is here, but the folder holding ${name} is fully see-through (opacity 0).`;
    case 'masked':
      return `Your drawing on ${name} is here, but a mask above it is hiding all of it.`;
    case 'clear-shapes':
      return `Your drawing on ${name} is here, but it is fully see-through (opacity 0).`;
    case 'off-page':
      return `Your drawing on ${name} is here, but it is off the page.`;
  }
}

/** The label of the one-click fix. */
export function lostFixLabel(c: LostCause): string {
  switch (c.kind) {
    case 'hidden-layer':
    case 'hidden-folder':
      return 'Show it';
    case 'clear-layer':
    case 'clear-folder':
    case 'clear-shapes':
      return 'Make it solid';
    case 'masked':
      return 'Turn the mask off';
    case 'off-page':
      return 'Bring it back';
  }
}

/** The nearest frame (either way) where something can be seen, or null. */
export function nearestShown(doc: Doc, frame: number): number | null {
  for (let k = 1; k < doc.length; k++) {
    for (const f of [frame - k, frame + k]) if (f >= 0 && f < doc.length && findLost(doc, f) === null) return f;
  }
  return null;
}

/** A shape on a visible, locked layer under the point (not the active layer), for "that's on a locked layer". */
export function lockedLayerAt(doc: Doc, frame: number, x: number, y: number, skip: Id | null, hit: (shapes: Shape[], x: number, y: number) => Shape | undefined): Layer | undefined {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.id === skip || !l.visible || l.kind !== 'vector' || l.mask) continue;
    const d = poseAt(doc, l, frame);
    if (d?.kind !== 'vector') continue;
    if (hit(d.shapes, x, y)) return l.locked ? l : undefined;
  }
  return undefined;
}
