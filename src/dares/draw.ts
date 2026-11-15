// What the dares that reach the drawing make, as pure functions: shapes for a gift layer, a gentle wobble, a nudge.
// Nothing here knows about the audience gate. The gate hands each dare `ctx.edit`, and the dare calls one of these
// inside that one step, so one Undo takes the whole dare back.
//
// The rules these keep, because somebody may be live:
//   - A gift goes on its OWN new layer on top. It never lands among the work, and deleting that layer undoes it.
//   - A wobble or a nudge moves things a little and loses nothing. Nothing is deleted, cleared, flattened or wiped.
//   - Locked layers are left alone, and there is a cap on gift layers so dares cannot pile up into a mess.
import type { Draft } from 'immer';
import { addOffsets, canOffset, snapOffset } from '../core/offset';
import { celAt, newVectorDrawing, newVectorLayer, uid } from '../core/doc';
import type { Doc, PathPoint, PathShape, Shape, SubPath, VectorLayer } from '../core/format';

export type Rng = () => number;

/** The most gift layers a drawing may hold at once. More dares than this do nothing until the streamer clears some. */
export const MAX_GIFTS = 6;

/** What a layer made by a dare carries in `ext`, so they can be counted and told apart. No viewer is ever named here. */
export const EXT_KEY = 'stream-dares';

export const isGift = (layer: { ext?: Record<string, unknown> }): boolean => !!(layer.ext && layer.ext[EXT_KEY]);

/** A small seedable random source (mulberry32), so tests get the same shapes every time. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

/** Bright, friendly colours for what a dare drops in. */
export const GIFT_COLOURS = ['#ff5d73', '#ffb627', '#3ddc97', '#4cc9f0', '#b980f0', '#ff8fab', '#ffd23f', '#2ec4b6'] as const;

// ---------------------------------------------------------------- outlines

const KAPPA = 0.5522847498;

/** A circle or ellipse as four curves. The first point carries the curve that closes the loop, as the Ellipse tool does. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): SubPath {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return {
    closed: true,
    points: [
      { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
      { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
      { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
      { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
    ],
  };
}

/** A smooth closed curve through the points (Catmull-Rom turned into curves). */
export function smoothClosed(pts: { x: number; y: number }[]): SubPath {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const out: PathPoint[] = pts.map((p, i) => {
    const prev = at(i - 1);
    const next = at(i + 1);
    const prevPrev = at(i - 2);
    return {
      x: p.x,
      y: p.y,
      c1: { x: prev.x + (p.x - prevPrev.x) / 6, y: prev.y + (p.y - prevPrev.y) / 6 },
      c2: { x: p.x - (next.x - prev.x) / 6, y: p.y - (next.y - prev.y) / 6 },
    };
  });
  return { closed: true, points: out };
}

/** A lumpy round blob: `lumps` points round a circle, each pushed in or out a little. */
export function blobPath(cx: number, cy: number, r: number, rng: Rng, lumps = 8, wobble = 0.28): SubPath {
  const pts = [];
  const turn = rng() * Math.PI * 2;
  for (let i = 0; i < lumps; i++) {
    const a = turn + (i * Math.PI * 2) / lumps;
    const rr = r * (1 + (rng() - 0.5) * 2 * wobble);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return smoothClosed(pts);
}

/** A star with straight points. */
export function starPath(cx: number, cy: number, r: number, points = 5, inner = 0.45, turn = -Math.PI / 2): SubPath {
  const pts: PathPoint[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = turn + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return { closed: true, points: pts };
}

/** A heart, sampled finely enough to look smooth at any size a dare uses. */
export function heartPath(cx: number, cy: number, r: number): SubPath {
  const pts: PathPoint[] = [];
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: cx + (x / 17) * r, y: cy - (y / 17) * r });
  }
  return { closed: true, points: pts };
}

export function trianglePath(cx: number, cy: number, r: number, turn = -Math.PI / 2): SubPath {
  const pts = [0, 1, 2].map((i) => ({ x: cx + Math.cos(turn + (i * 2 * Math.PI) / 3) * r, y: cy + Math.sin(turn + (i * 2 * Math.PI) / 3) * r }));
  return { closed: true, points: pts };
}

// ---------------------------------------------------------------- shapes

const solid = (paths: SubPath[], fill: string, opacity = 1, stroke?: { color: string; width: number }, group?: string): PathShape => ({
  id: uid('s'),
  type: 'path',
  paths,
  fill,
  stroke: stroke ? { color: stroke.color, width: stroke.width, join: 'round', cap: 'round' } : null,
  opacity,
  ...(group ? { group } : {}),
});

