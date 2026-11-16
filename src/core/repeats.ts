// Repeats as the plain shapes they are drawn and exported as: a shape with a `repeat` is followed by its copies, made
// here when the picture is posed (the same way tipped lines are, see tips.ts), so the canvas, onion skin, GIF, video and
// sprite sheet all see them without knowing. The copies are never stored, can't be clicked and aren't snap targets.
// Kept away from symbols.ts and render.ts so both can ask without importing each other; render.ts says how to move a
// shape and find its middle, the way it says how to outline a line for tips.ts.
import type { Drawing, Id, Repeat, Shape } from './format';
import type { Matrix } from '../geometry/matrix';
import { copyAs, repeatMatrices } from '../geometry/repeat';

export interface RepeatHelpers {
  /** The shape moved about by a matrix (same id). */
  move(s: Shape, m: Matrix): Shape;
  /** The middle of the shape's box. */
  centre(s: Shape): { x: number; y: number };
}

let helpers: RepeatHelpers | null = null;

export function setRepeatHelpers(h: RepeatHelpers): void {
  helpers = h;
}

/** Shapes that can carry a repeat: the drawn kinds, text and symbols. */
export const canRepeat = (s: Shape): boolean => s.type === 'stroke' || s.type === 'fill' || s.type === 'path' || s.type === 'instance' || s.type === 'text';

const hasRepeat = (s: Shape): boolean => 'repeat' in s && !!s.repeat && canRepeat(s);

/** Where the copies of an upright ring turn about: the middle of everything in the shape's group that repeats, or the shape alone. */
function pivotOf(s: Shape, all: readonly Shape[]): { x: number; y: number } {
  const h = helpers!;
  const group = s.group;
  if (!group) return h.centre(s);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const mates = all.filter((o) => o.group === group && hasRepeat(o));
  for (const o of mates.length ? mates : [s]) {
    const b = h.centre(o);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x);
    y1 = Math.max(y1, b.y);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

const made = new WeakMap<Shape, { key: string; copies: Shape[] }>();

/** The copies a shape's repeat makes (not the shape itself), or none. Worked out again only when the shape, its repeat or its pivot changes. */
export function repeatCopies(s: Shape, all: readonly Shape[] = [s]): Shape[] {
  if (!helpers || !hasRepeat(s)) return [];
  const r = (s as Shape & { repeat: Repeat }).repeat;
  const pivot = r.kind === 'ring' && r.turn === false ? pivotOf(s, all) : { x: 0, y: 0 };
  const key = JSON.stringify([r, pivot.x, pivot.y]);
  const known = made.get(s);
  if (known && known.key === key) return known.copies;
  const out: Shape[] = [];
  const ms = repeatMatrices(r, pivot);
  for (let i = 1; i < ms.length; i++) out.push(copyAs(helpers.move(s, ms[i]), `${s.id}~r${i}` as Id));
  made.set(s, { key, copies: out });
  return out;
}

const expanded = new WeakMap<Drawing, Drawing>();

/** The drawing with every shape that repeats followed by its copies. A drawing with none comes back as it is (the same object). */
export function withRepeats(d: Drawing): Drawing {
  if (d.kind !== 'vector' || !helpers) return d;
  const known = expanded.get(d);
  if (known) return known;
  let out: Drawing = d;
  if (d.shapes.some(hasRepeat)) {
    const shapes: Shape[] = [];
    for (const s of d.shapes) {
      shapes.push(s);
      if (hasRepeat(s)) shapes.push(...repeatCopies(s, d.shapes));
    }
    out = { ...d, shapes };
  }
  expanded.set(d, out);
  return out;
}

/** True when the drawing has a shape that repeats. */
export const drawingRepeats = (d: Drawing | undefined): boolean => !!d && d.kind === 'vector' && d.shapes.some(hasRepeat);
