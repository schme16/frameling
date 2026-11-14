// Slices: named rectangles on a pixel layer, with an optional 9-patch middle and pivot. Plain functions on a layer (an
// immer draft or a plain object), so they can be tested. All numbers are in the layer's art pixels.
import type { Doc, Id, Layer, PixelLayer, Slice, SliceKey } from '../../core/format';
import { uid } from '../../core/doc';
import { activeId, artboardsOf } from '../../artboards/model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SLICE_COLORS = ['#ff5d73', '#ffb020', '#7bd36b', '#35c2d6', '#6f8cff', '#b57bff', '#ff7bd0', '#c9d34f'];

/** The colour a slice is drawn in: its own, else one picked from its name so the same name keeps its colour. */
export function sliceColor(s: Pick<Slice, 'name' | 'color'>): string {
  if (s.color && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s.color)) return s.color.slice(0, 7);
  let h = 0;
  for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) >>> 0;
  return SLICE_COLORS[h % SLICE_COLORS.length];
}

/** A name not used on the layer yet: "Slice 1", "Slice 2"... */
export function freshSliceName(slices: readonly Slice[] | undefined, base = 'Slice'): string {
  const names = new Set((slices ?? []).map((s) => s.name.toLowerCase()));
  for (let n = (slices?.length ?? 0) + 1; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

const whole = (n: number): number => Math.round(Number.isFinite(n) ? n : 0);

/** Rectangle from two corners, either way round, as whole pixels (at least 1 x 1). */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x0 = Math.min(whole(a.x), whole(b.x));
  const y0 = Math.min(whole(a.y), whole(b.y));
  return { x: x0, y: y0, w: Math.max(1, Math.abs(whole(b.x) - whole(a.x))), h: Math.max(1, Math.abs(whole(b.y) - whole(a.y))) };
}

type Geometry = Pick<Slice, 'x' | 'y' | 'w' | 'h' | 'center' | 'pivot'>;

/** Keeps a slice's numbers sensible: whole, at least 1 x 1, the middle inside it (and the same for each of its keys). */
export function tidy(s: Slice): void {
  tidyGeometry(s);
  if (s.keys) for (const k of s.keys) tidyGeometry(k);
}

function tidyGeometry(s: Geometry): void {
  s.x = whole(s.x);
  s.y = whole(s.y);
  s.w = Math.max(1, whole(s.w));
  s.h = Math.max(1, whole(s.h));
  if (s.center) {
    const c = s.center;
    const x0 = Math.max(s.x, Math.min(s.x + s.w - 1, whole(c.x)));
    const y0 = Math.max(s.y, Math.min(s.y + s.h - 1, whole(c.y)));
    const x1 = Math.max(x0 + 1, Math.min(s.x + s.w, whole(c.x) + Math.max(1, whole(c.w))));
    const y1 = Math.max(y0 + 1, Math.min(s.y + s.h, whole(c.y) + Math.max(1, whole(c.h))));
    s.center = { x: x0, y: y0, w: Math.min(x1, s.x + s.w) - x0, h: Math.min(y1, s.y + s.h) - y0 };
  }
  if (s.pivot) s.pivot = { x: whole(s.pivot.x), y: whole(s.pivot.y) };
}

export function addSlice(layer: PixelLayer, r: Rect, name?: string): Slice {
  const s: Slice = { id: uid('sl'), name: name?.trim() || freshSliceName(layer.slices), x: r.x, y: r.y, w: r.w, h: r.h };
  tidy(s);
  (layer.slices ??= []).push(s);
  return s;
}

export function removeSlice(layer: PixelLayer, id: Id): boolean {
  const i = layer.slices?.findIndex((s) => s.id === id) ?? -1;
  if (i < 0) return false;
  layer.slices!.splice(i, 1);
  if (!layer.slices!.length) delete layer.slices;
  return true;
}

// ---------------------------------------------------------------- slices that change between frames

const geometryOf = (g: Geometry): Geometry => ({ x: g.x, y: g.y, w: g.w, h: g.h, ...(g.center ? { center: { ...g.center } } : {}), ...(g.pivot ? { pivot: { ...g.pivot } } : {}) });
const sameGeometry = (a: Geometry, b: Geometry): boolean => JSON.stringify(geometryOf(a)) === JSON.stringify(geometryOf(b));

/** The key in force at a frame: the last one at or before it, or the first when the frame is before them all. */
export function keyAt(s: Pick<Slice, 'keys'>, frame: number): SliceKey | null {
  const keys = s.keys;
  if (!keys?.length) return null;
  let k = keys[0];
  for (const o of keys) if (o.frame <= frame) k = o;
  return k;
}

/** The slice as it looks at a frame (the slice itself when it has no keys). */
export function sliceAt(s: Slice, frame: number): Slice {
  const k = keyAt(s, frame);
  if (!k) return s;
  const { center: _c, pivot: _p, ...rest } = s;
  return { ...rest, ...geometryOf(k) };
}

/** Writes the geometry of `view` (a slice as shown at `frame`) into the slice: into the key for that frame when the slice has keys. */
export function writeSliceAt(s: Slice, frame: number, view: Geometry): void {
  if (!s.keys?.length) {
    Object.assign(s, { x: view.x, y: view.y, w: view.w, h: view.h });
    if (view.center) s.center = { ...view.center };
    else delete s.center;
    if (view.pivot) s.pivot = { ...view.pivot };
    else delete s.pivot;
    return;
  }
  const cur = keyAt(s, frame)!;
  if (sameGeometry(cur, view)) return;
  const keys = s.keys.filter((k) => k.frame !== frame);
  keys.push({ frame, ...geometryOf(view) });
  keys.sort((a, b) => a.frame - b.frame);
  s.keys = keys;
  syncFirstKey(s);
}

/** The slice's own numbers always match its first key. */
function syncFirstKey(s: Slice): void {
  const k = s.keys?.[0];
  if (!k) return;
  Object.assign(s, { x: k.x, y: k.y, w: k.w, h: k.h });
  if (k.center) s.center = { ...k.center };
  else delete s.center;
  if (k.pivot) s.pivot = { ...k.pivot };
  else delete s.pivot;
}

/** Starts a key at this frame. A slice that stayed put gets its first key at frame 0 too, so it is where it was until this frame. */
export function addKeyAt(s: Slice, frame: number): void {
  const now = geometryOf(sliceAt(s, frame));
  const keys = s.keys?.length ? [...s.keys] : [{ frame: 0, ...geometryOf(s) }];
  if (!keys.some((k) => k.frame === frame)) keys.push({ frame, ...now });
  keys.sort((a, b) => a.frame - b.frame);
  s.keys = keys;
  syncFirstKey(s);
}

/** Removes the key at this frame (the slice goes back to the key before it). The last key left makes it a plain slice again. */
export function removeKeyAt(s: Slice, frame: number): void {
  if (!s.keys) return;
  const keys = s.keys.filter((k) => k.frame !== frame);
  if (keys.length === s.keys.length) return;
  s.keys = keys;
  syncFirstKey(s);
  if (keys.length <= 1) delete s.keys;
}

/** Back to one place on every frame: the one it has at this frame. */
export function stopMoving(s: Slice, frame: number): void {
  const k = keyAt(s, frame);
  delete s.keys;
  if (!k) return;
  Object.assign(s, { x: k.x, y: k.y, w: k.w, h: k.h });
  if (k.center) s.center = { ...k.center };
  else delete s.center;
  if (k.pivot) s.pivot = { ...k.pivot };
  else delete s.pivot;
}

/**
 * The keys a slice has for frames start to end, counted from `start` (so the first is at 0): the key in force at `start`
 * comes first. A slice without keys gives one key at 0.
 */
export function keysForRange(s: Slice, start: number, end: number): SliceKey[] {
  if (!s.keys?.length) return [{ frame: 0, ...geometryOf(s) }];
  const out: SliceKey[] = [{ ...keyAt(s, start)!, frame: 0 }];
  for (const k of s.keys) if (k.frame > start && k.frame <= end) out.push({ ...k, frame: k.frame - start });
  return out;
}

/** Moves a slice, its middle and its pivot together. */
export function moveSlice(s: Slice, dx: number, dy: number): void {
  s.x += dx;
  s.y += dy;
  if (s.center) s.center = { ...s.center, x: s.center.x + dx, y: s.center.y + dy };
  if (s.pivot) s.pivot = { x: s.pivot.x + dx, y: s.pivot.y + dy };
}

/** The four borders of a 9-patch: how far in from each side the stretchy middle starts. Null when it is not a 9-patch. */
export function borders(s: Slice): { left: number; top: number; right: number; bottom: number } | null {
  const c = s.center;
  if (!c) return null;
  return { left: c.x - s.x, top: c.y - s.y, right: s.x + s.w - (c.x + c.w), bottom: s.y + s.h - (c.y + c.h) };
}

/** Sets the middle from four borders. A border can be 0 (that side has none); the middle is at least 1 x 1. */
export function setBorders(s: Slice, b: { left: number; top: number; right: number; bottom: number }): void {
  const left = Math.max(0, Math.min(s.w - 1, whole(b.left)));
  const top = Math.max(0, Math.min(s.h - 1, whole(b.top)));
  const right = Math.max(0, Math.min(s.w - left - 1, whole(b.right)));
  const bottom = Math.max(0, Math.min(s.h - top - 1, whole(b.bottom)));
  s.center = { x: s.x + left, y: s.y + top, w: s.w - left - right, h: s.h - top - bottom };
}

/** A starting 9-patch: a third in from each side (at least 1 pixel, but never eating the whole slice). */
export function defaultBorders(s: Pick<Slice, 'w' | 'h'>): { left: number; top: number; right: number; bottom: number } {
  const bx = Math.max(0, Math.min(Math.floor(s.w / 3), Math.floor((s.w - 1) / 2)));
  const by = Math.max(0, Math.min(Math.floor(s.h / 3), Math.floor((s.h - 1) / 2)));
  return { left: bx, right: bx, top: by, bottom: by };
}

// ---------------------------------------------------------------- picking and dragging on the canvas

export type Grab = 'body' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'pivot' | 'cl' | 'cr' | 'ct' | 'cb';

export interface Hit {
  slice: Slice;
  grab: Grab;
}

/**
 * What is under a point (art pixels, fractions allowed). `reach` is how far off an edge still counts, in art pixels (it
 * shrinks as the picture zooms in so handles keep their size on screen). The pivot and the 9-patch lines win over the
 * edges, the edges over the body, and the last slice (drawn on top) over the ones below.
 */
export function hitSlice(slices: readonly Slice[], x: number, y: number, reach: number): Hit | null {
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i];
    if (s.pivot && Math.abs(x - s.pivot.x) <= reach * 1.2 && Math.abs(y - s.pivot.y) <= reach * 1.2) return { slice: s, grab: 'pivot' };
  }
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i];
    const c = s.center;
    if (c && x >= s.x - reach && x <= s.x + s.w + reach && y >= s.y - reach && y <= s.y + s.h + reach) {
      const inX = x >= c.x - reach && x <= c.x + c.w + reach;
      const inY = y >= c.y - reach && y <= c.y + c.h + reach;
      if (inY && Math.abs(x - c.x) <= reach && c.x > s.x + reach) return { slice: s, grab: 'cl' };
      if (inY && Math.abs(x - (c.x + c.w)) <= reach && c.x + c.w < s.x + s.w - reach) return { slice: s, grab: 'cr' };
      if (inX && Math.abs(y - c.y) <= reach && c.y > s.y + reach) return { slice: s, grab: 'ct' };
      if (inX && Math.abs(y - (c.y + c.h)) <= reach && c.y + c.h < s.y + s.h - reach) return { slice: s, grab: 'cb' };
    }
  }
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i];
    const nearL = Math.abs(x - s.x) <= reach;
    const nearR = Math.abs(x - (s.x + s.w)) <= reach;
    const nearT = Math.abs(y - s.y) <= reach;
    const nearB = Math.abs(y - (s.y + s.h)) <= reach;
    const inX = x >= s.x - reach && x <= s.x + s.w + reach;
    const inY = y >= s.y - reach && y <= s.y + s.h + reach;
    if (!inX || !inY) continue;
    if (nearT && nearL) return { slice: s, grab: 'nw' };
    if (nearT && nearR) return { slice: s, grab: 'ne' };
    if (nearB && nearL) return { slice: s, grab: 'sw' };
    if (nearB && nearR) return { slice: s, grab: 'se' };
    if (nearT) return { slice: s, grab: 'n' };
    if (nearB) return { slice: s, grab: 's' };
    if (nearL) return { slice: s, grab: 'w' };
    if (nearR) return { slice: s, grab: 'e' };
  }
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { slice: s, grab: 'body' };
  }
  return null;
}

