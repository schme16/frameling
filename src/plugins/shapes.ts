// A plugin's own kind of shape. Frameling keeps it as ordinary vector shapes (so every tool, renderer and exporter
// works on it, and a file opens fine without the plugin), tied together with one group id, and writes what the plugin
// needs to draw it again into each shape's `ext` bag. Pure: works on the document the store hands to an update.
import type { Draft } from 'immer';
import type { Doc, Id, Shape, VectorDrawing } from '../core/format';
import { uid } from '../core/doc';
import { multiply, shapesBounds, transformShapes, type Matrix } from '../canvas/geometry';
import { drawListToShapes, placeholderShapes, type DrawList } from './drawlist';

/** The `ext` key a plugin's shapes keep their data under. */
export const extKeyOf = (pluginId: string): string => `plugin.${pluginId}`;

export interface PluginShapeInfo {
  kind: string;
  /** Names the whole shape (all the parts that make it up). */
  inst: string;
  part: number;
  /** What the plugin draws it from (on the first part only). */
  props?: Record<string, unknown>;
  /** Where the plugin's own coordinates sit on the stage when it was last drawn (first part only). See `refit`. */
  m?: number[];
  /** A few anchor points as they were then (first part only), to find out how the person has moved, scaled or turned the parts since. */
  ref?: Ref;
  /** True when this is a stand-in (the plugin drew nothing). */
  placeholder?: true;
}

/** Up to three anchor points of the drawn parts, `[index among all anchors, x, y]`, and how many anchors there were. */
export interface Ref {
  n: number;
  pts: [number, number, number][];
}

export class ShapeProblem extends Error {}

type P = { x: number; y: number };

/** Every anchor point of the parts, in order (curve handles ride along with them and are not needed). */
function anchorsOf(parts: Shape[]): P[] {
  const out: P[] = [];
  for (const s of parts) if (s.type === 'path') for (const sp of s.paths) for (const p of sp.points) out.push({ x: p.x, y: p.y });
  return out;
}

/** Remembers three anchors far apart from each other (two, or one, when the drawing has no more room than that). */
export function pickRef(anchors: P[]): Ref {
  const n = anchors.length;
  if (!n) return { n, pts: [] };
  const at = (i: number): [number, number, number] => [i, anchors[i].x, anchors[i].y];
  let b = 0;
  let far = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(anchors[i].x - anchors[0].x, anchors[i].y - anchors[0].y);
    if (d > far) (far = d), (b = i);
  }
  if (far < 1e-6) return { n, pts: [at(0)] };
  let c = -1;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const cr = Math.abs((anchors[b].x - anchors[0].x) * (anchors[i].y - anchors[0].y) - (anchors[b].y - anchors[0].y) * (anchors[i].x - anchors[0].x));
    if (cr > area) (area = cr), (c = i);
  }
  // Nearly in a line: two points still give position, size and turn.
  return { n, pts: area > far * far * 1e-4 ? [at(0), at(b), at(c)] : [at(0), at(b)] };
}

const validRef = (r: unknown): r is Ref => typeof r === 'object' && r !== null && Number.isInteger((r as Ref).n) && Array.isArray((r as Ref).pts) && (r as Ref).pts.length >= 1 && (r as Ref).pts.length <= 3 && (r as Ref).pts.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v)));
const validM = (m: unknown): m is Matrix => Array.isArray(m) && m.length === 6 && m.every((v) => Number.isFinite(v));

/**
 * The move, scale, turn or flip that took the anchors from where they were drawn to where they are now: found from the
 * remembered points. Null when the parts were edited point by point (the count changed) or the numbers don't make sense.
 */
