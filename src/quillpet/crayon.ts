// A crayon copy: your drawing redrawn with a wobbly hand.
//
// Nothing here is generated, guessed or sent anywhere. It is arithmetic over the shapes you already drew: every
// point wanders a little, the lines come out uneven, and the filled areas sit a touch off their outlines, the way
// they do when you colour in too fast. Pure and seeded, so the same drawing and the same seed always give the same
// copy, which is what makes it testable and what lets a present be kept as a recipe rather than a file.
import type { Color, Doc, FillShape, PathPoint, PathShape, Shape, StrokeShape, SubPath } from '../core/format';
import { newDoc, newVectorLayer, uid } from '../core/doc';

/** How heavy the hand is. All the distances are in document pixels, at the scale the drawing was made. */
export interface CrayonFeel {
  /** How far a point can wander. */
  wobble: number;
  /** How fast the wander changes along a line. Small is long lazy curves, large is the shakes. */
  grain: number;
  /** How far a filled area sits off its outline. */
  offRegister: number;
  /** How much the line thickness varies, 0 (even) to 1 (all over the place). */
  uneven: number;
}

export const CRAYON: CrayonFeel = { wobble: 5, grain: 0.3, offRegister: 5.5, uneven: 0.45 };

/** The size a feel is written for. A bigger drawing gets a proportionally bigger wobble. */
const FEEL_AT = 480;

// ---------------------------------------------------------------- the wobbly hand

/** A small, fast, repeatable random number generator, so a seed always gives the same copy. */
export function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * A wandering line: smooth, repeatable noise along one axis. Plain random per point would look like static; this
 * drifts, which is what a hand does.
 */
export function wander(seed: number): (t: number) => number {
  const r = rng(seed);
  const stops: number[] = [];
  const at = (i: number) => {
    while (stops.length <= i) stops.push(r() * 2 - 1);
    return stops[i];
  };
  return (t: number) => {
    const i = Math.floor(Math.max(0, t));
    const f = Math.max(0, t) - i;
    return at(i) + (at(i + 1) - at(i)) * ease(f);
  };
}

/** The hand that moves points about: `nudge(x, y, t)` where `t` runs along the line. */
function hand(seed: number, amp: number, grain: number) {
  const wx = wander(seed);
  const wy = wander(seed ^ 0x9e3779b9);
  return (p: { x: number; y: number }, t: number) => ({ x: p.x + wx(t * grain) * amp, y: p.y + wy(t * grain) * amp });
}

// ---------------------------------------------------------------- the shapes

function crayonStroke(s: StrokeShape, seed: number, amp: number, feel: CrayonFeel): StrokeShape {
  const move = hand(seed, amp, feel.grain);
  const r = rng(seed ^ 0x51ed270b);
  const points = s.points.map((p, i) => {
    const m = move(p, i);
    // The pressure wanders too, which is what makes the line come out uneven.
    const p2 = Math.min(1, Math.max(0.05, p.p + (r() * 2 - 1) * feel.uneven));
    return { x: m.x, y: m.y, p: p2 };
  });
  const size = Math.max(0.5, s.brush.size * (1 + (r() * 2 - 1) * feel.uneven * 0.5));
  return {
    ...s,
    points,
    brush: {
      ...s.brush,
      size,
      // A crayon answers to pressure and doesn't smooth your hand out for you.
      thinning: Math.min(1, Math.max(-1, s.brush.thinning + feel.uneven * 0.4)),
      streamline: Math.max(0, s.brush.streamline * 0.4),
    },
  };
}

function crayonPaths(paths: SubPath[], seed: number, amp: number, feel: CrayonFeel, slip: { x: number; y: number }): SubPath[] {
  let t = 0;
  const move = hand(seed, amp, feel.grain);
  return paths.map((sp) => ({
    ...sp,
    points: sp.points.map((p) => {
      const m = move(p, t++);
      const out: PathPoint = { x: m.x + slip.x, y: m.y + slip.y };
      // Curve handles come along for the ride, so a curve stays a curve.
      if (p.c1) out.c1 = { x: p.c1.x + (m.x - p.x) + slip.x, y: p.c1.y + (m.y - p.y) + slip.y };
      if (p.c2) out.c2 = { x: p.c2.x + (m.x - p.x) + slip.x, y: p.c2.y + (m.y - p.y) + slip.y };
      return out;
    }),
  }));
}

/** Which way, and how far, this filled area sits off its outline. */
function slipOf(seed: number, off: number): { x: number; y: number } {
  const r = rng(seed ^ 0x2545f491);
  const a = r() * Math.PI * 2;
  const d = off * (0.4 + r() * 0.6);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

function crayonFill(s: FillShape, seed: number, amp: number, off: number, feel: CrayonFeel): FillShape {
  return { ...s, paths: crayonPaths(s.paths, seed, amp, feel, slipOf(seed, off)) };
}

function crayonPath(s: PathShape, seed: number, amp: number, feel: CrayonFeel): PathShape {
  const r = rng(seed ^ 0x85ebca6b);
  const width = s.stroke ? Math.max(0.3, s.stroke.width * (1 + (r() * 2 - 1) * feel.uneven * 0.6)) : 0;
  return {
    ...s,
    paths: crayonPaths(s.paths, seed, amp, feel, { x: 0, y: 0 }),
    stroke: s.stroke ? { ...s.stroke, width, join: 'round', cap: 'round' } : null,
  };
}

/**
 * Redraws a list of shapes with a wobbly hand. Shapes Quill can't hold a crayon to (instances, text, particles) come
 * through untouched, because a present that quietly dropped half your drawing would be no present at all.
 */
export function crayonShapes(shapes: Shape[], seed: number, scale = 1, feel: CrayonFeel = CRAYON): Shape[] {
  const amp = feel.wobble * scale;
  const off = feel.offRegister * scale;
  return shapes.map((s, i) => {
    const sub = (seed + i * 0x7f4a7c15) >>> 0;
    if (s.type === 'stroke') return crayonStroke(s, sub, amp, feel);
    if (s.type === 'fill') return crayonFill(s, sub, amp, off, feel);
    if (s.type === 'path') return crayonPath(s, sub, amp, feel);
    return s;
  });
}

// ---------------------------------------------------------------- the present itself

/** The drawing a present is made from: the shapes of one frame, and the stage they sat on. */
export interface ThingSource {
  width: number;
  height: number;
  background: Color | null;
  shapes: Shape[];
}

/** How much wobble suits a drawing this size. */
export const scaleFor = (src: { width: number; height: number }): number => Math.max(0.35, Math.min(3, Math.min(src.width, src.height) / FEEL_AT));

/** A whole document, ready to open and carry on working in: your drawing, redrawn by Quill. */
export function crayonDoc(src: ThingSource, name: string, seed: number, feel: CrayonFeel = CRAYON): Doc {
  const doc = newDoc({ name, width: src.width, height: src.height, length: 1, background: src.background });
  doc.layers = [];
  const layer = newVectorLayer('Quill’s crayons');
  const drawing = { id: uid('v'), kind: 'vector' as const, shapes: crayonShapes(src.shapes, seed, scaleFor(src), feel) };
  doc.drawings[drawing.id] = drawing;
  layer.cels = [{ id: uid('c'), start: 0, length: 1, drawingId: drawing.id }];
  doc.layers.push(layer);
  return doc;
}