/** The slice as it was when a drag started, moved by (dx, dy) art pixels the way `grab` says. */
export function dragSlice(start: Slice, grab: Grab, dx: number, dy: number): Slice {
  const s: Slice = structuredClone(start);
  dx = whole(dx);
  dy = whole(dy);
  if (grab === 'body') {
    moveSlice(s, dx, dy);
    return s;
  }
  if (grab === 'pivot') {
    s.pivot = { x: (start.pivot?.x ?? 0) + dx, y: (start.pivot?.y ?? 0) + dy };
    return s;
  }
  if (s.center && (grab === 'cl' || grab === 'cr' || grab === 'ct' || grab === 'cb')) {
    const b = borders(start)!;
    if (grab === 'cl') b.left += dx;
    if (grab === 'cr') b.right -= dx;
    if (grab === 'ct') b.top += dy;
    if (grab === 'cb') b.bottom -= dy;
    setBorders(s, b);
    return s;
  }
  let x0 = s.x;
  let y0 = s.y;
  let x1 = s.x + s.w;
  let y1 = s.y + s.h;
  if (grab.includes('w')) x0 = Math.min(x0 + dx, x1 - 1);
  if (grab.includes('e')) x1 = Math.max(x1 + dx, x0 + 1);
  if (grab.includes('n')) y0 = Math.min(y0 + dy, y1 - 1);
  if (grab.includes('s')) y1 = Math.max(y1 + dy, y0 + 1);
  s.x = x0;
  s.y = y0;
  s.w = x1 - x0;
  s.h = y1 - y0;
  tidy(s);
  return s;
}