export function refit(ref: Ref, now: P[]): Matrix | null {
  if (now.length !== ref.n || ref.pts.some((p) => p[0] >= now.length)) return null;
  const from = ref.pts.map((p) => ({ x: p[1], y: p[2] }));
  const to = ref.pts.map((p) => now[p[0]]);
  if (from.length === 1) return [1, 0, 0, 1, to[0].x - from[0].x, to[0].y - from[0].y];
  if (from.length === 2) {
    // Position, size and turn (no stretching): a complex multiplication.
    const dx = from[1].x - from[0].x;
    const dy = from[1].y - from[0].y;
    const k = dx * dx + dy * dy;
    const ex = to[1].x - to[0].x;
    const ey = to[1].y - to[0].y;
    const a = (ex * dx + ey * dy) / k;
    const b = (ey * dx - ex * dy) / k;
    return [a, b, -b, a, to[0].x - (a * from[0].x - b * from[0].y), to[0].y - (b * from[0].x + a * from[0].y)];
  }
  // Three points: any move, scale, turn, stretch, slant or flip. Solve x' = a x + c y + e and y' = b x + d y + f.
  const [p0, p1, p2] = from;
  const det = p0.x * (p1.y - p2.y) - p0.y * (p1.x - p2.x) + (p1.x * p2.y - p2.x * p1.y);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (v0: number, v1: number, v2: number): [number, number, number] => [
    (v0 * (p1.y - p2.y) + v1 * (p2.y - p0.y) + v2 * (p0.y - p1.y)) / det,
    (v0 * (p2.x - p1.x) + v1 * (p0.x - p2.x) + v2 * (p1.x - p0.x)) / det,
    (v0 * (p1.x * p2.y - p2.x * p1.y) + v1 * (p2.x * p0.y - p0.x * p2.y) + v2 * (p0.x * p1.y - p1.x * p0.y)) / det,
  ];
  const [a, c, e] = solve(to[0].x, to[1].x, to[2].x);
  const [b, d, f] = solve(to[0].y, to[1].y, to[2].y);
  return [a, b, c, d, e, f];
}

/** What a plugin shape part says about itself, if it is one of this plugin's. */
export function infoOf(s: Shape, pluginId: string): PluginShapeInfo | null {
  const v = s.ext?.[extKeyOf(pluginId)];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return typeof o.kind === 'string' && typeof o.inst === 'string' ? (o as unknown as PluginShapeInfo) : null;
}

function vectorOf(doc: Draft<Doc>, id: unknown): Draft<VectorDrawing> {
  const d = typeof id === 'string' ? doc.drawings[id] : undefined;
  if (!d || d.kind !== 'vector') throw new ShapeProblem('Pick a layer with vector drawing on it first.');
  return d;
}

/** The parts of a drawn shape, with each one's data and the group tie, placed so the whole is centred on `centre` (or starts at `at`). */
function build(pluginId: string, kind: string, props: Record<string, unknown>, inst: string, list: DrawList, place: { at: { x: number; y: number } } | { centre: { x: number; y: number } } | { matrix: Matrix }): Shape[] {
  const group = `pg-${inst}`;
  let parts: Shape[] = drawListToShapes(list, () => uid('sh'));
  const placeholder = !parts.length;
  if (placeholder) parts = placeholderShapes({ x: 0, y: 0, w: 48, h: 48 }, () => uid('sh'));
  const box = shapesBounds(parts);
  let m: Matrix;
  if ('matrix' in place) m = place.matrix;
  else if ('at' in place) m = [1, 0, 0, 1, place.at.x, place.at.y];
  else m = [1, 0, 0, 1, place.centre.x - (box ? box.x + box.w / 2 : 0), place.centre.y - (box ? box.y + box.h / 2 : 0)];
  parts = transformShapes(parts, m);
  const ref = pickRef(anchorsOf(parts));
  return parts.map((s, i) => ({
    ...s,
    group,
    ext: { ...(s.ext ?? {}), [extKeyOf(pluginId)]: { kind, inst, part: i, ...(i === 0 ? { props, m: [...m], ref } : {}), ...(placeholder ? { placeholder: true as const } : {}) } },
  })) as Shape[];
}