/** How big a dropped-in thing is: a share of the shorter side of the stage. */
const unit = (w: number, h: number) => Math.min(w, h);

/** A spot to drop something at, away from the very edge so the whole thing shows. */
function spot(w: number, h: number, rng: Rng, margin: number): { x: number; y: number } {
  return { x: between(rng, margin, Math.max(margin, w - margin)), y: between(rng, margin, Math.max(margin, h - margin)) };
}

/** Googly eyes: two white eyes with black outlines and a pupil each, looking somewhere. */
export function googlyShapes(w: number, h: number, rng: Rng): Shape[] {
  const u = unit(w, h);
  const r = u * between(rng, 0.045, 0.075);
  const gap = r * 2.5;
  const c = spot(w, h, rng, r * 3);
  const group = uid('g');
  const ink = Math.max(1, r * 0.14);
  const out: Shape[] = [];
  const look = rng() * Math.PI * 2;
  for (const dx of [-gap / 2, gap / 2]) {
    out.push(solid([ellipsePath(c.x + dx, c.y, r, r)], '#ffffff', 1, { color: '#1b1b1b', width: ink }, group));
    const pr = r * 0.45;
    const off = r * 0.4;
    out.push(solid([ellipsePath(c.x + dx + Math.cos(look) * off, c.y + Math.sin(look) * off, pr, pr)], '#1b1b1b', 1, undefined, group));
  }
  return out;
}

export type DropKind = 'star' | 'heart' | 'blob' | 'triangle';
export const DROP_KINDS: readonly DropKind[] = ['star', 'heart', 'blob', 'triangle'];

/** One friendly shape in a bright colour, with a soft outline. */
export function dropShape(w: number, h: number, rng: Rng, kind: DropKind = pick(rng, DROP_KINDS)): Shape[] {
  const u = unit(w, h);
  const r = u * between(rng, 0.07, 0.12);
  const c = spot(w, h, rng, r * 1.4);
  const colour = pick(rng, GIFT_COLOURS);
  const path =
    kind === 'star' ? starPath(c.x, c.y, r, 5, 0.45, -Math.PI / 2 + between(rng, -0.4, 0.4)) : kind === 'heart' ? heartPath(c.x, c.y, r) : kind === 'triangle' ? trianglePath(c.x, c.y, r, between(rng, 0, Math.PI * 2)) : blobPath(c.x, c.y, r, rng);
  return [solid([path], colour, 1, { color: '#1b1b1b', width: Math.max(1, r * 0.08) })];
}

/** A paint splat: one big lumpy blob and a spray of drops round it, a little see-through so what is under still shows. */
export function splatShapes(w: number, h: number, rng: Rng): Shape[] {
  const u = unit(w, h);
  const r = u * between(rng, 0.06, 0.1);
  const c = spot(w, h, rng, r * 2.2);
  const colour = pick(rng, GIFT_COLOURS);
  const group = uid('g');
  const out: Shape[] = [solid([blobPath(c.x, c.y, r, rng, 9, 0.22)], colour, 0.85, undefined, group)];
  const drops = 7 + Math.floor(rng() * 6);
  for (let i = 0; i < drops; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * between(rng, 1.2, 2.1);
    const dr = r * between(rng, 0.08, 0.25);
    out.push(solid([blobPath(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, dr, rng, 6, 0.2)], colour, 0.85, undefined, group));
  }
  return out;
}

// ---------------------------------------------------------------- gift layers

/** Why a gift could not go in. */
export type GiftRefusal = 'inside-symbol' | 'shared-layers' | 'too-many';

/** How many gift layers the drawing holds. */
export const giftCount = (doc: Pick<Doc, 'layers'>): number => doc.layers.filter((l) => isGift(l)).length;

/** Whether a gift layer can be added right now, and why not. Pure. */
export function giftProblem(doc: Pick<Doc, 'layers' | 'editing' | 'sharedLayers'>): GiftRefusal | null {
  if (doc.editing && doc.editing.length) return 'inside-symbol';
  if (doc.sharedLayers) return 'shared-layers';
  if (giftCount(doc) >= MAX_GIFTS) return 'too-many';
  return null;
}

export const REFUSAL_WORDS: Record<GiftRefusal, string> = {
  'inside-symbol': 'A dare waited: you are editing a symbol, so nothing was dropped in.',
  'shared-layers': 'A dare waited: this drawing shares its layers between boards, so nothing was dropped in.',
  'too-many': 'A dare waited: there are already plenty of audience gifts. Delete a few layers first.',
};

/**
 * Puts `shapes` on a new layer at the top. Call inside `ctx.edit`. Returns the layer's id, or null when it is not
 * allowed (see `giftProblem`). Nothing existing is changed.
 */