// ---------------------------------------------------------------- finding them

/** The layers whose slices count: pixel layers that are shown (a hidden layer's slices stay put but are not exported). */
export function sliceLayers(layers: readonly Layer[]): PixelLayer[] {
  return layers.filter((l): l is PixelLayer => l.kind === 'pixel' && !l.reference && l.visible && !!l.slices?.length);
}

export interface ExportSlice extends Slice {
  /** The layer it sits on, for naming a clash. */
  layerName: string;
}

/**
 * Every slice of the shown pixel layers, in pixels of the exported picture: art pixels times the layer's pixel size
 * times the export scale. A name two layers share gets the layer's name after it, so names stay unique. With the frames
 * exported (`range`, timeline frames), a slice that changes between frames is measured on the first exported frame and
 * keeps its later keys, counted from that frame.
 */
export function slicesForExport(layers: readonly Layer[], scale: number, range?: { start: number; end: number }): ExportSlice[] {
  const out: ExportSlice[] = [];
  const seen = new Map<string, number>();
  for (const l of sliceLayers(layers)) {
    const k = l.pixelSize * scale;
    const r = (n: number) => Math.round(n * k);
    const place = <T extends Geometry>(g: T): T => ({
      ...g,
      x: r(g.x),
      y: r(g.y),
      w: Math.max(1, r(g.w)),
      h: Math.max(1, r(g.h)),
      ...(g.center ? { center: { x: r(g.center.x), y: r(g.center.y), w: Math.max(1, r(g.center.w)), h: Math.max(1, r(g.center.h)) } } : {}),
      ...(g.pivot ? { pivot: { x: r(g.pivot.x), y: r(g.pivot.y) } } : {}),
    });
    for (const s of l.slices!) {
      let name = s.name;
      const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
      seen.set(name.toLowerCase(), n);
      if (n > 1) name = `${name} ${n}`;
      const keys = range && s.keys?.length ? keysForRange(s, range.start, range.end) : [];
      const first = keys[0] ? { ...s, ...geometryOf(keys[0]) } : s;
      if (keys[0]) {
        if (!keys[0].center) delete first.center;
        if (!keys[0].pivot) delete first.pivot;
      }
      const { keys: _k, ...plain } = first;
      out.push({ ...place(plain as Slice), name, layerName: l.name, ...(keys.length > 1 ? { keys: keys.map(place) } : {}) });
    }
  }
  return out;
}