/** Adds a new shape of a plugin's kind to a drawing, at a place. Returns its `inst` and the new shape ids. */
export function addPluginShape(doc: Draft<Doc>, a: { drawingId: Id | null | undefined; pluginId: string; kind: string; props: Record<string, unknown>; list: DrawList; at: { x: number; y: number } }): { inst: string; ids: Id[] } {
  const d = vectorOf(doc, a.drawingId);
  const inst = uid('pi');
  const parts = build(a.pluginId, a.kind, a.props, inst, a.list, { at: a.at });
  (d.shapes as Shape[]).push(...parts);
  return { inst, ids: parts.map((s) => s.id) };
}

/** Where a shape of this plugin is: its drawing and the indexes of its parts. */
export function findInst(doc: Doc, pluginId: string, inst: string, prefer?: Id | null): { drawingId: Id; indexes: number[] } | null {
  const look = (d: Doc['drawings'][string]) => {
    if (d.kind !== 'vector') return null;
    const indexes: number[] = [];
    d.shapes.forEach((s, i) => {
      if (infoOf(s, pluginId)?.inst === inst) indexes.push(i);
    });
    return indexes.length ? { drawingId: d.id, indexes } : null;
  };
  const first = prefer ? doc.drawings[prefer] : undefined;
  if (first) {
    const hit = look(first);
    if (hit) return hit;
  }
  for (const d of Object.values(doc.drawings)) {
    const hit = look(d);
    if (hit) return hit;
  }
  return null;
}

/**
 * Draws one of its shapes again from new settings, in the same place in the stack. It keeps whatever the person did to
 * the parts with the ordinary tools (moved, scaled, turned, flipped): the new drawing gets the same move on top of the
 * plugin's own coordinates. A shape without that record (from an older Frameling) or one edited point by point is
 * centred on where the old drawing was instead.
 */
export function redrawPluginShape(doc: Draft<Doc>, a: { drawingId?: Id | null; pluginId: string; kind: string; props: Record<string, unknown>; list: DrawList; inst: string }): { inst: string; ids: Id[]; replaced: Id[] } {
  const at = findInst(doc as Doc, a.pluginId, a.inst, a.drawingId);
  if (!at) throw new ShapeProblem("That shape isn't in the drawing any more.");
  const d = vectorOf(doc, at.drawingId);
  const old = at.indexes.map((i) => d.shapes[i] as Shape);
  const oldBox = shapesBounds(old);
  const inOrder = [...old].sort((x, y) => (infoOf(x, a.pluginId)?.part ?? 0) - (infoOf(y, a.pluginId)?.part ?? 0));
  const head = infoOf(inOrder[0], a.pluginId);
  const moved = head && validM(head.m) && validRef(head.ref) ? refit(head.ref, anchorsOf(inOrder)) : null;
  const place = moved ? { matrix: multiply(moved, head!.m as unknown as Matrix) } : { centre: oldBox ? { x: oldBox.x + oldBox.w / 2, y: oldBox.y + oldBox.h / 2 } : { x: 0, y: 0 } };
  const parts = build(a.pluginId, a.kind, a.props, a.inst, a.list, place);
  const replaced = old.map((s) => s.id);
  const shapes = d.shapes as Shape[];
  const insertAt = at.indexes[0];
  for (let k = at.indexes.length - 1; k >= 0; k--) shapes.splice(at.indexes[k], 1);
  shapes.splice(insertAt, 0, ...parts);
  return { inst: a.inst, ids: parts.map((s) => s.id), replaced };
}

/** Which plugins have shapes in this document, and which kinds, so opening it can say what is missing. */
export function pluginsUsedBy(doc: Doc): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (!s.ext) continue;
      for (const [k, v] of Object.entries(s.ext)) {
        if (!k.startsWith('plugin.') || typeof v !== 'object' || v === null) continue;
        const kind = (v as { kind?: unknown }).kind;
        if (typeof kind !== 'string') continue;
        const id = k.slice('plugin.'.length);
        (out.get(id) ?? out.set(id, new Set()).get(id)!).add(kind);
      }
    }
  }
  return out;
}
