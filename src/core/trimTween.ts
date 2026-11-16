/**
 * Lines that draw themselves between two keys: the trims of the shapes on one key blend into those on the next (the
 * same shape, found by its `origin`), at the eased progress the key's tween gives. Pure: no DOM, no store.
 *
 * A shape on only one of the two keys, or a key whose neighbour has no such shape, just holds its own trim.
 */
import type { Shape, Trim, VectorDrawing } from './format';
import { lerpTrim, sameTrim } from '../geometry/trim';

/** The trim a shape carries, if it can carry one (brush lines and path outlines). */
export function trimOf(s: Shape): Trim | undefined {
  return s.type === 'stroke' ? s.trim : s.type === 'path' ? s.stroke?.trim : undefined;
}

/** Can this shape's line be trimmed? A path needs an outline; a brush line always has one. */
export function canTrim(s: Shape): boolean {
  return s.type === 'stroke' || (s.type === 'path' && !!s.stroke);
}

/** The shape with another trim (taken off when it is the whole line). Gives the same object when nothing changes. */
export function withTrim<S extends Shape>(s: S, trim: Trim | undefined): S {
  if (s.type === 'stroke') {
    if (sameTrim(s.trim, trim)) return s;
    const { trim: _old, ...rest } = s;
    return (trim ? { ...rest, trim } : rest) as S;
  }
  if (s.type === 'path' && s.stroke) {
    if (sameTrim(s.stroke.trim, trim)) return s;
    const { trim: _old, ...st } = s.stroke;
    return { ...s, stroke: trim ? { ...st, trim } : st } as S;
  }
  return s;
}

/** The key a shape is followed by from drawing key to drawing key. */
export const shapeLine = (s: Shape): string => s.origin ?? s.id;

const hasAny = new WeakMap<VectorDrawing, boolean>();

/** Does any shape on this drawing carry a trim? (Remembered per drawing: they are replaced, not changed, on an edit.) */
export function hasTrim(d: VectorDrawing): boolean {
  let v = hasAny.get(d);
  if (v === undefined) {
    v = d.shapes.some((s) => !!trimOf(s));
    hasAny.set(d, v);
  }
  return v;
}

/**
 * The drawing `d` as it is `t` of the way to `to` (t already eased), with each trimmed line blended with its partner on
 * `to`. Null when nothing changes, so the caller keeps the key's own drawing.
 */
export function trimmedBetween(d: VectorDrawing, to: VectorDrawing, t: number): VectorDrawing | null {
  if (!hasTrim(d) && !hasTrim(to)) return null;
  const partner = new Map<string, Shape>();
  for (const s of to.shapes) if (canTrim(s)) partner.set(shapeLine(s), s);
  let changed = false;
  const shapes = d.shapes.map((s) => {
    if (!canTrim(s)) return s;
    const p = partner.get(shapeLine(s));
    if (!p) return s;
    const a = trimOf(s);
    const b = trimOf(p);
    if (sameTrim(a, b)) return s;
    changed = true;
    return withTrim(s, lerpTrim(a, b, t));
  });
  return changed ? { ...d, shapes } : null;
}