export function addGiftLayer(doc: Draft<Doc>, name: string, shapes: Shape[]): string | null {
  if (giftProblem(doc)) return null;
  const layer = newVectorLayer(name) as VectorLayer;
  layer.ext = { [EXT_KEY]: { gift: true } };
  const drawing = newVectorDrawing();
  drawing.shapes = shapes;
  doc.drawings[drawing.id] = drawing;
  layer.cels.push({ id: uid('c'), start: 0, length: Math.max(1, doc.length), drawingId: drawing.id });
  doc.layers.push(layer);
  return layer.id;
}

// ---------------------------------------------------------------- wobble and nudge

/** How far a wobble may move any point, as a share of the shorter side of the stage. Kept small so the line stays itself. */
export const WOBBLE_SHARE = 0.015;

/** How far a nudge moves a drawing, as a share of the shorter side of the stage. */
export const NUDGE_SHARE = 0.03;

export interface WobbleSetup {
  amp: number;
  /** Radians per document pixel. */
  freq: number;
  phaseX: number;
  phaseY: number;
}

export function wobbleSetup(w: number, h: number, rng: Rng): WobbleSetup {
  const u = unit(w, h);
  return { amp: u * WOBBLE_SHARE, freq: (Math.PI * 2) / (u * between(rng, 0.18, 0.3)), phaseX: rng() * Math.PI * 2, phaseY: rng() * Math.PI * 2 };
}

/** Where a point goes. A smooth ripple: neighbours move together, so lines stay smooth and nothing tears. */
export function wobblePoint(p: { x: number; y: number }, s: WobbleSetup): { x: number; y: number } {
  return { x: p.x + Math.sin(p.y * s.freq + s.phaseX) * s.amp, y: p.y + Math.sin(p.x * s.freq + s.phaseY) * s.amp };
}

const moveXY = <T extends { x: number; y: number }>(p: T | undefined, s: WobbleSetup): void => {
  if (!p) return;
  const n = wobblePoint(p, s);
  p.x = n.x;
  p.y = n.y;
};

/** Ripples every stroke and path in a vector drawing. Text, symbols and particles are left as they are. Returns how many shapes moved. */
export function wobbleShapes(shapes: Shape[], s: WobbleSetup): number {
  let moved = 0;
  for (const sh of shapes) {
    if (sh.type === 'stroke') {
      for (const p of sh.points) moveXY(p, s);
      moved++;
    } else if (sh.type === 'path' || sh.type === 'fill') {
      for (const sp of sh.paths)
        for (const p of sp.points) {
          moveXY(p, s);
          moveXY(p.c1, s);
          moveXY(p.c2, s);
        }
      moved++;
    }
  }
  return moved;
}

/** Whether a wobble has something it may move: a visible, unlocked, ordinary drawing layer holding a vector drawing with shapes at this frame. */
export function wobbleTarget(doc: Doc, layerId: string | null, frame: number): { drawingId: string } | null {
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== 'vector' || layer.locked || !layer.visible || layer.rig) return null;
  const cel = celAt(layer, frame);
  const d = cel && doc.drawings[cel.drawingId];
  if (!d || d.kind !== 'vector' || !d.shapes.some((s) => s.type === 'stroke' || s.type === 'path' || s.type === 'fill')) return null;
  return { drawingId: d.id };
}

/** Whether a nudge has something to move: a visible, unlocked layer whose kind can carry an offset, with a drawing at this frame. */
export function nudgeTarget(doc: Doc, layerId: string | null, frame: number): { layerId: string; celId: string } | null {
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer || layer.locked || !layer.visible || !canOffset(layer)) return null;
  const cel = celAt(layer, frame);
  return cel ? { layerId: layer.id, celId: cel.id } : null;
}

/** A nudge, in document pixels: a small step in a random direction. */
export function nudgeStep(w: number, h: number, rng: Rng): { x: number; y: number } {
  const a = rng() * Math.PI * 2;
  const d = unit(w, h) * NUDGE_SHARE;
  return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d) };
}

/** Moves the drawing on a key by `step`, as a key offset (the drawing itself is not redrawn or changed). Call inside `ctx.edit`. */
export function applyNudge(doc: Draft<Doc>, target: { layerId: string; celId: string }, step: { x: number; y: number }): boolean {
  const layer = doc.layers.find((l) => l.id === target.layerId);
  const cel = layer?.cels.find((c) => c.id === target.celId);
  if (!layer || !cel || !canOffset(layer)) return false;
  const px = layer.kind === 'pixel' ? layer.pixelSize : 1;
  const next = snapOffset(addOffsets(cel.offset, step), px);
  if (next) cel.offset = next;
  else delete cel.offset;
  return true;
}
