// Offset path: a copy of a shape a few pixels bigger or smaller all the way round. It grows or shrinks the area the
// shape covers (see `coverOf`) by laying a band of twice the distance along its edge, then joins or cuts that band, so
// the corners come out round or sharp as asked. Pure, no DOM.
import type { Id, PathShape, Shape, SubPath } from '../core/format';
import { uid } from '../core/doc';
import { combinable, coverOf, geomToSubPaths, wearLook } from './boolean';
import { difference, geomArea, lineArea, union, type Geom } from './merge';

/** How the corners of the copy come out: round (the edge stays the same distance away) or sharp. */
export type OffsetCorners = 'round' | 'sharp';
/** Whether the original stays, or the offset copy takes its place. */
export type OffsetKeep = 'copy' | 'replace';

/** The furthest an offset goes, in document pixels. Past this a shape is gone or a blob. */
export const MAX_OFFSET = 200;

/** Smaller than this is not an offset at all. */
const MIN_OFFSET = 0.05;

/** Anything smaller than this (square pixels) is a speck left over, not a shape. */
const SPECK = 0.5;

/**
 * The area `g` covers, grown by `d` pixels all round (`d` above 0) or shrunk (`d` below 0). Null when it can't be worked out.
 * An empty geometry comes back for a shape that shrank away.
 */
export function offsetGeom(g: Geom, d: number, corners: OffsetCorners = 'round'): Geom | null {
  if (!g.length) return [];
  if (!Number.isFinite(d) || Math.abs(d) < MIN_OFFSET) return g;
  const r = Math.min(MAX_OFFSET, Math.abs(d));
  const bands: Geom[] = [];
  for (const poly of g) {
    for (const ring of poly) {
      // A ring repeats its first point at the end; the band wants it once.
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
      if (pts.length < 3) continue;
      const b = lineArea(pts, true, r * 2, corners === 'sharp' ? 'miter' : 'round', 'butt');
      if (b.length) bands.push(b);
    }
  }
  if (!bands.length) return g;
  const band = bands.length === 1 ? bands[0] : union(bands[0], ...bands.slice(1));
  if (!band) return null;
  return d > 0 ? union(g, band) : difference(g, band);
}

/** The subpaths of an offset copy of one shape, or null when nothing is left (or it can't be worked out). */
export function offsetPaths(s: Shape, d: number, corners: OffsetCorners = 'round'): SubPath[] | null {
  if (!combinable(s)) return null;
  const cover = coverOf(s);
  if (!cover.length) return null;
  const out = offsetGeom(cover, d, corners);
  if (!out || !out.length || geomArea(out) < SPECK) return null;
  const paths = geomToSubPaths(out, { minArea: SPECK });
  return paths.length ? paths : null;
}

export type OffsetProblem = 'none' | 'gone';

export interface OffsetResult {
  shapes: Shape[];
  /** The ids to leave selected afterwards: the new copies, or the replaced shapes. */
  ids: Id[];
  /** How many shapes got an offset, how many shrank away to nothing, and how many were left out (symbols, text, particles). */
  made: number;
  gone: number;
  skipped: number;
}

/**
 * Offsets every picked shape by `d` pixels (above 0 out, below 0 in). With `keep: 'copy'` each original stays and its copy
 * goes behind it when growing (a sticker edge) or in front of it when shrinking (an inner line); with 'replace' the shape
 * itself changes. The copy wears the original's colours and outline. A problem word comes back when nothing was made.
 */
export function offsetShapes(shapes: readonly Shape[], ids: ReadonlySet<Id>, d: number, corners: OffsetCorners = 'round', keep: OffsetKeep = 'copy'): OffsetResult | OffsetProblem {
  const out: Shape[] = [];
  const newIds: Id[] = [];
  let made = 0;
  let gone = 0;
  let skipped = 0;
  for (const s of shapes) {
    if (!ids.has(s.id)) {
      out.push(s);
      continue;
    }
    if (!combinable(s)) {
      skipped++;
      out.push(s);
      continue;
    }
    const paths = offsetPaths(s, d, corners);
    if (!paths) {
      gone++;
      out.push(s);
      continue;
    }
    made++;
    const copy: PathShape = wearLook(s, paths);
    if (keep === 'replace') {
      out.push(copy);
      newIds.push(copy.id);
      continue;
    }
    copy.id = uid();
    newIds.push(copy.id);
    if (d > 0) out.push(copy, s);
    else out.push(s, copy);
  }
  if (!made) return skipped && !gone ? 'none' : gone ? 'gone' : 'none';
  return { shapes: out, ids: newIds, made, gone, skipped };
}