/** The layers of every board, the open board's first. The open board's layers are the document's own. */
export function boardLayers(doc: Doc): { boardId: Id; boardName: string; open: boolean; layers: Layer[] }[] {
  const open = activeId(doc);
  // With shared layers the slices belong to the layers, which every board has: they are listed once, on the open board.
  const list = artboardsOf(doc).map((a) => ({ boardId: a.id, boardName: a.name, open: a.id === open, layers: a.id === open ? doc.layers : doc.sharedLayers ? [] : (a.content?.layers ?? []) }));
  return [...list.filter((b) => b.open), ...list.filter((b) => !b.open)];
}

/** A layer with slices, and the board it is on. */
export interface SliceOwner {
  boardId: Id;
  boardName: string;
  /** True for the board that is open: the timeline frame is its own, so keys can be set at it. */
  open: boolean;
  layer: PixelLayer;
}

/**
 * Every pixel layer with slices on any board (hidden layers included, for editing), the open board first and the active
 * layer first within it, otherwise top layer first.
 */
export function sliceOwners(doc: Doc, activeLayerId?: Id | null): SliceOwner[] {
  const out: SliceOwner[] = [];
  for (const b of boardLayers(doc)) {
    const mine = b.layers.filter((l): l is PixelLayer => l.kind === 'pixel' && !l.reference && !!l.slices?.length).reverse();
    mine.sort((x, y) => (y.id === activeLayerId ? 1 : 0) - (x.id === activeLayerId ? 1 : 0));
    for (const layer of mine) out.push({ boardId: b.boardId, boardName: b.boardName, open: b.open, layer });
  }
  return out;
}

