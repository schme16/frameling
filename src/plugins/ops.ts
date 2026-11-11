// The only changes a plugin can make to a drawing: a short, checked list. A batch of them is applied in one
// store.update, so the whole batch is one step in Undo. Anything wrong in a batch stops all of it (nothing half done).
import type { Draft } from 'immer';
import type { Doc, Drawing, Layer, Shape } from '../core/format';
import { uid } from '../core/doc';
import { scaleAbout, transformShapes, type Matrix } from '../canvas/geometry';
import { flipH, flipV } from '../pixel/transform';

export type PluginOp =
  | { op: 'flipDrawing'; drawingId: string; axis: 'horizontal' | 'vertical' }
  | { op: 'transformDrawing'; drawingId: string; matrix: number[] }
  | { op: 'setPixels'; drawingId: string; pixels: Uint8ClampedArray | Uint8Array | number[] }
  | { op: 'setLayer'; layerId: string; name?: string; visible?: boolean; locked?: boolean; opacity?: number }
  | { op: 'setDocument'; name?: string; fps?: number; background?: string | null }
  | { op: 'setShapeStyle'; drawingId: string; shapeId: string; color?: string; fill?: string | null; opacity?: number }
  | { op: 'removeShape'; drawingId: string; shapeId: string }
  | { op: 'addMarker'; frame: number; name: string }
  | { op: 'removeMarker'; markerId: string }
  | { op: 'addClip'; name: string; start: number; end: number; loop?: boolean }
  | { op: 'removeClip'; clipId: string }
  | { op: 'addSwatch'; name: string; color: string };

export const OP_NAMES = ['flipDrawing', 'transformDrawing', 'setPixels', 'setLayer', 'setDocument', 'setShapeStyle', 'removeShape', 'addMarker', 'removeMarker', 'addClip', 'removeClip', 'addSwatch'] as const;

export const MAX_OPS = 5000;

export class OpProblem extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, what: string, max = 80): string => {
  if (typeof v !== 'string') throw new OpProblem(`${what} must be text.`);
  return v.slice(0, max);
};

function drawingOf(doc: Draft<Doc>, id: unknown): Draft<Drawing> {
  const d = typeof id === 'string' ? doc.drawings[id] : undefined;
  if (!d) throw new OpProblem(`There's no drawing "${String(id).slice(0, 40)}".`);
  return d;
}

function layerOf(doc: Draft<Doc>, id: unknown): Draft<Layer> {
  const l = doc.layers.find((x) => x.id === id);
  if (!l) throw new OpProblem(`There's no layer "${String(id).slice(0, 40)}".`);
  return l;
}

function shapeIndex(shapes: Shape[], id: unknown): number {
  const i = shapes.findIndex((s) => s.id === id);
  if (i < 0) throw new OpProblem(`There's no shape "${String(id).slice(0, 40)}" in that drawing.`);
  return i;
}

