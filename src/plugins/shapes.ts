// A plugin's own kind of shape. Frameling keeps it as ordinary vector shapes (so every tool, renderer and exporter
// works on it, and a file opens fine without the plugin), tied together with one group id, and writes what the plugin
// needs to draw it again into each shape's `ext` bag. Pure: works on the document the store hands to an update.
import type { Draft } from 'immer';
import type { Doc, Id, Shape, VectorDrawing } from '../core/format';
import { uid } from '../core/doc';
import { shapesBounds, transformShapes } from '../canvas/geometry';
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
  /** True when this is a stand-in (the plugin drew nothing). */
  placeholder?: true;
}

export class ShapeProblem extends Error {}

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
function build(pluginId: string, kind: string, props: Record<string, unknown>, inst: string, list: DrawList, place: { at: { x: number; y: number } } | { centre: { x: number; y: number } }): Shape[] {
  const group = `pg-${inst}`;
  let parts: Shape[] = drawListToShapes(list, () => uid('sh'));
  const placeholder = !parts.length;
  if (placeholder) parts = placeholderShapes({ x: 0, y: 0, w: 48, h: 48 }, () => uid('sh'));
  const box = shapesBounds(parts);
  let dx: number;
  let dy: number;
  if ('at' in place) {
    dx = place.at.x;
    dy = place.at.y;
  } else {
    dx = place.centre.x - (box ? box.x + box.w / 2 : 0);
    dy = place.centre.y - (box ? box.y + box.h / 2 : 0);
  }
  parts = transformShapes(parts, [1, 0, 0, 1, dx, dy]);
  return parts.map((s, i) => ({
    ...s,
    group,
    ext: { ...(s.ext ?? {}), [extKeyOf(pluginId)]: { kind, inst, part: i, ...(i === 0 ? { props } : {}), ...(placeholder ? { placeholder: true as const } : {}) } },
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

/** Draws one of its shapes again from new settings, staying where it is (centred on where the old drawing was), in the same place in the stack. */
export function redrawPluginShape(doc: Draft<Doc>, a: { drawingId?: Id | null; pluginId: string; kind: string; props: Record<string, unknown>; list: DrawList; inst: string }): { inst: string; ids: Id[]; replaced: Id[] } {
  const at = findInst(doc as Doc, a.pluginId, a.inst, a.drawingId);
  if (!at) throw new ShapeProblem("That shape isn't in the drawing any more.");
  const d = vectorOf(doc, at.drawingId);
  const old = at.indexes.map((i) => d.shapes[i] as Shape);
  const oldBox = shapesBounds(old);
  const parts = build(a.pluginId, a.kind, a.props, a.inst, a.list, { centre: oldBox ? { x: oldBox.x + oldBox.w / 2, y: oldBox.y + oldBox.h / 2 } : { x: 0, y: 0 } });
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
