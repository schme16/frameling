// Tipped lines as the plain shapes they are drawn and exported as (the work is in geometry/tipShapes.ts). Kept here, away
// from render.ts and symbols.ts, so both can ask for it without importing each other.
import type { Drawing, Shape, StrokeShape } from './format';
import { tipShapes, type OutlineFn } from '../geometry/tipShapes';

let outliner: OutlineFn | null = null;

/** render.ts says how to get a line's outline (it keeps the cache). */
export function setTipOutliner(fn: OutlineFn): void {
  outliner = fn;
}

const parts = new WeakMap<StrokeShape, Shape[] | null>();

/** The shapes a line with a tip is made of, or null for a plain line (or one with too little to draw). Worked out once per line. */
export function strokeParts(s: StrokeShape): Shape[] | null {
  if (!s.brush.tip || !outliner) return null;
  let p = parts.get(s);
  if (p === undefined) {
    p = tipShapes(s, outliner);
    parts.set(s, p);
  }
  return p;
}

const expanded = new WeakMap<Drawing, Drawing>();

/** The drawing with every tipped line swapped for its shapes. A drawing with no tipped lines comes back as it is (the same object). */
export function withTips(d: Drawing): Drawing {
  if (d.kind !== 'vector') return d;
  const known = expanded.get(d);
  if (known) return known;
  let any = false;
  for (const s of d.shapes) if (s.type === 'stroke' && s.brush.tip) any = true;
  let out: Drawing = d;
  if (any) {
    const shapes: Shape[] = [];
    for (const s of d.shapes) {
      const p = s.type === 'stroke' && s.brush.tip ? strokeParts(s) : null;
      if (p) shapes.push(...p);
      else shapes.push(s);
    }
    out = { ...d, shapes };
  }
  expanded.set(d, out);
  return out;
}