/** Finds a pixel layer by id on any board (works on a draft too). */
export function findPixelLayer(doc: Doc, id: Id): { layer: PixelLayer; open: boolean } | null {
  const hit = (layers: readonly Layer[]) => layers.find((l): l is PixelLayer => l.kind === 'pixel' && l.id === id);
  const own = hit(doc.layers);
  if (own) return { layer: own, open: true };
  for (const a of doc.artboards ?? []) {
    const l = a.content ? hit(a.content.layers) : undefined;
    if (l) return { layer: l, open: false };
  }
  return null;
}

/** The slice with this id, wherever it is. */
export function findSlice(doc: Doc, id: Id): { slice: Slice; layer: PixelLayer; open: boolean } | null {
  for (const b of boardLayers(doc)) for (const l of b.layers) if (l.kind === 'pixel') {
    const s = l.slices?.find((x) => x.id === id);
    if (s) return { slice: s, layer: l, open: b.open };
  }
  return null;
}

/** Slices of every board, by board name: for the panel when boards are in use. The open board's layers are the document's. */
export function allSliceCount(doc: Doc): number {
  let n = 0;
  const count = (layers: readonly Layer[]) => layers.forEach((l) => l.kind === 'pixel' && (n += l.slices?.length ?? 0));
  count(doc.layers);
  for (const a of artboardsOf(doc)) if (a.content && !doc.sharedLayers) count(a.content.layers);
  return n;
}
