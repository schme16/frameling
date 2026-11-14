// What an import hands over: layers with their drawings, ready to become a new drawing or to join the open one. Plain data
// in and out, no DOM, so every part is tested.
import type { Draft } from 'immer';
import { newDoc, newPixelLayer, newVectorLayer, uid } from '../core/doc';
import type { Cel, Doc, Drawing, Gradient, Id, Layer, LayerFolder, PathPoint, PixelDrawing, Shape, SubPath, VectorDrawing } from '../core/format';
import { trimPixels } from '../core/pixelBounds';

export interface Pieces {
  /** The size of the picture the layers were made for, in pixels. */
  width: number;
  height: number;
  /** Bottom first, like a drawing's own. */
  layers: Layer[];
  drawings: Record<Id, Drawing>;
  folders: Record<Id, LayerFolder>;
  /** Set when a picture was made smaller to fit (1 = as it was drawn). */
  scale?: number;
}

export interface Stage {
  width: number;
  height: number;
}

/** Frames a still picture is held for in a drawing of its own, so it shows while you animate other things over it. */
export const STILL_LENGTH = 24;

// ---------------------------------------------------------------- fitting

/** How much to scale a picture of `w` x `h` so it fits in `stage`: 1 when it fits already, smaller when it doesn't. */
export function fitScale(w: number, h: number, stage: Stage): number {
  if (w <= stage.width && h <= stage.height) return 1;
  return Math.min(stage.width / w, stage.height / h);
}

/** Moves and scales one shape (points, curves, line widths, gradients, text). */
export function mapShape(s: Shape, k: number, dx: number, dy: number): Shape {
  const pt = <P extends { x: number; y: number }>(p: P): P => ({ ...p, x: p.x * k + dx, y: p.y * k + dy });
  const grad = (g: Gradient): Gradient => ({ ...g, from: pt(g.from), to: pt(g.to) });
  if (s.type === 'path') {
    const paths: SubPath[] = s.paths.map((sp) => ({
      closed: sp.closed,
      points: sp.points.map((p): PathPoint => ({ ...pt(p), ...(p.c1 && p.c2 ? { c1: pt(p.c1), c2: pt(p.c2) } : {}) })),
    }));
    return { ...s, paths, stroke: s.stroke ? { ...s.stroke, width: s.stroke.width * k } : null, ...(s.fillGradient ? { fillGradient: grad(s.fillGradient) } : {}), ...(s.strokeGradient ? { strokeGradient: grad(s.strokeGradient) } : {}) };
  }
  if (s.type === 'text') {
    return { ...s, transform: { ...s.transform, x: s.transform.x * k + dx, y: s.transform.y * k + dy, scaleX: s.transform.scaleX * k, scaleY: s.transform.scaleY * k } };
  }
  return s;
}

/** The longest side of a drawing of its own. */
export const MAX_SIDE = 4096;

/** A vector layer per group of shapes, each on a drawing held for `length` frames. */
export function vectorPieces(layers: { name: string; visible: boolean; shapes: Shape[] }[], size: Stage, opts: { stage?: Stage | null; length: number }): Pieces {
  const stage = opts.stage ?? null;
  // Into an open drawing: as big as it was drawn when it fits, smaller when it doesn't, and in the middle.
  const k = stage ? fitScale(size.width, size.height, stage) : Math.min(1, MAX_SIDE / Math.max(size.width, size.height));
  const dx = stage ? Math.floor((stage.width - size.width * k) / 2) : 0;
  const dy = stage ? Math.floor((stage.height - size.height * k) / 2) : 0;
  const out: Pieces = { width: stage ? stage.width : Math.max(1, Math.round(size.width * k)), height: stage ? stage.height : Math.max(1, Math.round(size.height * k)), layers: [], drawings: {}, folders: {}, ...(k < 1 ? { scale: k } : {}) };
  for (const l of layers) {
    const layer = newVectorLayer(l.name);
    layer.visible = l.visible;
    const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: k === 1 && !dx && !dy ? l.shapes : l.shapes.map((s) => mapShape(s, k, dx, dy)) };
    out.drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start: 0, length: opts.length, drawingId: d.id });
    out.layers.push(layer);
  }
  return out;
}

// ---------------------------------------------------------------- pixel layers placed on a stage

/** A drawing moved by (dx, dy) art pixels and cut to the grid; null when nothing of it is left on the grid. */
export function shiftDrawing(d: PixelDrawing, dx: number, dy: number, gridW: number, gridH: number): PixelDrawing | null {
  const x0 = (d.x ?? 0) + dx;
  const y0 = (d.y ?? 0) + dy;
  const l = Math.max(0, x0);
  const t = Math.max(0, y0);
  const r = Math.min(gridW, x0 + d.width);
  const b = Math.min(gridH, y0 + d.height);
  if (r <= l || b <= t) return null;
  const w = r - l;
  const h = b - t;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((t + y - y0) * d.width + (l - x0)) * 4;
    px.set(d.pixels.subarray(from, from + w * 4), y * w * 4);
  }
  const tr = trimPixels(px, w, h, l, t);
  if (!tr.width || !tr.height) return null;
  const out: PixelDrawing = { id: d.id, kind: 'pixel', width: tr.width, height: tr.height, pixels: tr.pixels };
  if (tr.x) out.x = tr.x;
  if (tr.y) out.y = tr.y;
  return out;
}

/** Pixel pieces centred on `stage` (cut off where they hang over), or left where they are when there is no stage. */
export function centreOn(p: Pieces, stage: Stage): { pieces: Pieces; cutOff: boolean } {
  const dx = Math.floor((stage.width - p.width) / 2);
  const dy = Math.floor((stage.height - p.height) / 2);
  const drawings: Record<Id, Drawing> = {};
  let cutOff = p.width > stage.width || p.height > stage.height;
  const layers = p.layers.map((l) => {
    if (l.kind !== 'pixel') return l;
    const cels: Cel[] = [];
    for (const c of l.cels) {
      const d = p.drawings[c.drawingId];
      if (d?.kind !== 'pixel') continue;
      const moved = shiftDrawing(d, dx, dy, stage.width, stage.height);
      if (!moved) {
        if (d.width && d.height) cutOff = true;
        continue;
      }
      drawings[moved.id] = moved;
      cels.push(c);
    }
    return { ...l, cels };
  });
  return { pieces: { width: stage.width, height: stage.height, layers, drawings, folders: p.folders }, cutOff };
}

// ---------------------------------------------------------------- becoming a drawing

/** A new drawing made of the pieces. `pixel` makes it a pixel drawing (its first layer is replaced either way). */
export function docFromPieces(p: Pieces, name: string, opts: { length?: number; fps?: number } = {}): Doc {
  const doc = newDoc({ name, width: Math.max(1, p.width), height: Math.max(1, p.height), length: opts.length ?? STILL_LENGTH, fps: opts.fps ?? 12, background: null });
  doc.layers = p.layers.length ? p.layers : [newVectorLayer('Layer 1')];
  doc.drawings = { ...p.drawings };
  if (Object.keys(p.folders).length) doc.folders = { ...p.folders };
  return doc;
}

/** Adds the pieces to a draft of the open drawing, on top of what is there. */
export function addPieces(doc: Draft<Doc>, p: Pieces): void {
  const d = doc as Doc;
  d.layers.push(...p.layers);
  Object.assign(d.drawings, p.drawings);
  if (Object.keys(p.folders).length) d.folders = { ...d.folders, ...p.folders };
}

/** The blank pixel layer a pixel drawing starts with, for callers that want one on an empty page. */
export const blankPixelLayer = (name: string) => newPixelLayer(name, 1);