/** Applies one op to the document being changed. Throws OpProblem when the op is wrong. */
export function applyOp(doc: Draft<Doc>, raw: unknown): void {
  if (!isObj(raw) || typeof raw.op !== 'string') throw new OpProblem('Each change needs an "op".');
  const o = raw as Record<string, any>;
  switch (o.op) {
    case 'flipDrawing': {
      const d = drawingOf(doc, o.drawingId);
      if (o.axis !== 'horizontal' && o.axis !== 'vertical') throw new OpProblem('axis must be "horizontal" or "vertical".');
      if (d.kind === 'vector') {
        const m = o.axis === 'horizontal' ? scaleAbout(-1, 1, doc.width / 2, doc.height / 2) : scaleAbout(1, -1, doc.width / 2, doc.height / 2);
        d.shapes = transformShapes(d.shapes as Shape[], m) as Draft<Shape>[];
      } else if (d.kind === 'pixel') {
        const img = { width: d.width, height: d.height, pixels: d.pixels as Uint8ClampedArray };
        d.pixels = o.axis === 'horizontal' ? flipH(img, 'canvas') : flipV(img, 'canvas');
      } else throw new OpProblem('Tilemap drawings cannot be flipped by a plugin.');
      return;
    }
    case 'transformDrawing': {
      const d = drawingOf(doc, o.drawingId);
      if (d.kind !== 'vector') throw new OpProblem('transformDrawing works on vector drawings only.');
      const m = o.matrix;
      if (!Array.isArray(m) || m.length !== 6 || !m.every(fin)) throw new OpProblem('matrix must be six numbers [a, b, c, d, e, f].');
      d.shapes = transformShapes(d.shapes as Shape[], m as unknown as Matrix) as Draft<Shape>[];
      return;
    }
    case 'setPixels': {
      const d = drawingOf(doc, o.drawingId);
      if (d.kind !== 'pixel') throw new OpProblem('setPixels works on pixel drawings only.');
      const p = o.pixels;
      const len = d.width * d.height * 4;
      if (!(p instanceof Uint8ClampedArray || p instanceof Uint8Array || Array.isArray(p)) || p.length !== len) throw new OpProblem(`pixels must be ${len} bytes (RGBA, ${d.width} x ${d.height}).`);
      // Always a fresh array: edits never share memory with what the plugin holds.
      d.pixels = Uint8ClampedArray.from(p as ArrayLike<number>);
      return;
    }
    case 'setLayer': {
      const l = layerOf(doc, o.layerId);
      if (o.name !== undefined) l.name = str(o.name, 'name') || l.name;
      if (o.visible !== undefined) l.visible = !!o.visible;
      if (o.locked !== undefined) l.locked = !!o.locked;
      if (o.opacity !== undefined) {
        if (!fin(o.opacity)) throw new OpProblem('opacity must be a number from 0 to 1.');
        l.opacity = Math.min(1, Math.max(0, o.opacity));
      }
      return;
    }
    case 'setDocument': {
      if (o.name !== undefined) doc.name = str(o.name, 'name') || doc.name;
      if (o.fps !== undefined) {
        if (!fin(o.fps) || o.fps < 1 || o.fps > 120) throw new OpProblem('fps must be a number from 1 to 120.');
        doc.fps = o.fps;
      }
      if (o.background !== undefined) {
        if (o.background !== null && !isColor(o.background)) throw new OpProblem('background must be a colour like "#ffcc00", or null.');
        doc.background = o.background;
      }
      return;
    }
    case 'setShapeStyle': {
      const d = drawingOf(doc, o.drawingId);
      if (d.kind !== 'vector') throw new OpProblem('setShapeStyle works on vector drawings only.');
      const s = d.shapes[shapeIndex(d.shapes as Shape[], o.shapeId)];
      if (o.color !== undefined && !isColor(o.color)) throw new OpProblem('color must be a colour like "#ffcc00".');
      if (o.fill !== undefined && o.fill !== null && !isColor(o.fill)) throw new OpProblem('fill must be a colour like "#ffcc00", or null.');
      if (o.opacity !== undefined && !fin(o.opacity)) throw new OpProblem('opacity must be a number from 0 to 1.');
      if (s.type === 'instance') throw new OpProblem("A symbol's copy has no colours of its own to change.");
      if (o.opacity !== undefined) s.opacity = Math.min(1, Math.max(0, o.opacity));
      if (s.type === 'path') {
        if (o.fill !== undefined) s.fill = o.fill;
        if (o.color !== undefined && s.stroke) s.stroke.color = o.color;
      } else if (o.color !== undefined) s.color = o.color;
      else if (o.fill) s.color = o.fill;
      return;
    }
    case 'removeShape': {
      const d = drawingOf(doc, o.drawingId);
      if (d.kind !== 'vector') throw new OpProblem('removeShape works on vector drawings only.');
      d.shapes.splice(shapeIndex(d.shapes as Shape[], o.shapeId), 1);
      return;
    }
    case 'addMarker': {
      if (!fin(o.frame) || o.frame < 0 || o.frame >= doc.length) throw new OpProblem(`frame must be from 0 to ${doc.length - 1}.`);
      doc.markers.push({ id: uid('m'), name: str(o.name ?? 'Marker', 'name') || 'Marker', frame: Math.round(o.frame) });
      return;
    }
    case 'removeMarker': {
      const i = doc.markers.findIndex((m) => m.id === o.markerId);
      if (i < 0) throw new OpProblem('There is no such marker.');
      doc.markers.splice(i, 1);
      return;
    }
    case 'addClip': {
      if (!fin(o.start) || !fin(o.end) || o.start < 0 || o.end < o.start || o.end >= doc.length) throw new OpProblem(`start and end must be frames from 0 to ${doc.length - 1}, start first.`);
      doc.clips.push({ id: uid('c'), name: str(o.name ?? 'Clip', 'name') || 'Clip', start: Math.round(o.start), end: Math.round(o.end), loop: o.loop !== false });
      return;
    }
    case 'removeClip': {
      const i = doc.clips.findIndex((c) => c.id === o.clipId);
      if (i < 0) throw new OpProblem('There is no such clip.');
      doc.clips.splice(i, 1);
      return;
    }
    case 'addSwatch': {
      if (!isColor(o.color)) throw new OpProblem('color must be a colour like "#ffcc00".');
      doc.swatches.push({ id: uid('s'), name: str(o.name ?? o.color, 'name'), color: o.color });
      return;
    }
    default:
      throw new OpProblem(`Plugins can't do "${String(o.op).slice(0, 40)}". They can: ${OP_NAMES.join(', ')}.`);
  }
}

/** Applies a batch. Throws on the first bad one (the caller's store.update then changes nothing). */
export function applyOps(doc: Draft<Doc>, ops: unknown): void {
  if (!Array.isArray(ops)) throw new OpProblem('Changes must be a list.');
  if (ops.length > MAX_OPS) throw new OpProblem(`That's too many changes at once (up to ${MAX_OPS}).`);
  for (const op of ops) applyOp(doc, op);
}
