/**
 * Lottie JSON (the bodymovin format lottie-web, the Lottie apps and most UI toolkits play). Pure: document in, plain
 * object out.
 *
 * - Each layer's keys become Lottie layers that show between the key's first and last frame (ip/op).
 * - Vector drawings are shape layers: paths and fills as they are, brush strokes as their filled outline, the same
 *   shape the canvas fills. Shapes keep their stacking order; a symbol copy in the middle splits the shapes around it.
 * - Symbols are precomps (assets with their own layers and timeline). Copies are precomp layers whose transform is
 *   the copy's (anchor = the symbol's registration point) and whose time remap picks the symbol frame to show.
 * - Classic tweens become two keys with the easing as bezier handles when the easing is a cubic (steady, gentle
 *   start/stop, wind up, overshoot, custom curves are exact; gentle start and stop is two halves). Springy, bouncy and
 *   motion paths are baked per frame, then keys are fitted to the samples (see fitKeys: a few eased keys within
 *   tolerances no one can see).
 * - Shape tweens become path keyframes (the outlines are matched once, so every frame has the same points and the keys
 *   blend smoothly between frames), thinned the same way.
 * - Brush outlines are refitted with far fewer points (curve-fit.ts) and a drawing shown in several keys is one precomp.
 * - Pixel and tile layers become PNG image assets, scaled up to stage size with hard edges so they stay crisp.
 * - The camera is a null layer per depth that every stage layer hangs from (one key per frame when it moves).
 * - Clips become named markers (lottie-web's playSegments takes their names), markers become markers.
 *
 * - Blend modes, opacity, clipping, masks (track mattes), folders and effects follow the compositing plan, as the
 *   canvas does (see docs/effects.md, "Vector exports"). Soften and Shadow are Lottie effects, other effects are baked.
 * - Text is traced letters, particles a group per particle, tint a recoloured precomp (sprites.ts).
 *
 * A fade that covers overlapping shapes goes under a see-through matte, so lottie-web's canvas renderer (which
 * multiplies opacity into each shape) fades the group as one too. Effects don't play in that renderer.
 * Pictures made from effects are cropped, shared when they repeat and stored as WebP or PNG (see PICTURE_LOOKS).
 */
import type { Cel, Doc, Easing, Gradient, InstanceShape, Layer, LayerEffect, ParticlesShape, PathShape, PixelDrawing, Shape, StrokeShape, SubPath, TextShape, Tween } from '../core/format';
import { celAt } from '../core/doc';
import { decompose, isInstance, isPosed, layersHaveLook, pairInstances, poseAt, symbolContent, symbolFrame, tweenInstance, type Mat, type PosedInstance } from '../core/symbols';
import { drawingBox, effectReach, renderFrame, strokeOutline } from '../core/render';
import { folderChain } from '../core/folders';
import { buildPlan, planLayers, type PlanNode, type PlanStep } from '../effects/plan';
import { activeEffects, effectInfo, isNoop, valuesAt } from '../effects/model';
import { canTraceText, glyphSprites, particleSprites, SPRITE_UNIT, type ParticleSprite } from './sprites';
import { cameraViewAt, cameraViewOn, activeCamera, depthAnchor, depthScale, parallaxFactor } from '../core/camera';
import { encodePng } from '../io/png';
import { fitClosed, sampleMidpointSpline } from './curve-fit';
import { flattenTilemap } from '../tiles/model';
import { sortedStops } from '../core/gradient';
import type { PosedMesh } from '../rig/pose';

export interface LottieOptions {
  /** Frames to include (inclusive, document frame numbers). Default: the whole animation. */
  range?: { start: number; end: number };
  /** Leave the stage colour out. */
  transparent?: boolean;
  /**
   * How pictures made from effects are stored (see PICTURE_LOOKS). Default 'balanced'. `bake` overrides the details
   * (tests, size checks).
   */
  pictures?: PictureLook;
  bake?: Partial<BakeSpec>;
  /**
   * Soften and Shadow as Lottie's own blur and drop shadow ('effects', the default, small) or as pictures
   * ('pictures'), which players that leave Lottie's effects out (lottie-web's canvas player) show too.
   */
  softAndShadow?: 'effects' | 'pictures';
}

export type PictureLook = 'balanced' | 'sharp' | 'small';

/** How one baked picture is made: pixels per stage pixel, the file type and the lossy quality (0 to 1). */
export interface BakeSpec {
  scale: number;
  format: 'png' | 'webp';
  quality: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const r3 = (v: number) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};

/** Path numbers: two decimals is a hundredth of a stage pixel, far below what shows even at four times the size. */
const rp = (v: number) => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};
/** How far (stage pixels) a brush outline may move when it is refitted with fewer points. */
const FIT_TOLERANCE = 0.05;

// How far a value may stray from the straight line between kept keys (see smoothTrack): what no one can see.
/** Stage pixels (positions, path points, gradient ends). */
const POS_TOL = 0.25;
const PATH_TOL = 0.25;
/** Colour channels and gradient stops, 0..1: half a step of 8-bit colour. */
const COLOUR_TOL = 0.004;
/** Opacity in percent. */
const OPACITY_TOL = 0.5;
const WIDTH_TOL = 0.05;
/** Scale in percent, rotation and skew in degrees. */
const SCALE_TOL = 0.25;
const ANGLE_TOL = 0.5;
// A symbol copy can be as big as the stage, so a hair of scale or turn is many pixels at its edge: tighter.
const COPY_POS_TOL = 0.05;
/** How far a moving shape's points may stray from a pure move of its first frame (see rigidMoves). */
const RIGID_TOL = 0.05;
/** Separate x and y tracks may each stray this share of the position tolerance (their errors add up). */
const SPLIT_TOL = 0.4;
const COPY_SCALE_TOL = 0.02;
const COPY_ANGLE_TOL = 0.02;
/** How far (stage pixels, on screen) the camera's anchor, zoom and turn may stray: it moves every layer, so it is held tighter than a position. */
const CAMERA_PX = 0.1;

/** `#rgb[a]` / `#rrggbb[aa]` as Lottie's 0..1 rgb and an alpha. */
export function lottieColor(c: string): { rgb: [number, number, number]; alpha: number } {
  let h = c.replace('#', '').toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return { rgb: [0, 0, 0], alpha: 1 };
  return { rgb: [r3(n(0)), r3(n(2)), r3(n(4))], alpha: h.length === 8 ? n(6) : 1 };
}

// ---------------------------------------------------------------- easing

interface Ease {
  o: { x: number[]; y: number[] };
  i: { x: number[]; y: number[] };
}
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const bez = (x1: number, y1: number, x2: number, y2: number): Ease => ({ o: { x: [r6(x1)], y: [r6(y1)] }, i: { x: [r6(x2)], y: [r6(y2)] } });
const BACK = 1.70158;

/**
 * The easing as one or two exact bezier pieces ([at, ease]: `at` is where the piece starts, 0..1), or null when it
 * can't be written exactly (springy, bouncy) and has to be baked. Frameling's presets are cubic polynomials, and a
 * cubic with x moving evenly is a bezier whose y handles come straight from its slopes at the ends.
 */
export function exactEase(e: Easing): [number, Ease][] | null {
  if (Array.isArray(e)) return [[0, bez(e[0], e[1], e[2], e[3])]];
  const ends = (d0: number, d1: number) => bez(1 / 3, d0 / 3, 2 / 3, 1 - d1 / 3);
  switch (e) {
    case 'linear':
      return [[0, ends(1, 1)]];
    case 'easeIn':
      return [[0, ends(0, 3)]];
    case 'easeOut':
      return [[0, ends(3, 0)]];
    case 'easeInOut':
      return [
        [0, ends(0, 3)],
        [0.5, ends(3, 0)],
      ];
    case 'backIn':
      return [[0, ends(0, BACK + 3)]];
    case 'backOut':
      return [[0, ends(BACK + 3, 0)]];
    default:
      return null;
  }
}

// ---------------------------------------------------------------- shapes

const stat = (k: unknown) => ({ a: 0, k });

/** One subpath as a Lottie bezier shape (vertices with in and out handles relative to them). */
export function lottiePath(sp: SubPath): Json {
  const pts = sp.points;
  const n = pts.length;
  const v: number[][] = [];
  const ii: number[][] = [];
  const oo: number[][] = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    v.push([rp(p.x), rp(p.y)]);
    // In: the second control of the curve arriving here. Out: the first control of the curve leaving.
    const arrive = k > 0 || sp.closed ? p : undefined;
    ii.push(arrive?.c2 && arrive.c1 ? [rp(arrive.c2.x - p.x), rp(arrive.c2.y - p.y)] : [0, 0]);
    const next = k + 1 < n ? pts[k + 1] : sp.closed ? pts[0] : undefined;
    oo.push(next?.c1 && next.c2 ? [rp(next.c1.x - p.x), rp(next.c1.y - p.y)] : [0, 0]);
  }
  return { c: sp.closed, v, i: ii, o: oo };
}

/** A brush stroke's outline, smoothed like the canvas does it (quadratic curves through the midpoints). */
const fitCache = new WeakMap<StrokeShape, Json>();

/** The same outline with fewer points: cubics fitted to the smoothed outline, kept only when they are fewer. */
function fittedOutline(s: StrokeShape, n: number): Json | null {
  const hit = fitCache.get(s);
  // A copy each time: players write into what they are given.
  if (hit !== undefined) return hit && { c: hit.c, v: hit.v.map((x: number[]) => [...x]), i: hit.i.map((x: number[]) => [...x]), o: hit.o.map((x: number[]) => [...x]) };
  let out: Json | null = null;
  const cubics = fitClosed(sampleMidpointSpline(strokeOutline(s), 0.75), FIT_TOLERANCE);
  if (cubics.length && cubics.length < n) {
    out = {
      c: true,
      v: cubics.map((c) => [rp(c[0][0]), rp(c[0][1])]),
      i: cubics.map((_, k) => {
        const c = cubics[(k + cubics.length - 1) % cubics.length];
        return [rp(c[2][0] - c[3][0]), rp(c[2][1] - c[3][1])];
      }),
      o: cubics.map((c) => [rp(c[1][0] - c[0][0]), rp(c[1][1] - c[0][1])]),
    };
  }
  fitCache.set(s, out);
  return out && fittedOutline(s, n);
}

export function strokeOutlinePath(s: StrokeShape, fit = false): Json | null {
  const p = strokeOutline(s);
  const n = p.length;
  if (n < 2) return null;
  if (fit && n >= 4) {
    const f = fittedOutline(s, n);
    if (f) return f;
  }
  if (n < 4) return { c: true, v: p.map(([x, y]) => [rp(x), rp(y)]), i: p.map(() => [0, 0]), o: p.map(() => [0, 0]) };
  const v: number[][] = [];
  const ii: number[][] = [];
  const oo: number[][] = [];
  // Vertices sit on the midpoints; the curve from midpoint k-1 to midpoint k bends towards point k.
  for (let k = 0; k < n; k++) {
    const a = p[k];
    const b = p[(k + 1) % n];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    v.push([rp(m[0]), rp(m[1])]);
    ii.push([rp((2 / 3) * (a[0] - m[0])), rp((2 / 3) * (a[1] - m[1]))]);
    oo.push([rp((2 / 3) * (b[0] - m[0])), rp((2 / 3) * (b[1] - m[1]))]);
  }
  return { c: true, v, i: ii, o: oo };
}

const LC = { butt: 1, round: 2, square: 3 } as const;
const LJ = { miter: 1, round: 2, bevel: 3 } as const;

type Tint = { color: string; amount: number };

/** How strongly a tint mixes in: its amount (never over 1) times the colour's own see-through, as the canvas paints it. */
function tintStrength(t: Tint): { a: number; rgb: [number, number, number] } {
  const w = lottieColor(t.color);
  return { a: Math.max(0, Math.min(1, t.amount)) * w.alpha, rgb: w.rgb };
}

/** A colour washed by symbol tints, innermost first (the same sum the canvas does with source-atop). */
function tinted(c: string, tints: Tint[]): { rgb: [number, number, number]; alpha: number } {
  const out = lottieColor(c);
  for (const t of tints) {
    const { a, rgb: w } = tintStrength(t);
    if (a <= 0) continue;
    out.rgb = out.rgb.map((v, i) => r3(v * (1 - a) + w[i] * a)) as [number, number, number];
  }
  return out;
}

/** A group transform for one frame (sprites: letters and particles). */
export interface Tr {
  /** Where the group turns and scales about (the origin when missing). */
  a?: number[];
  p: number[];
  s: number[];
  r: number;
  sk: number;
  o: number;
}

function trOf(m: readonly number[], alpha: number): Tr {
  const t = decompose(m, { x: 0, y: 0 });
  return { p: [r3(t.x), r3(t.y)], s: [r3(t.scaleX * 100), r3(t.scaleY * 100)], r: r3(t.rotation), sk: r3(-t.skew), o: r3(alpha * 100) };
}

/** A gradient as Lottie wants it: 1 linear or 2 radial, start and end, and the stops flattened (colours, then alphas). */
interface LottieGrad {
  t: number;
  s: number[];
  e: number[];
  p: number;
  k: number[];
}

export function lottieGradient(gr: Gradient, tints: Tint[]): LottieGrad {
  const stops = sortedStops(gr.stops);
  const k: number[] = [];
  const alphas: number[] = [];
  for (const st of stops) {
    const c = tinted(st.color, tints);
    k.push(r3(st.at), ...c.rgb);
    alphas.push(r3(st.at), r3(c.alpha));
  }
  if (alphas.some((v, i) => i % 2 === 1 && v < 1)) k.push(...alphas);
  return { t: gr.kind === 'radial' ? 2 : 1, s: [r3(gr.from.x), r3(gr.from.y)], e: [r3(gr.to.x), r3(gr.to.y)], p: stops.length, k };
}

/** The parts of a plain shape that can change from frame to frame. */
export interface ShapeLook {
  paths: Json[];
  fill: { rgb: number[]; o: number; grad?: LottieGrad } | null;
  stroke: { rgb: number[]; o: number; w: number; lc: number; lj: number; grad?: LottieGrad } | null;
  /** A soft round sprite: a radial fade of this colour (SPRITE_UNIT across). */
  soft?: { rgb: number[] };
  /** Sprites move as a group; plain shapes have their points in stage space and no transform. */
  tr?: Tr;
  /** Tolerances for the group's tracks, when they are tighter than the sprites' (see rigidMoves). */
  trTol?: { p: number; s: number; r: number };
}

/** `still`: the shape doesn't change over the run, so a brush outline may be refitted with fewer points. */
function lookOf(s: Exclude<Shape, InstanceShape>, tints: Tint[], still = false): ShapeLook {
  // Text and particles are turned into sprites before this (expandSprites).
  if (s.type === 'text' || s.type === 'particles') return { paths: [], fill: null, stroke: null };
  if (s.type === 'stroke') {
    const c = tinted(s.color, tints);
    const p = strokeOutlinePath(s, still);
    return { paths: p ? [p] : [], fill: { rgb: c.rgb, o: r3(c.alpha * s.opacity * 100) }, stroke: null };
  }
  const paths = s.paths.filter((sp) => sp.points.length).map(lottiePath);
  if (s.type === 'fill') {
    const c = tinted(s.color, tints);
    // A gradient's own stops carry their see-through, so the fill opacity is just the shape's.
    if (s.gradient) return { paths, fill: { rgb: c.rgb, o: r3(s.opacity * 100), grad: lottieGradient(s.gradient, tints) }, stroke: null };
    return { paths, fill: { rgb: c.rgb, o: r3(c.alpha * s.opacity * 100) }, stroke: null };
  }
  const ps = s as PathShape;
  const f = s.fill ? tinted(s.fill, tints) : null;
  const st = ps.stroke;
  const sc = st ? tinted(st.color, tints) : null;
  return {
    paths,
    fill: f ? (ps.fillGradient ? { rgb: f.rgb, o: r3(s.opacity * 100), grad: lottieGradient(ps.fillGradient, tints) } : { rgb: f.rgb, o: r3(f.alpha * s.opacity * 100) }) : null,
    stroke: st && sc ? { rgb: sc.rgb, o: r3((ps.strokeGradient ? 1 : sc.alpha) * s.opacity * 100), w: r3(st.width), lc: LC[st.cap], lj: LJ[st.join], ...(ps.strokeGradient ? { grad: lottieGradient(ps.strokeGradient, tints) } : {}) } : null,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A property from one value per frame: static when they're all the same, else a key per frame (blending to the next
 * key when `blend`, holding otherwise).
 */
function track(values: unknown[], times: number[], blend: boolean, wrap: (v: any) => unknown = (v) => v): Json {
  if (values.every((v) => same(v, values[0]))) return stat(wrap(values[0]));
  const k: Json[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i > 0 && i < values.length - 1 && same(values[i], values[i - 1]) && same(values[i], values[i + 1])) continue;
    const key: Json = { t: times[i], s: arr(wrap(values[i])) };
    if (i < values.length - 1) {
      if (blend && !same(values[i], values[i + 1])) Object.assign(key, bez(1 / 3, 1 / 3, 2 / 3, 2 / 3));
      else key.h = 1;
    }
    k.push(key);
  }
  return { a: 1, k };
}
const arr = (v: unknown) => (Array.isArray(v) ? v : [v]);

// A straight line in time (handles on the diagonal). A fresh one per key, since lottie-web writes into them.
const linear = () => ({ o: { x: [0], y: [0] }, i: { x: [1], y: [1] } });

/**
 * Like `track` for numbers that blend, but leaves out keys that the straight line between their neighbours already
 * hits within `tol` (on every frame in between), which keeps particles and moving letters small.
 */
export function smoothTrack(values: (number | number[])[], times: number[], tol: number): Json {
  const vs = values.map((v) => (Array.isArray(v) ? v : [v]));
  if (vs.every((v) => same(v, vs[0]))) return stat(values[0]);
  return { a: 1, k: fitKeys(vs, times, tol).map(({ i, ease }, n, all) => keyOf(vs[i], times[i], n < all.length - 1 ? vs[all[n + 1].i] : undefined, ease)) };
}

/**
 * A position from one `[x, y]` per frame, as x and y tracks of their own (and how many bytes that saves over one
 * track), when x and y keep different timing (drag sideways, gravity down): one shared easing needs a key wherever
 * either of them bends. Null when the shared track is as small or the position doesn't move.
 */
export function splitPosition(values: number[][], times: number[], tol: number): { x: Json; y: Json; saved: number } | null {
  const joint = smoothTrack(values, times, tol);
  if (joint.a === 0 || values.length < 4) return null;
  const x = smoothTrack(values.map((v) => v[0]), times, tol * SPLIT_TOL);
  const y = smoothTrack(values.map((v) => v[1]), times, tol * SPLIT_TOL);
  return { x, y, saved: JSON.stringify(joint).length - JSON.stringify([x, y]).length };
}

/**
 * A layer's position from one `[x, y]` per frame: Lottie's separated position (`s: true`, an x and a y track) when
 * that is clearly smaller than one track with a shared easing. Players read the easing of each separated track on its
 * own, so ThorVG (which reads only the first easing value of a multi-dimensional key) follows it best. Shape groups
 * can't use this (lottie-web ignores it there): see `shapeGroup`.
 */
export function positionTrack(values: number[][], times: number[], tol: number): Json {
  const joint = smoothTrack(values, times, tol);
  const sp = splitPosition(values, times, tol);
  return sp && sp.saved > 0.15 * JSON.stringify(joint).length ? { s: true, x: sp.x, y: sp.y } : joint;
}

/** A one-number track as a position track along one axis (the other stays 0). */
export function along(track: Json, axis: 0 | 1): Json {
  const at = (v: number) => (axis === 0 ? [v, 0] : [0, v]);
  if (!track.a) return stat(at(track.k[0] ?? track.k));
  return { a: 1, k: track.k.map((key: Json) => ({ ...key, s: at(key.s[0]) })) };
}

/** A key: the value, and how it moves to the next key's (held when they are the same). */
function keyOf(v: number[], t: number, next: number[] | undefined, ease: [number, number]): Json {
  const key: Json = { t, s: v };
  if (!next) return key;
  if (same(v, next)) key.h = 1;
  else Object.assign(key, ease === LINEAR ? linear() : bez(1 / 3, ease[0], 2 / 3, ease[1]));
  return key;
}

const LINEAR: [number, number] = [1 / 3, 2 / 3];

/**
 * One shared easing (a cubic bezier whose x handles sit at a third and two thirds, so only the two y values vary) that
 * carries every component from frame `a` to frame `j` within `tol`, or null. Straight lines are tried first; else the
 * curve is a least squares fit, which suits drag, gravity and fades, where every component follows the same timing.
 */
function fitSegment(vs: number[][], times: number[], a: number, j: number, tol: number): [number, number] | null {
  if (j === a + 1) return LINEAR;
  const span = times[j] - times[a];
  const off = (ease: [number, number]) => {
    let worst = 0;
    for (let i = a + 1; i < j; i++) {
      const u = (times[i] - times[a]) / span;
      const g = 3 * (1 - u) * (1 - u) * u * ease[0] + 3 * (1 - u) * u * u * ease[1] + u * u * u;
      for (let c = 0; c < vs[i].length; c++) worst = Math.max(worst, Math.abs(vs[a][c] + (vs[j][c] - vs[a][c]) * g - vs[i][c]));
    }
    return worst;
  };
  if (off(LINEAR) <= tol) return LINEAR;
  let m00 = 0;
  let m01 = 0;
  let m11 = 0;
  let r0 = 0;
  let r1 = 0;
  for (let i = a + 1; i < j; i++) {
    const u = (times[i] - times[a]) / span;
    const A = 3 * (1 - u) * (1 - u) * u;
    const B = 3 * (1 - u) * u * u;
    for (let c = 0; c < vs[i].length; c++) {
      const d = vs[j][c] - vs[a][c];
      const r = vs[i][c] - vs[a][c] - d * u * u * u;
      m00 += d * d * A * A;
      m01 += d * d * A * B;
      m11 += d * d * B * B;
      r0 += d * r * A;
      r1 += d * r * B;
    }
  }
  const det = m00 * m11 - m01 * m01;
  if (Math.abs(det) < 1e-12) return null;
  const ease: [number, number] = [(r0 * m11 - r1 * m01) / det, (m00 * r1 - m01 * r0) / det];
  const r = ease.map((y) => r6(y)) as [number, number];
  // Between the two keys the value must stay between their values: an overshoot would take an opacity below zero or a
  // colour past white between frames, which players clamp in different places.
  for (let k = 1; k < 20; k++) {
    const t = k / 20;
    const g = 3 * (1 - t) * (1 - t) * t * r[0] + 3 * (1 - t) * t * t * r[1] + t * t * t;
    if (g < 0 || g > 1) return null;
  }
  return off(r) <= tol ? r : null;
}

/**
 * Moving shapes whose points are the same on every frame but carried along by a turn, a shift and maybe a uniform
 * scale (a posed bone part, a spinning logo) are written as one path with an animated group transform: a few eased
 * keys instead of a whole path per frame, and the turn is exact where blending the points frame to frame would cut the
 * corner. Null when the paths aren't such a move to within `RIGID_TOL` stage pixels on every frame.
 */
export function rigidMoves(looks: ShapeLook[]): ShapeLook[] | null {
  const first = looks[0];
  if (looks.length < 3 || !first.paths.length || looks.some((l) => l.tr || l.soft || l.fill?.grad || l.stroke?.grad)) return null;
  const same0 = (l: ShapeLook) => l.paths.length === first.paths.length && l.paths.every((p, k) => p.v.length === first.paths[k].v.length && p.c === first.paths[k].c);
  if (!looks.every(same0) || looks.every((l) => same(l.paths, first.paths))) return null;
  const pts = (l: ShapeLook) => l.paths.flatMap((p) => p.v as number[][]);
  const hands = (l: ShapeLook) => l.paths.flatMap((p) => [...(p.i as number[][]), ...(p.o as number[][])]);
  const u0 = pts(first);
  const h0 = hands(first);
  const n = u0.length;
  const cx = u0.reduce((s, q) => s + q[0], 0) / n;
  const cy = u0.reduce((s, q) => s + q[1], 0) / n;
  const uu = u0.reduce((s, q) => s + (q[0] - cx) ** 2 + (q[1] - cy) ** 2, 0);
  if (uu < 1e-6) return null;
  const radius = Math.max(1, ...u0.map((q) => Math.hypot(q[0] - cx, q[1] - cy)), ...h0.map((q) => Math.hypot(q[0], q[1])));
  const trs: Tr[] = [];
  for (const l of looks) {
    const w = pts(l);
    const wx = w.reduce((s, q) => s + q[0], 0) / n;
    const wy = w.reduce((s, q) => s + q[1], 0) / n;
    let dot = 0;
    let crs = 0;
    for (let j = 0; j < n; j++) {
      const ax = u0[j][0] - cx;
      const ay = u0[j][1] - cy;
      const bx = w[j][0] - wx;
      const by = w[j][1] - wy;
      dot += ax * bx + ay * by;
      crs += ax * by - ay * bx;
    }
    const a = dot / uu;
    const b = crs / uu;
    // Where the centre of the first frame's points ends up, and the move as a matrix: x' = a x - b y + e.
    const e = wx - (a * cx - b * cy);
    const f = wy - (b * cx + a * cy);
    for (let j = 0; j < n; j++) if (Math.hypot(a * u0[j][0] - b * u0[j][1] + e - w[j][0], b * u0[j][0] + a * u0[j][1] + f - w[j][1]) > RIGID_TOL) return null;
    const h = hands(l);
    for (let j = 0; j < h.length; j++) if (Math.hypot(a * h0[j][0] - b * h0[j][1] - h[j][0], b * h0[j][0] + a * h0[j][1] - h[j][1]) > RIGID_TOL) return null;
    // A line's width is scaled with the group, so with a line the scale must stay 1.
    if ((first.stroke || l.stroke) && Math.abs(Math.hypot(a, b) - 1) > 0.001) return null;
    // A scale that is one to within a hair of a pixel at the far edge is one.
    const k = Math.hypot(a, b);
    const snap = Math.abs(k - 1) * radius < RIGID_TOL / 2 ? k : 1;
    const t = decompose([a / snap, b / snap, -b / snap, a / snap, e, f], { x: cx, y: cy });
    trs.push({ a: [r3(cx), r3(cy)], p: [r3(t.x), r3(t.y)], s: [r3(t.scaleX * 100), r3(t.scaleY * 100)], r: r3(t.rotation), sk: 0, o: 100 });
  }
  // Tolerances as stage pixels at the shape's far edge.
  const trTol = { p: RIGID_TOL, s: Math.max(0.005, ((RIGID_TOL) / radius) * 100), r: Math.max(0.01, ((RIGID_TOL) / radius) * (180 / Math.PI)) };
  return looks.map((l, k) => ({ ...l, paths: first.paths, tr: trs[k], trTol }));
}

/** The frames that still need a key, each with the easing to the next one. Frames in between lie within `tol`. */
function fitKeys(vs: number[][], times: number[], tol: number): { i: number; ease: [number, number] }[] {
  const out: { i: number; ease: [number, number] }[] = [];
  let a = 0;
  while (a < vs.length - 1) {
    let best = a + 1;
    let bestEase = LINEAR;
    // A curve needs a few frames to be told from a line, so a miss on a short stretch doesn't end the search.
    let misses = 0;
    for (let j = a + 2; j < vs.length && misses < 4; j++) {
      const e = fitSegment(vs, times, a, j, tol);
      if (!e) {
        misses++;
        continue;
      }
      misses = 0;
      best = j;
      bestEase = e;
    }
    out.push({ i: a, ease: bestEase });
    a = best;
  }
  out.push({ i: vs.length - 1, ease: LINEAR });
  return out;
}

const flatPath = (p: Json): number[] => [...p.v.flat(), ...p.i.flat(), ...p.o.flat()];

/**
 * A path that changes over frames (every frame has the same number of points), keys left out where the straight line
 * between neighbours stays within `tol` stage pixels at every point and handle.
 */
function pathTrack(vals: Json[], times: number[], tol: number): Json {
  const flat = vals.map(flatPath);
  return { a: 1, k: fitKeys(flat, times, tol).map(({ i, ease }, n, all) => ({ ...keyOf(flat[i], times[i], n < all.length - 1 ? flat[all[n + 1].i] : undefined, ease), s: [vals[i]] })) };
}

// A fresh one each time: lottie-web writes into the data it's given, so shared objects break it.
const noTr = () => ({ ty: 'tr', p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) });

/** Angles per frame without jumps of a whole turn, so blending between frames takes the short way. */
function unwrap(rs: number[]): number[] {
  const out = rs.slice();
  for (let i = 1; i < out.length; i++) {
    while (out[i] - out[i - 1] > 180) out[i] -= 360;
    while (out[i] - out[i - 1] < -180) out[i] += 360;
    out[i] = r3(out[i]);
  }
  return out;
}

/** A path with `n` points: the last point repeated, its curve moved onto the copy, so the outline is unchanged. */
export function padPath(p: Json, n: number): Json {
  if (p.v.length >= n || !p.v.length) return p;
  const v = p.v.slice();
  const ii = p.i.slice();
  const oo = p.o.slice();
  const last = v.length - 1;
  const out = oo[last];
  oo[last] = [0, 0];
  while (v.length < n) {
    v.push(v[last]);
    ii.push([0, 0]);
    oo.push([0, 0]);
  }
  oo[v.length - 1] = out;
  return { c: p.c, v, i: ii, o: oo };
}

/** Start, end and stops of a gradient over a run of frames. They blend when every frame has the same number of stops. */
function gradProps(first: LottieGrad, per: (LottieGrad | undefined)[], times: number[]): Json {
  const all = per.map((g) => g ?? first);
  const blend = all.every((g) => g.p === first.p && g.k.length === first.k.length && g.t === first.t);
  const pick = blend ? all : all.map(() => first);
  return { t: first.t, s: smoothTrack(pick.map((g) => g.s), times, POS_TOL), e: smoothTrack(pick.map((g) => g.e), times, POS_TOL), h: stat(0), a: stat(0), g: { p: first.p, k: smoothTrack(pick.map((g) => g.k), times, COLOUR_TOL) } };
}

/** A group for one shape over a run of frames. */
function shapeGroup(raw: ShapeLook[], times: number[], name: string): Json | null {
  const plain = shapeGroupOf(raw, times, name);
  const rigid = plain && rigidMoves(raw);
  if (!rigid) return plain;
  const moved = shapeGroupOf(rigid, times, name);
  return moved && JSON.stringify(moved).length < JSON.stringify(plain).length ? moved : plain;
}

function shapeGroupOf(looks: ShapeLook[], times: number[], name: string): Json | null {
  const it: Json[] = [];
  const nPaths = Math.max(...looks.map((l) => l.paths.length));
  if (!nPaths) return null;
  const pathsMatch = looks.every((l) => l.paths.length === nPaths);
  for (let k = 0; k < nPaths; k++) {
    // Blend between frames only when every frame has the same number of points. Players also need every key of a
    // path to have the same number of points, so shorter ones get extra points that change nothing.
    const vals = looks.map((l) => (pathsMatch ? l.paths[k] : l.paths[k] ?? { c: true, v: [], i: [], o: [] }));
    const blend = vals.every((v) => v.v.length === vals[0].v.length);
    const most = Math.max(...vals.map((v) => v.v.length));
    if (!blend) for (let j = 0; j < vals.length; j++) vals[j] = padPath(vals[j], most);
    it.push({ ty: 'sh', nm: `Path ${k + 1}`, ks: blend && !vals.every((v) => same(v, vals[0])) ? pathTrack(vals, times, PATH_TOL) : track(vals, times, blend, (v) => v) });
  }
  // Fill and line are kept on every frame where any frame has them (see-through where missing), so the structure
  // is the same throughout.
  const anyStroke = looks.some((l) => l.stroke);
  if (anyStroke) {
    const st = looks.find((l) => l.stroke)!.stroke!;
    // A gradient line: Lottie's gradient stroke, with the gradient as it is on its first frame.
    const sg = looks.find((l) => l.stroke?.grad)?.stroke?.grad;
    it.push({
      ty: sg ? 'gs' : 'st',
      nm: 'Line',
      ...(sg ? gradProps(sg, looks.map((l) => l.stroke?.grad), times) : { c: smoothTrack(looks.map((l) => [...(l.stroke ?? st).rgb, 1]), times, COLOUR_TOL) }),
      o: smoothTrack(looks.map((l) => (l.stroke ? l.stroke.o : 0)), times, OPACITY_TOL),
      w: smoothTrack(looks.map((l) => (l.stroke ? l.stroke.w : 0)), times, WIDTH_TOL),
      lc: st.lc,
      lj: st.lj,
      ml: 10,
    });
  }
  if (looks.some((l) => l.fill)) {
    const f = looks.find((l) => l.fill)!.fill!;
    const fg = looks.find((l) => l.fill?.grad)?.fill?.grad;
    if (fg) it.push({ ty: 'gf', nm: 'Fill', ...gradProps(fg, looks.map((l) => l.fill?.grad), times), o: smoothTrack(looks.map((l) => (l.fill ? l.fill.o : 0)), times, OPACITY_TOL), r: 2 });
    else it.push({ ty: 'fl', nm: 'Fill', c: smoothTrack(looks.map((l) => [...(l.fill ?? f).rgb, 1]), times, COLOUR_TOL), o: smoothTrack(looks.map((l) => (l.fill ? l.fill.o : 0)), times, OPACITY_TOL), r: 2 });
  }
  if (looks.some((l) => l.soft)) {
    // The canvas's soft puff: full colour in the middle, two thirds at 45%, gone at the edge.
    const f = looks.find((l) => l.soft)!.soft!;
    const stops = (c: number[]) => [0, ...c, 0.45, ...c, 1, ...c, 0, 1, 0.45, r3(0xaa / 255), 1, 0];
    it.push({ ty: 'gf', nm: 'Soft', o: stat(100), r: 1, t: 2, s: stat([0, 0]), e: stat([SPRITE_UNIT / 2, 0]), h: stat(0), a: stat(0), g: { p: 3, k: smoothTrack(looks.map((l) => stops((l.soft ?? f).rgb)), times, COLOUR_TOL) } });
  }
  let outer: Json | null = null;
  if (looks[0].tr) {
    const trs = looks.map((l) => l.tr!);
    const tol = looks[0].trTol ?? { p: POS_TOL, s: SCALE_TOL, r: ANGLE_TOL };
    // x and y with their own timing go in two nested groups (an outer one that only moves sideways, an inner one that
    // moves up and down and does the rest): a whole transform per axis is not needed, and lottie-web and ThorVG both
    // play nested groups.
    const sp = splitPosition(trs.map((t) => t.p), times, tol.p);
    const nested = !!sp && sp.x.a === 1 && sp.y.a === 1;
    if (nested) outer = { ...noTr(), p: along(sp!.x, 0) };
    it.push({
      ty: 'tr',
      a: stat(trs[0].a ?? [0, 0]),
      p: nested ? along(sp!.y, 1) : smoothTrack(trs.map((t) => t.p), times, tol.p),
      s: smoothTrack(trs.map((t) => t.s), times, tol.s),
      r: smoothTrack(unwrap(trs.map((t) => t.r)), times, tol.r),
      o: smoothTrack(trs.map((t) => t.o), times, OPACITY_TOL),
      sk: smoothTrack(trs.map((t) => t.sk), times, tol.r),
      sa: stat(0),
    });
  } else it.push(noTr());
  if (outer) {
    // Only when the two groups together are clearly smaller than one.
    const joint = it.map((x) => (x.ty === 'tr' ? { ...x, p: smoothTrack(looks.map((l) => l.tr!.p), times, looks[0].trTol?.p ?? POS_TOL) } : x));
    const two = { ty: 'gr', nm: name, it: [{ ty: 'gr', nm: 'Move', it }, outer] };
    const one = { ty: 'gr', nm: name, it: joint };
    if (JSON.stringify(two).length < JSON.stringify(one).length * 0.9) return two;
    return one;
  }
  return { ty: 'gr', nm: name, it };
}

// ---------------------------------------------------------------- sprites (letters and particles)

const K = 0.5522847498;

function circleSub(r: number): SubPath {
  const k = r * K;
  return {
    closed: true,
    points: [
      { x: r, y: 0, c1: { x: 0 - k, y: -r }, c2: { x: r, y: -k } },
      { x: 0, y: r, c1: { x: r, y: k }, c2: { x: k, y: r } },
      { x: -r, y: 0, c1: { x: -k, y: r }, c2: { x: -r, y: k } },
      { x: 0, y: -r, c1: { x: -r, y: -k }, c2: { x: -k, y: -r } },
    ],
  };
}

const rectSub = (x: number, y: number, w: number, h: number): SubPath => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });

function starSub(r: number, points: number, inner: number): SubPath {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return { closed: true, points: pts };
}

/** One particle as a sprite look (symbol sprites are handled as precomp layers instead). */
function particleLook(s: ParticlesShape, sp: ParticleSprite, tints: Tint[]): ShapeLook {
  const c = tinted(sp.p.color, tints);
  const R = SPRITE_UNIT / 2;
  const fillOf = { rgb: c.rgb, o: r3(c.alpha * 100) };
  const p = sp.p;
  switch (s.sprite) {
    case 'streak': {
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      // Drawn along its own axis and moved by the group, so only the length changes the path and the position keys thin out.
      const line: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: -len, y: 0 }] };
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      return { paths: [lottiePath(line)], fill: null, stroke: { rgb: c.rgb, o: r3(c.alpha * 100), w: r3(p.size), lc: 2, lj: 2 }, tr: trOf([cos, sin, -sin, cos, p.x, p.y], sp.alpha) };
    }
    case 'flake': {
      const lines: SubPath[] = [0, 1, 2].map((i) => {
        const a = (i * Math.PI) / 3;
        return { closed: false, points: [{ x: Math.cos(a) * R, y: Math.sin(a) * R }, { x: -Math.cos(a) * R, y: -Math.sin(a) * R }] };
      });
      const k = Math.max(1e-4, p.size / SPRITE_UNIT);
      return { paths: lines.map(lottiePath), fill: null, stroke: { rgb: c.rgb, o: r3(c.alpha * 100), w: r3(Math.max(0.6, p.size / 9) / k), lc: 2, lj: 2 }, tr: trOf(sp.m, sp.alpha) };
    }
    case 'soft':
      return { paths: [lottiePath(circleSub(R))], fill: null, stroke: null, soft: { rgb: c.rgb }, tr: trOf(sp.m, sp.alpha) };
    case 'square':
      return { paths: [lottiePath(rectSub(-R, -R, SPRITE_UNIT, SPRITE_UNIT))], fill: fillOf, stroke: null, tr: trOf(sp.m, sp.alpha) };
    case 'confetti':
      return { paths: [lottiePath(rectSub(-R, -R * 0.5, SPRITE_UNIT, SPRITE_UNIT * 0.5))], fill: fillOf, stroke: null, tr: trOf(sp.m, sp.alpha) };
    case 'star':
    case 'spark':
      return { paths: [lottiePath(starSub(R, s.sprite === 'star' ? 5 : 4, s.sprite === 'star' ? 0.45 : 0.22))], fill: fillOf, stroke: null, tr: trOf(sp.m, sp.alpha) };
    default:
      return { paths: [lottiePath(circleSub(R))], fill: fillOf, stroke: null, tr: trOf(sp.m, sp.alpha) };
  }
}

/** A symbol used as a particle sprite, on one frame. */
interface SymbolSprite {
  type: 'psym';
  symbolId: string;
  m: Mat;
  alpha: number;
  /** The symbol's own frame. */
  inner: number;
}
/** A sprite look standing in for a shape. */
interface LookItem {
  type: 'look';
  look: ShapeLook;
}
type Item = Shape | LookItem | SymbolSprite;

/** Copies the nearest shown frame's sprite into frames where it's missing, faded right out. */
function fillGaps<T extends LookItem | SymbolSprite>(col: (T | null)[], hide: (t: T) => T): T[] | null {
  const firstShown = col.findIndex((x) => x);
  if (firstShown < 0) return null;
  const out: T[] = [];
  let last = col[firstShown]!;
  for (let i = 0; i < col.length; i++) {
    const x = col[i];
    if (x) {
      last = x;
      out.push(x);
    } else out.push(hide(i < firstShown ? col[firstShown]! : last));
  }
  return out;
}

const hideLook = (l: LookItem): LookItem => ({ type: 'look', look: { ...l.look, tr: l.look.tr ? { ...l.look.tr, o: 0 } : l.look.tr } });
const hideSym = (s: SymbolSprite): SymbolSprite => ({ ...s, alpha: 0 });

/**
 * Text and particles turned into sprites, frame by frame, with the same number of items on every frame: a letter per
 * letter, and a slot per particle that's alive on any of the frames (faded out where it isn't).
 */
function expandSprites(ctx: Ctx, shapes: Shape[][]): Item[][] {
  const n = shapes[0].length;
  const frames = shapes.length;
  const cols: Item[][][] = [];
  for (let k = 0; k < n; k++) {
    const s0 = shapes[0][k];
    if (s0.type === 'text') {
      if (!canTraceText()) {
        ctx.notes.add('Text was left out (it needs the app to trace the letters).');
        cols.push(shapes.map(() => []));
        continue;
      }
      const per = shapes.map((list) => glyphSprites(list[k] as TextShape));
      const most = Math.max(...per.map((g) => g.length));
      const items: LookItem[][] = [];
      for (let g = 0; g < most; g++) {
        const col = per.map((gs, f): LookItem | null => {
          const gl = gs[g];
          if (!gl) return null;
          const t = shapes[f][k] as TextShape;
          const c = tinted(t.color, ctx.tints);
          return { type: 'look', look: { paths: gl.paths.map(lottiePath), fill: { rgb: c.rgb, o: r3(c.alpha * 100) }, stroke: null, tr: trOf(gl.m, gl.alpha) } };
        });
        const full = fillGaps(col, hideLook);
        if (full) items.push(full);
      }
      cols.push(shapes.map((_, f) => items.map((c) => c[f])));
      continue;
    }
    if (s0.type === 'particles') {
      const per = shapes.map((list) => particleSprites(list[k] as ParticlesShape));
      const keys: number[] = [];
      const seen = new Set<number>();
      for (const list of per)
        for (const sp of list)
          if (!seen.has(sp.key)) {
            seen.add(sp.key);
            keys.push(sp.key);
          }
      const byKey = per.map((list) => new Map(list.map((sp) => [sp.key, sp])));
      const slots: Item[][] = [];
      for (const key of keys) {
        const col = byKey.map((m, f): LookItem | SymbolSprite | null => {
          const sp = m.get(key);
          if (!sp) return null;
          const s = shapes[f][k] as ParticlesShape;
          if (sp.sprite) return { type: 'psym', symbolId: s.symbolId!, m: sp.m, alpha: sp.alpha, inner: sp.inner ?? 0 };
          return { type: 'look', look: particleLook(s, sp, ctx.tints) };
        });
        const first = col.find((x) => x);
        const full = first?.type === 'psym' ? fillGaps(col as (SymbolSprite | null)[], hideSym) : fillGaps(col as (LookItem | null)[], hideLook);
        if (full) slots.push(full);
      }
      cols.push(shapes.map((_, f) => slots.map((c) => c[f])));
      continue;
    }
    cols.push(shapes.map((list) => [list[k]]));
  }
  const out: Item[][] = [];
  for (let f = 0; f < frames; f++) out.push(cols.flatMap((c) => c[f]));
  return out;
}

// ---------------------------------------------------------------- building

interface Ctx {
  doc: Doc;
  assets: Json[];
  symbolAssets: Map<string, string>;
  /** Precomps for drawings shown in several keys of a layer, by drawing and colour wash. */
  sharedDrawings: Map<string, string>;
  images: Map<string, string>;
  /** How far symbol content may sit outside the stage before a copy clips it. */
  pad: number;
  /** Colour washes in force while building a symbol's precomp, innermost first. */
  tints: Tint[];
  /** Plain words about what didn't come across exactly. */
  notes: Set<string>;
  comps: number;
  /** Building a symbol's precomp with looks inside: its layers (no camera, pictures baked in symbol space). */
  symbolLayers?: Layer[];
  /** How baked pictures are made. */
  pictures: PictureLook;
  bake?: Partial<BakeSpec>;
  /** Soften and Shadow are baked too (see LottieOptions.softAndShadow). */
  bakeSoft?: boolean;
  bank?: PictureBank;
}

/** Instance transform to Lottie's (anchor at the registration point; Lottie's skew turns the other way). */
function instanceKs(insts: InstanceShape[], times: number[], origin: { x: number; y: number }, pad: number, tween?: { cel: Cel; next: Cel; a: InstanceShape; b: InstanceShape; tw: Tween; offset: number }): Json {
  const ks: Json = { a: stat([r3(origin.x + pad), r3(origin.y + pad)]) };
  const exact = tween && !tween.tw.path && !tween.tw.slice ? exactEase(tween.tw.ease) : null;
  if (tween && exact) {
    // Two keys (or three for gentle start and stop) with the easing as handles.
    const t0 = tween.cel.start - tween.offset;
    const t1 = tween.next.start - tween.offset;
    const end = tweenInstance(tween.a, tween.b, tween.tw, 1);
    const at = (u: number) => tweenInstance(tween.a, tween.b, { ...tween.tw, ease: 'linear' }, u);
    const keyed = (get: (s: InstanceShape) => number[]) => {
      const k: Json[] = exact.map(([u, e]) => ({ t: r3(t0 + (t1 - t0) * u), s: get(at(u)), ...e }));
      k.push({ t: t1, s: get(end) });
      return { a: 1, k };
    };
    ks.p = keyed((s) => [r3(s.transform.x), r3(s.transform.y)]);
    ks.s = keyed((s) => [r3(s.transform.scaleX * 100), r3(s.transform.scaleY * 100)]);
    ks.r = keyed((s) => [r3(s.transform.rotation)]);
    ks.sk = keyed((s) => [r3(-s.transform.skew)]);
    ks.sa = stat(0);
    ks.o = keyed((s) => [r3(s.opacity * 100)]);
    return ks;
  }
  ks.p = positionTrack(insts.map((s) => [r3(s.transform.x), r3(s.transform.y)]), times, COPY_POS_TOL);
  ks.s = smoothTrack(insts.map((s) => [r3(s.transform.scaleX * 100), r3(s.transform.scaleY * 100)]), times, COPY_SCALE_TOL);
  ks.r = smoothTrack(insts.map((s) => r3(s.transform.rotation)), times, COPY_ANGLE_TOL);
  ks.sk = smoothTrack(insts.map((s) => r3(-s.transform.skew)), times, COPY_ANGLE_TOL);
  ks.sa = stat(0);
  ks.o = smoothTrack(insts.map((s) => r3(s.opacity * 100)), times, 0.2);
  return ks;
}

const tintKey = (tints: Tint[]) => tints.map((t) => `${t.color}:${r3(t.amount)}`).join('|');

/** The precomp asset for a symbol (one per colour wash it's shown with), made once. */
function symbolAsset(ctx: Ctx, symbolId: string, tints: Tint[] = ctx.tints): string | undefined {
  const mapKey = symbolId + '#' + tintKey(tints);
  const known = ctx.symbolAssets.get(mapKey);
  if (known) return known;
  const c = symbolContent(ctx.doc, symbolId);
  if (!c) return undefined;
  const id = `symbol_${ctx.symbolAssets.size}`;
  ctx.symbolAssets.set(mapKey, id);
  const asset: Json = { id, nm: c.def.name, fr: ctx.doc.fps, layers: [] };
  ctx.assets.push(asset);
  const outer = ctx.tints;
  ctx.tints = tints;
  // Looks on the symbol's own layers follow the compositing plan, as on the stage (the canvas draws them that way).
  const outerLayers = ctx.symbolLayers;
  let layers: Json[];
  if (layersHaveLook(c.layers)) {
    ctx.symbolLayers = c.layers;
    try {
      layers = levelContent(ctx, buildPlan({ ...ctx.doc, layers: c.layers }, (l) => l.visible && !l.reference && l.kind !== 'camera'), { from: 0, to: c.length - 1, offset: 0 });
    } finally {
      ctx.symbolLayers = outerLayers;
    }
  } else layers = buildLayers(ctx, c.layers, 0, c.length - 1, 0);
  ctx.tints = outer;
  // Everything inside hangs off one null that moves it into the precomp's padded box (precomps clip to their box).
  const shift = { ty: 3, ind: 1, nm: 'Offset', ip: 0, op: c.length, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([ctx.pad, ctx.pad]), s: stat([100, 100]), r: stat(0), o: stat(100) } };
  asset.layers = [...numbered(fadeAsWhole(ctx, layers), 2, 1), shift];
  return id;
}

/** Gives layers their index (top first, the way Lottie lists them) and an optional parent. */
function numbered(bottomFirst: Json[], firstInd: number, parent?: number | ((l: Json) => number | undefined)): Json[] {
  const top = bottomFirst.slice().reverse();
  top.forEach((l, k) => {
    l.ind = firstInd + k;
    const p = typeof parent === 'function' ? parent(l) : parent;
    if (p !== undefined) l.parent = p;
  });
  return top;
}

function pngDataUrl(width: number, height: number, pixels: Uint8ClampedArray | Uint8Array): string {
  const png = encodePng({ width, height, pixels: pixels as Uint8ClampedArray });
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(bin);
}

function imageAsset(ctx: Ctx, key: string, d: PixelDrawing, pixelSize: number): string {
  const fullKey = key + '#' + tintKey(ctx.tints);
  const known = ctx.images.get(fullKey);
  if (known) return known;
  // Scaled up with hard edges here, so a player's smooth scaling can't blur the pixel art.
  const w = d.width * pixelSize;
  const h = d.height * pixelSize;
  const big = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / pixelSize);
    for (let x = 0; x < w; x++) {
      const si = (sy * d.width + Math.floor(x / pixelSize)) * 4;
      big.set(d.pixels.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  // Colour washes of the symbol it sits in, baked into the picture.
  for (const t of ctx.tints) {
    const { a, rgb } = tintStrength(t);
    if (a <= 0) continue;
    const c = rgb.map((v) => v * 255);
    for (let i = 0; i < big.length; i += 4) for (let j = 0; j < 3; j++) big[i + j] = big[i + j] * (1 - a) + c[j] * a;
  }
  const id = `image_${ctx.images.size}`;
  ctx.images.set(fullKey, id);
  ctx.assets.push({ id, w, h, u: '', p: pngDataUrl(w, h, big), e: 1 });
  return id;
}


// ---------------------------------------------------------------- layers on bones

type XY = { x: number; y: number };

/** Where a rest-space point goes on a bent mesh: through the triangle holding it (or the nearest one). */
function meshPoint(mesh: PosedMesh, x: number, y: number): XY {
  const { src, dst, triangles } = mesh;
  let best: { i: number; u: number; v: number; w: number; out: number } | null = null;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const ax = src[a * 2], ay = src[a * 2 + 1], bx = src[b * 2], by = src[b * 2 + 1], cx = src[c * 2], cy = src[c * 2 + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!det) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
    const w = 1 - u - v;
    // How far outside the triangle the point is (0 inside), to fall back on the nearest.
    const out = Math.max(0, -u) + Math.max(0, -v) + Math.max(0, -w);
    if (!best || out < best.out) best = { i: t, u, v, w, out };
    if (out === 0) break;
  }
  if (!best) return { x, y };
  const [a, b, c] = [triangles[best.i], triangles[best.i + 1], triangles[best.i + 2]];
  return { x: best.u * dst[a * 2] + best.v * dst[b * 2] + best.w * dst[c * 2], y: best.u * dst[a * 2 + 1] + best.v * dst[b * 2 + 1] + best.w * dst[c * 2 + 1] };
}

function mapShape(s: Exclude<Shape, InstanceShape>, f: (p: XY) => XY, alpha: number): Shape {
  if (s.type === 'text' || s.type === 'particles') return s;
  const sub = (paths: SubPath[]) => paths.map((sp) => ({ closed: sp.closed, points: sp.points.map((q) => ({ ...f(q), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) })) }));
  if (s.type === 'stroke') {
    // A brush stroke goes as its outline, so its width bends with the part too.
    const o = strokeOutline(s);
    return { id: s.id, type: 'fill', paths: [{ closed: true, points: o.map(([x, y]) => f({ x, y })) }], color: s.color, opacity: s.opacity * alpha };
  }
  return { ...s, paths: sub(s.paths), opacity: s.opacity * alpha };
}

/** Posed bone groups (no symbol) turned into plain shapes in stage space. Pixel art on a bone isn't carried. */
function flattenBound(shapes: Shape[]): Shape[] {
  const out: Shape[] = [];
  for (const s of shapes) {
    if (!(isPosed(s) && !s.symbolId)) {
      out.push(s);
      continue;
    }
    const m = s.posed.matrix;
    for (const l of s.posed.layers) {
      if (l.drawing.kind !== 'vector') continue;
      const mesh = (l as { mesh?: PosedMesh }).mesh;
      const f = (p: XY): XY => {
        const q = mesh ? meshPoint(mesh, p.x, p.y) : p;
        return { x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] };
      };
      for (const t of flattenBound(l.drawing.shapes)) out.push(isInstance(t) ? t : mapShape(t, f, l.opacity * s.opacity));
    }
  }
  return out;
}

/** Shape signature, to check every frame of a key has the same kinds of shape in the same order. */
const sig = (shapes: Shape[]) => shapes.map((s) => (s.type === 'instance' ? 'i:' + s.symbolId : 'p')).join(',');

/**
 * Lottie layers for a list of Frameling layers, bottom first, frames `from`..`to` (inclusive) shown at Lottie time
 * `frame - offset`. Used inside symbols with no looks on their layers (only opacity); symbols with looks go through
 * levelContent, as the stage does.
 */
function buildLayers(ctx: Ctx, layers: Layer[], from: number, to: number, offset: number): Json[] {
  const out: Json[] = [];
  const { doc } = ctx;
  for (const layer of layers) {
    if (!layer.visible || layer.reference || layer.kind === 'camera' || layer.mask || (layer.folder && folderChain(doc.folders, layer.folder).some((f) => !f.visible))) continue;
    out.push(...layerPieces(ctx, layer, from, to, offset, true));
  }
  return out;
}

/** One layer's Lottie layers, bottom first. `withOpacity` puts the layer's opacity on each piece. */
function layerPieces(ctx: Ctx, layer: Layer, from: number, to: number, offset: number, withOpacity: boolean): Json[] {
  const out: Json[] = [];
  const { doc } = ctx;
  const op = withOpacity ? layer.opacity : 1;
  const uses = drawingUses(doc, layer, from, to);
  for (const cel of layer.cels) {
    const a = Math.max(from, cel.start);
    const b = Math.min(to, cel.start + cel.length - 1);
    if (a > b) continue;
    const tag = (l: Json) => {
      l.nm = layer.name + (layer.cels.length > 1 ? ` (frame ${cel.start + 1})` : '');
      l.frameling = { layer: layer.id };
      if (op < 1) l.ks.o = scaleO(l.ks.o, op);
      return l;
    };
    if (layer.kind === 'pixel' || layer.kind === 'tilemap') {
      const d = doc.drawings[cel.drawingId];
      const px = d?.kind === 'pixel' ? d : d?.kind === 'tilemap' ? flattenTilemap(doc, d, cel.start) : undefined;
      if (!px) continue;
      const id = imageAsset(ctx, px.id + ':' + layer.pixelSize, px, layer.pixelSize);
      out.push(tag({ ty: 2, refId: id, ip: a - offset, op: b + 1 - offset, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) } }));
      continue;
    }
    const shared = (uses.get(cel.drawingId) ?? 0) > 1 ? sharedDrawing(ctx, layer, cel, uses.get(cel.drawingId)!) : undefined;
    if (shared) {
      out.push(tag({ ty: 0, refId: shared, w: doc.width + ctx.pad * 2, h: doc.height + ctx.pad * 2, ip: a - offset, op: b + 1 - offset, st: a - offset, sr: 1, ks: { a: stat([ctx.pad, ctx.pad]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) } }));
      continue;
    }
    const frames: number[] = [];
    for (let f = a; f <= b; f++) frames.push(f);
    // A layer on a bone comes back as one posed group: its shapes are moved (or bent) into place per frame.
    const drawings = frames.map((f) => {
      const d = poseAt(doc, layer, f);
      return layer.bind && d?.kind === 'vector' ? { ...d, shapes: flattenBound(d.shapes) } : d;
    });
    const first = drawings[0];
    if (!first || first.kind !== 'vector') continue;
    const s0 = sig(first.shapes);
    if (!drawings.every((d) => d?.kind === 'vector' && sig(d.shapes) === s0)) {
      // The shapes change kind partway (shouldn't happen): every frame on its own.
      frames.forEach((f, k) => out.push(...vectorRuns(ctx, layer, cel, [f], [drawings[k]!.kind === 'vector' ? (drawings[k] as any).shapes : []], offset, true).map(tag)));
      continue;
    }
    out.push(...vectorRuns(ctx, layer, cel, frames, drawings.map((d) => (d as any).shapes as Shape[]), offset, drawings.every((d) => d === first)).map(tag));
  }
  return out;
}

/** Does this key show a plain drawing (paths, fills and brush strokes only) that is the same on every frame of it? */
function plainKey(doc: Doc, layer: Layer, cel: Cel): boolean {
  if (layer.bind || cel.tween || (layer.kind && layer.kind !== 'vector')) return false;
  const d = doc.drawings[cel.drawingId];
  return d?.kind === 'vector' && d.shapes.every((s) => s.type === 'path' || s.type === 'fill' || s.type === 'stroke') && poseAt(doc, layer, cel.start) === d;
}

/** How many keys of the layer (inside the range) show each plain drawing. */
function drawingUses(doc: Doc, layer: Layer, from: number, to: number): Map<string, number> {
  const uses = new Map<string, number>();
  for (const cel of layer.cels) {
    if (cel.start > to || cel.start + cel.length - 1 < from || !plainKey(doc, layer, cel)) continue;
    uses.set(cel.drawingId, (uses.get(cel.drawingId) ?? 0) + 1);
  }
  return uses;
}

/**
 * A drawing that comes back in several keys is written once, as a precomp the keys point at (the shapes are the bulk
 * of the file). Only when that saves bytes: a small drawing costs less than the precomp layer that would replace it.
 */
function sharedDrawing(ctx: Ctx, layer: Layer, cel: Cel, uses: number): string | undefined {
  const mapKey = cel.drawingId + '#' + tintKey(ctx.tints);
  const known = ctx.sharedDrawings.get(mapKey);
  if (known) return known;
  const d = ctx.doc.drawings[cel.drawingId];
  if (d?.kind !== 'vector') return undefined;
  const pieces = vectorRuns(ctx, layer, cel, [cel.start], [d.shapes], cel.start, true);
  if (!pieces.length || pieces.some((l) => l.ty !== 4)) return undefined;
  // Each use costs a precomp layer (about 330 bytes) instead of the shape layer; the precomp itself about 300 more.
  if ((uses - 1) * (JSON.stringify(pieces).length - 330) < 300) return undefined;
  const id = `drawing_${ctx.sharedDrawings.size}`;
  ctx.sharedDrawings.set(mapKey, id);
  for (const l of pieces) {
    l.ip = 0;
    l.op = ctx.doc.length + 1;
  }
  const shift = { ty: 3, ind: 1, nm: 'Offset', ip: 0, op: ctx.doc.length + 1, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([ctx.pad, ctx.pad]), s: stat([100, 100]), r: stat(0), o: stat(100) } };
  ctx.assets.push({ id, nm: 'Drawing', fr: ctx.doc.fps, layers: [...numbered(pieces, 2, 1), shift] });
  return id;
}

/** An opacity property multiplied by `by`. */
function scaleO(o: Json, by: number): Json {
  if (o && o.a === 1) return { a: 1, k: o.k.map((key: Json) => ({ ...key, s: key.s.map((v: number) => r3(v * by)) })) };
  return stat(r3((o?.k ?? 100) * by));
}

/** A key's shapes over its frames: runs of plain shapes become shape layers, symbol copies become precomp layers. */
function vectorRuns(ctx: Ctx, layer: Layer, cel: Cel, frames: number[], rawShapes: Shape[][], offset: number, still: boolean): Json[] {
  const { doc } = ctx;
  const times = frames.map((f) => f - offset);
  const ip = frames[0] - offset;
  const opEnd = frames[frames.length - 1] + 1 - offset;
  const out: Json[] = [];
  const items = expandSprites(ctx, rawShapes);
  const n = items[0].length;
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const groups = run
      .map((k) => shapeGroup(items.map((list) => (list[k].type === 'look' ? (list[k] as LookItem).look : lookOf(list[k] as Exclude<Shape, InstanceShape>, ctx.tints, still))), times, `Shape ${k + 1}`))
      .filter((g): g is Json => !!g)
      .reverse();
    if (groups.length) out.push({ ty: 4, ip, op: opEnd, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) }, shapes: groups });
    run = [];
  };
  // A classic tween's copies are written as eased keys when they can be, so look up what pairs with what.
  const tw = cel.tween;
  const nextCel = tw && (!tw.kind || tw.kind === 'classic') ? layer.cels.find((c) => c.start === cel.start + cel.length) : undefined;
  const fromD = doc.drawings[cel.drawingId];
  const toD = nextCel ? doc.drawings[nextCel.drawingId] : undefined;
  const fromInst = fromD?.kind === 'vector' ? fromD.shapes.filter(isInstance) : [];
  const pairs = toD?.kind === 'vector' ? pairInstances(fromInst, toD.shapes.filter(isInstance)) : [];
  let instIndex = 0;
  const precompLayer = (ref: string, c: { def: { origin: { x: number; y: number } } }, tm: Json, ks: Json, from = ip, until = opEnd): Json => ({
    ty: 0,
    refId: ref,
    w: doc.width + ctx.pad * 2,
    h: doc.height + ctx.pad * 2,
    ip: from,
    op: until,
    st: 0,
    sr: 1,
    tm,
    ks,
  });
  for (let k = 0; k < n; k++) {
    const s0 = items[0][k];
    if (s0.type === 'psym') {
      flush();
      const sps = items.map((list) => list[k] as SymbolSprite);
      const c = symbolContent(doc, s0.symbolId);
      const ref = symbolAsset(ctx, s0.symbolId);
      if (!c || !ref) continue;
      const ts = sps.map((s) => decompose(s.m, c.def.origin));
      const ks: Json = {
        a: stat([r3(c.def.origin.x + ctx.pad), r3(c.def.origin.y + ctx.pad)]),
        p: positionTrack(ts.map((t) => [r3(t.x), r3(t.y)]), times, POS_TOL),
        s: smoothTrack(ts.map((t) => [r3(t.scaleX * 100), r3(t.scaleY * 100)]), times, SCALE_TOL),
        r: smoothTrack(unwrap(ts.map((t) => r3(t.rotation))), times, ANGLE_TOL),
        sk: smoothTrack(ts.map((t) => r3(-t.skew)), times, ANGLE_TOL),
        sa: stat(0),
        o: smoothTrack(sps.map((s) => r3(s.alpha * 100)), times, OPACITY_TOL),
      };
      out.push(precompLayer(ref, c, track(sps.map((s) => r3((s.inner + 0.001) / doc.fps)), times, false), ks));
      continue;
    }
    if (!isInstance(s0 as Shape)) {
      run.push(k);
      continue;
    }
    flush();
    const which = instIndex++;
    const insts = items.map((list) => list[k] as InstanceShape);
    const first = insts[0];
    const c = symbolContent(doc, first.symbolId);
    if (!c) continue;
    const key = fromInst[which];
    const b = pairs[which];
    const eased = nextCel && key && b && tw ? { cel, next: nextCel, a: key, b, tw, offset } : undefined;
    const inner = frames.map((f, i) => symbolFrame(isPosed(insts[i]) ? insts[i] : (insts[i] as PosedInstance), f - cel.start, c.length));
    // A tinted copy shows a recoloured precomp; a tint that changes switches precomps on the frames it changes.
    const tintsAt = insts.map((s) => (s.tint && s.tint.amount > 0 ? [{ color: s.tint.color, amount: s.tint.amount }, ...ctx.tints] : ctx.tints));
    const tm = () => track(inner.map((v) => r3((v + 0.001) / doc.fps)), times, false);
    const runs: [number, number][] = [];
    tintsAt.forEach((t, i) => {
      const last = runs[runs.length - 1];
      if (last && tintKey(tintsAt[last[0]]) === tintKey(t)) last[1] = i + 1;
      else runs.push([i, i + 1]);
    });
    for (const [i0, i1] of runs) {
      const ref = symbolAsset(ctx, first.symbolId, tintsAt[i0]);
      if (!ref) continue;
      out.push(precompLayer(ref, c, tm(), instanceKs(insts, times, c.def.origin, ctx.pad, eased), times[i0], i1 >= times.length ? opEnd : times[i1]));
    }
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- the stage: blend modes, effects, clipping, masks

/** Frameling's blend modes as Lottie's `bm` numbers ('add' has none in lottie-web; screen is the nearest). */
const BM: Record<string, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, 'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9, difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15, add: 2, 'linear-dodge': 2 };

const effectSlider = (nm: string, ix: number, v: Json, mn: string) => ({ ty: 0, nm, mn, ix, v });

/**
 * Soften and Shadow as Lottie's own Gaussian Blur and Drop Shadow, or null when the stack has something Lottie can't
 * do (then the layer is baked). Played by lottie-web's SVG renderer, the Lottie apps and Skottie; lottie-web's canvas
 * renderer ignores effects.
 */
function nativeEffects(effects: LayerEffect[] | undefined, frames: number[], times: number[]): Json[] | null {
  const out: Json[] = [];
  for (const e of effects ?? []) {
    if (e.on === false) continue;
    const vs = frames.map((f) => valuesAt(e, f));
    const num = (k: string) => vs.map((v) => Number(v[k]));
    if (e.kind === 'blur') {
      // lottie-web: sigma = blurriness * 0.3; the canvas's blur(r) is a sigma of r.
      out.push({
        ty: 29,
        nm: 'Gaussian Blur',
        mn: 'ADBE Gaussian Blur 2',
        np: 5,
        ix: out.length + 1,
        en: 1,
        ef: [effectSlider('Blurriness', 1, track(num('radius').map((r) => r3(r / 0.3)), times, true), 'ADBE Gaussian Blur 2-0001'), { ty: 7, nm: 'Blur Dimensions', mn: 'ADBE Gaussian Blur 2-0002', ix: 2, v: stat(1) }, { ty: 7, nm: 'Repeat Edge Pixels', mn: 'ADBE Gaussian Blur 2-0003', ix: 3, v: stat(0) }],
      });
      continue;
    }
    if (e.kind === 'shadow') {
      const c = lottieColor(String(vs[0].color));
      const x = num('x');
      const y = num('y');
      out.push({
        ty: 25,
        nm: 'Drop Shadow',
        mn: 'ADBE Drop Shadow',
        np: 8,
        ix: out.length + 1,
        en: 1,
        ef: [
          { ty: 2, nm: 'Shadow Color', mn: 'ADBE Drop Shadow-0001', ix: 1, v: stat([...c.rgb, 1]) },
          effectSlider('Opacity', 2, track(num('opacity').map((o) => r3(o * c.alpha * 255)), times, true), 'ADBE Drop Shadow-0002'),
          effectSlider('Direction', 3, track(x.map((v, i) => r3((Math.atan2(y[i], v) * 180) / Math.PI + 90)), times, true), 'ADBE Drop Shadow-0003'),
          effectSlider('Distance', 4, track(x.map((v, i) => r3(Math.hypot(v, y[i]))), times, true), 'ADBE Drop Shadow-0004'),
          // lottie-web: sigma = softness / 4; the canvas's drop-shadow blur b is a sigma of b / 2.
          effectSlider('Softness', 5, track(num('softness').map((s) => r3(s * 2)), times, true), 'ADBE Drop Shadow-0005'),
          { ty: 7, nm: 'Shadow Only', mn: 'ADBE Drop Shadow-0006', ix: 6, v: stat(0) },
        ],
      });
      continue;
    }
    if (frames.every((f) => isNoop(e.kind, valuesAt(e, f)))) continue;
    return null;
  }
  return out;
}

interface Range {
  from: number;
  to: number;
  offset: number;
}

/** A precomp holding `content` (bottom first, stage space), as one layer laid over the stage. */
function wrap(ctx: Ctx, content: Json[], name: string, r: Range): Json {
  const id = `comp_${ctx.comps++}`;
  ctx.assets.push({ id, nm: name, fr: ctx.doc.fps, layers: assemble(ctx, content, r, true) });
  return { ty: 0, refId: id, nm: name, w: ctx.doc.width + ctx.pad * 2, h: ctx.doc.height + ctx.pad * 2, ip: 0, op: r.to - r.from + 1, st: 0, sr: 1, ks: { a: stat([ctx.pad, ctx.pad]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) }, frameling: { noCam: true } };
}

/** The most layers in one list that get a fade matte. */
const MAX_FADE_MATTES = 16;

/** How many fills and strokes a layer paints (precomps count what's inside, matte sources excluded). */
function paintCount(ctx: Ctx, l: Json, seen = new Set<string>()): number {
  if (l.ty === 2) return 1;
  if (l.ty === 0) {
    if (seen.has(l.refId)) return 0;
    const asset = ctx.assets.find((a) => a.id === l.refId);
    const inner = new Set(seen).add(l.refId);
    return ((asset?.layers ?? []) as Json[]).reduce((n, x) => n + (x.td ? 0 : paintCount(ctx, x, inner)), 0);
  }
  if (l.ty !== 4) return 0;
  const walk = (items: Json[]): number => items.reduce((n, it) => n + (it.ty === 'gr' ? walk(it.it ?? []) : ['fl', 'st', 'gf', 'gs'].includes(it.ty) ? 1 : 0), 0);
  return walk(l.shapes ?? []);
}

/**
 * Fades a layer as a whole in every player. A layer's opacity is multiplied into each shape it draws by lottie-web's
 * canvas player, so overlaps show through; a track matte is drawn from a picture of the whole layer, so the layer goes
 * in at full strength and a see-through matte the size of the stage carries the fade. Only layers that paint two or
 * more things and have no blend mode, matte or effect of their own are done (the rest look the same either way).
 * Bottom first, like the content it takes.
 */
function fadeAsWhole(ctx: Ctx, content: Json[]): Json[] {
  const out: Json[] = [];
  const size = ctx.pad * 3 + Math.max(ctx.doc.width, ctx.doc.height);
  const wants = (l: Json): boolean => {
    const o = l.ks?.o;
    const fading = o && (o.a === 1 || (typeof o.k === 'number' && o.k < 100));
    return !!fading && !l.tt && !l.td && !l.bm && !l.ef?.length && [0, 2, 4].includes(l.ty) && paintCount(ctx, l) >= 2;
  };
  // Each matte makes a canvas player copy the whole picture twice a frame, so a crowd of small fading things (a
  // particle burst) keeps its per-shape fade: overlaps inside one tiny particle are hardly seen.
  const some = content.filter(wants).length <= MAX_FADE_MATTES;
  for (const l of content) {
    if (!some || !wants(l)) {
      out.push(l);
      continue;
    }
    const o = l.ks.o;
    const matte: Json = {
      ty: 4,
      nm: (l.nm ?? 'Layer') + ' (fade)',
      td: 1,
      ip: l.ip,
      op: l.op,
      st: 0,
      sr: 1,
      ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: JSON.parse(JSON.stringify(o)) },
      shapes: [{ ty: 'gr', nm: 'Stage', it: [{ ty: 'rc', p: stat([ctx.doc.width / 2, ctx.doc.height / 2]), s: stat([size * 2, size * 2]), r: stat(0) }, { ty: 'fl', c: stat([1, 1, 1, 1]), o: stat(100) }, noTr()] }],
      frameling: { noCam: true },
    };
    l.ks.o = stat(100);
    l.tt = 1;
    out.push(l, matte);
  }
  return out;
}

/** Numbers layers and hangs them off the camera (and, in a precomp, the null that moves them into its box). */
function assemble(ctx: Ctx, content: Json[], r: Range, shifted: boolean): Json[] {
  const { doc } = ctx;
  const depthOf = (l: Json) => doc.layers.find((x) => x.id === l.frameling?.layer)?.depth ?? 0;
  const first = shifted ? 2 : 1;
  // Inside a symbol nothing hangs off the camera (the copy's layer on the stage does).
  const cam = ctx.symbolLayers ? { nulls: [] as Json[], parentOf: new Map<number, number>() } : cameraNulls(doc, r.from, r.to, content.filter((l) => !l.frameling?.noCam).map(depthOf), first);
  const shiftInd = shifted ? 1 : undefined;
  if (shifted) for (const nl of cam.nulls) nl.parent = 1;
  const layers = numbered(fadeAsWhole(ctx, content), first + cam.nulls.length, (l) => (l.frameling?.noCam ? shiftInd : cam.parentOf.get(depthOf(l)) ?? shiftInd));
  for (const l of layers) delete l.frameling;
  const all = [...layers, ...cam.nulls];
  if (shifted) all.push({ ty: 3, ind: 1, nm: 'Offset', ip: 0, op: r.to - r.from + 1, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([ctx.pad, ctx.pad]), s: stat([100, 100]), r: stat(0), o: stat(100) } });
  return all;
}

/** Are the pieces shown one at a time (so a look can go on each of them instead of a precomp)? */
function oneAtATime(pieces: Json[]): boolean {
  const spans = pieces.map((p) => [p.ip, p.op]).sort((a, b) => a[0] - b[0]);
  return spans.every((s, i) => i === 0 || s[0] >= spans[i - 1][1]);
}

/** Puts a blend mode, opacity and effects on pieces: straight on them when that's the same, else on a precomp. */
function withLook(ctx: Ctx, pieces: Json[], look: { bm?: number; o?: number; ef?: Json[] }, name: string, r: Range): Json[] {
  const bm = look.bm ?? 0;
  const o = look.o ?? 1;
  const ef = look.ef ?? [];
  if (!pieces.length || (!bm && o >= 1 && !ef.length)) return pieces;
  // Effects on a shape layer act on all of it, so one piece at a time can take everything directly.
  const direct = oneAtATime(pieces) && pieces.every((p) => !p.tt && !p.td);
  const targets = direct ? pieces : [wrap(ctx, pieces, name, r)];
  for (const t of targets) {
    if (bm) t.bm = bm;
    if (o < 1) t.ks.o = scaleO(t.ks.o, o);
    if (ef.length) t.ef = JSON.parse(JSON.stringify(ef));
  }
  return targets;
}

/** What a step looks like when painted (blend, opacity, effects), and whether its effects need baking. */
function lookOfNode(node: PlanNode): { blend?: string; opacity: number; effects?: LayerEffect[] } {
  return node.type === 'layer' ? node.layer : node.folder;
}

/** A layer or folder's content before its own look (bottom first). */
function nodeContent(ctx: Ctx, node: PlanNode, r: Range): Json[] {
  if (node.type === 'layer') return layerPieces(ctx, node.layer, r.from, r.to, r.offset, false);
  return levelContent(ctx, node.steps, r);
}

/** A layer or folder with its effects: native ones as Lottie effects, the rest baked into pictures. */
function nodePicture(ctx: Ctx, node: PlanNode, r: Range): { pieces: Json[]; ef: Json[] } {
  const look = lookOfNode(node);
  const frames: number[] = [];
  for (let f = r.from; f <= r.to; f++) frames.push(f);
  const times = frames.map((f) => f - r.offset);
  const active = (look.effects ?? []).filter((e) => e.on !== false);
  const native = nativeEffects(active, frames, times);
  const chosen = !!native && !!ctx.bakeSoft && active.length > 0;
  if (native && !chosen) return { pieces: nodeContent(ctx, node, r), ef: native };
  const name = node.type === 'layer' ? node.layer.name : node.folder.name;
  const baked = bakeNode(ctx, node, frames, r);
  if (baked) {
    ctx.notes.add(chosen ? `"${name}" became pictures, as chosen, so players without Lottie's blur and shadow show it too.` : `"${name}" became pictures, since Lottie has no ${active.map((e) => effectInfo(e.kind).label.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(' or ')} effect.`);
    return { pieces: baked, ef: [] };
  }
  if (native) return { pieces: nodeContent(ctx, node, r), ef: native };
  ctx.notes.add(`The effects on "${name}" were left out (they need the app to draw them).`);
  return { pieces: nodeContent(ctx, node, r), ef: nativeEffects(active.filter((e) => e.kind === 'blur' || e.kind === 'shadow'), frames, times) ?? [] };
}

/** One draw step: the layer or folder, its clipped layers kept inside it, then its blend mode and opacity. */
function drawStep(ctx: Ctx, node: PlanNode, clips: Layer[], r: Range): Json[] {
  const look = lookOfNode(node);
  if (look.opacity <= 0) return [];
  const bm = BM[look.blend ?? 'normal'] ?? 0;
  if (look.blend === 'add') ctx.notes.add('Add (lighter) blend mode became Screen, its nearest in Lottie.');
  if (look.blend === 'subtract' || look.blend === 'divide') ctx.notes.add('Subtract and Divide blend modes became Normal: Lottie has neither.');
  const name = node.type === 'layer' ? node.layer.name : node.folder.name;
  // A pass-through folder's layers go straight onto the stage.
  if (node.type === 'folder' && !node.isolate && !clips.length) return levelContent(ctx, node.steps, r);
  const pic = nodePicture(ctx, node, r);
  if (!clips.length) return withLook(ctx, pic.pieces, { bm, o: look.opacity, ef: pic.ef }, name, r);
  // Clipped layers: each shows only where the base's picture has something (a matte made from a second copy of it).
  const group: Json[] = withLook(ctx, pic.pieces, { ef: pic.ef }, name, r);
  for (const cl of clips) {
    if (cl.opacity <= 0) continue;
    const clipPic = drawStep(ctx, { type: 'layer', layer: cl }, [], r);
    if (!clipPic.length) continue;
    const clipped = wrap(ctx, clipPic, cl.name, r);
    const again = nodePicture(ctx, node, r);
    const matte = wrap(ctx, withLook(ctx, again.pieces, { ef: again.ef }, name, r), `${name} (clip shape)`, r);
    matte.td = 1;
    clipped.tt = 1;
    group.push(clipped, matte);
  }
  return withLook(ctx, group, { bm, o: look.opacity }, name, r);
}

/** A level (the stage or a folder): its steps bottom first, masks cutting everything under them. */
function levelContent(ctx: Ctx, steps: PlanStep[], r: Range): Json[] {
  let acc: Json[] = [];
  for (const s of steps) {
    if (s.type === 'mask') {
      const hide = s.layer.mask === 'hide';
      const pic = nodePicture(ctx, { type: 'layer', layer: s.layer }, r);
      if (!acc.length) continue;
      if (!pic.pieces.length) {
        // Nothing to show through: everything under a showing mask is cut away.
        if (!hide) acc = [];
        continue;
      }
      const under = wrap(ctx, acc, `Under ${s.layer.name}`, r);
      const matte = wrap(ctx, withLook(ctx, pic.pieces, { ef: pic.ef }, s.layer.name, r), s.layer.name, r);
      matte.td = 1;
      under.tt = hide ? 2 : 1;
      acc = [under, matte];
      continue;
    }
    acc.push(...drawStep(ctx, s.node, s.clips, r));
  }
  return acc;
}

// ---------------------------------------------------------------- baked pictures

/** The ways to store baked pictures. Balanced is the default; Sharp keeps every pixel, Small trades some for size. */
export const PICTURE_LOOKS: Record<PictureLook, BakeSpec> = {
  sharp: { scale: 2, format: 'png', quality: 1 },
  balanced: { scale: 2, format: 'webp', quality: 0.9 },
  small: { scale: 1, format: 'webp', quality: 0.8 },
};

/** Pixels this close (in every channel) count as the same picture, so a slow wobble reuses one image. */
const NEAR = 3;

export const hashPixels = (px: Uint8ClampedArray): number => {
  let h = 2166136261;
  for (let i = 0; i < px.length; i += 1) h = Math.imul(h ^ px[i], 16777619);
  return h >>> 0;
};

export const nearlySame = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > NEAR) return false;
  return true;
};

/** The box of pixels that show (alpha above 2 of 255: a fainter tail of a soft effect isn't worth the bytes), or null when none do. */
export function visibleBox(px: Uint8ClampedArray, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Hands out one image id per different picture: the same pixels (or nearly) anywhere come back as the same id. */
export class PictureBank {
  private exact = new Map<string, string>();
  private recent = new Map<string, { px: Uint8ClampedArray; id: string }[]>();
  constructor(private next: () => string) {}
  /** The id for these pixels, and whether it's new (so the caller stores the picture). */
  idFor(w: number, h: number, px: Uint8ClampedArray): { id: string; fresh: boolean } {
    const key = `${hashPixels(px)}:${w}x${h}`;
    const known = this.exact.get(key);
    if (known) return { id: known, fresh: false };
    const size = `${w}x${h}`;
    const near = this.recent.get(size)?.find((p) => nearlySame(p.px, px));
    if (near) {
      this.exact.set(key, near.id);
      return { id: near.id, fresh: false };
    }
    const id = this.next();
    this.exact.set(key, id);
    this.recent.set(size, [...(this.recent.get(size) ?? []).slice(-11), { px, id }]);
    return { id, fresh: true };
  }
}

/** A picture as a data URL: WebP when asked for and the page can make it (and it's smaller), else PNG. */
function pictureUrl(w: number, h: number, px: Uint8ClampedArray, spec: BakeSpec): string {
  const png = pngDataUrl(w, h, px);
  if (spec.format !== 'webp' || typeof document === 'undefined') return png;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return png;
    g.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
    const webp = c.toDataURL('image/webp', spec.quality);
    return webp.startsWith('data:image/webp') && webp.length < png.length ? webp : png;
  } catch {
    return png;
  }
}

/**
 * A layer or folder drawn by the canvas renderer (with its effects, masks and clipping inside, but without its own
 * blend mode and opacity, which stay on the Lottie layer), a picture per different frame, cropped to what's drawn.
 * Frames that come out the same (or nearly) share one picture, and a picture held across frames is one layer.
 * Null when there's no canvas to draw with.
 */
function bakeNode(ctx: Ctx, node: PlanNode, frames: number[], r: Range): Json[] | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const { doc } = ctx;
  const spec: BakeSpec = { ...PICTURE_LOOKS[ctx.pictures], ...ctx.bake };
  const SCALE = spec.scale;
  const ids = new Set(node.type === 'layer' ? [node.layer.id] : planLayers(node.steps).map((l) => l.id));
  const layers = ctx.symbolLayers ?? doc.layers;
  // The folders around what is baked fade, blend and take effects on their own Lottie layers, so the picture leaves
  // them out. A baked folder keeps its own effects, but not its blend or opacity.
  const folders = doc.folders ? { ...doc.folders } : undefined;
  if (folders) {
    const home = node.type === 'layer' ? layers.find((l) => l.id === node.layer.id)?.folder : node.folder.parent;
    for (const f of folderChain(doc.folders, home)) folders[f.id] = { ...f, visible: true, opacity: 1, blend: undefined, effects: undefined };
    if (node.type === 'folder') folders[node.folder.id] = { ...node.folder, blend: undefined, opacity: 1 };
  }
  const solo: Doc = {
    ...doc,
    layers: layers.map((l) => (node.type === 'layer' && l.id === node.layer.id ? { ...l, blend: undefined, opacity: 1, clipToBelow: false } : l)),
    folders,
  };
  // On the stage the picture is the stage. Inside a symbol it's the box the drawings (and effects) cover, in symbol space.
  const area = ctx.symbolLayers ? symbolArea(solo, ids, frames) : { x: 0, y: 0, w: doc.width, h: doc.height };
  if (!area) return [];
  const W = Math.round(area.w * SCALE);
  const H = Math.round(area.h * SCALE);
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const out: Json[] = [];
  // One bank for the whole file, so a layer baked twice (a clipping base and its copy) stores its pictures once.
  const bank = (ctx.bank ??= new PictureBank(() => {
    const id = `image_${ctx.images.size}`;
    ctx.images.set('bake:' + id, id);
    return id;
  }));
  let prev: { id: string; x: number; y: number; layer: Json } | null = null;
  for (const f of frames) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(SCALE, 0, 0, SCALE, -area.x * SCALE, -area.y * SCALE);
    renderFrame(g, solo, f, { background: false, layerFilter: (l) => ids.has(l.id) });
    const px = g.getImageData(0, 0, W, H).data;
    const box = visibleBox(px, W, H);
    if (!box) {
      prev = null;
      continue;
    }
    const { x0, y0 } = box;
    const w = box.x1 - x0 + 1;
    const h = box.y1 - y0 + 1;
    const crop = g.getImageData(x0, y0, w, h).data;
    // The same picture anywhere on the stage is one image, shown at each place.
    const { id, fresh } = bank.idFor(w, h, crop);
    if (fresh) ctx.assets.push({ id, w, h, u: '', p: pictureUrl(w, h, crop, spec), e: 1 });
    const x = r3(area.x + x0 / SCALE);
    const y = r3(area.y + y0 / SCALE);
    if (prev && prev.id === id && prev.x === x && prev.y === y) {
      prev.layer.op = f + 1 - r.offset;
      continue;
    }
    const layer: Json = { ty: 2, refId: id, nm: 'Baked', ip: f - r.offset, op: f + 1 - r.offset, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([x, y]), s: stat([100 / SCALE, 100 / SCALE]), r: stat(0), o: stat(100) }, frameling: { noCam: true } };
    out.push(layer);
    prev = { id, x, y, layer };
  }
  return out;
}

/** The box some of a symbol's layers cover over these frames, effects included (null when empty). */
function symbolArea(solo: Doc, ids: Set<string>, frames: number[]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let reach = 0;
  for (const l of solo.layers) {
    if (!ids.has(l.id)) continue;
    const around = folderChain(solo.folders, l.folder);
    for (const f of frames) {
      let r = 0;
      for (const e of [...activeEffects(l.effects, f), ...around.flatMap((o) => activeEffects(o.effects, f))]) r += effectReach(e.kind, e.v);
      reach = Math.max(reach, r);
      const d = poseAt(solo, l, f);
      if (!d) continue;
      const b = drawingBox(d, 'pixelSize' in l ? l.pixelSize : 1, solo);
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
    }
  }
  if (!(x1 > x0 && y1 > y0)) return null;
  const x = Math.floor(x0 - reach - 2);
  const y = Math.floor(y0 - reach - 2);
  // Kept under 4096 pixels a side at the bake scale.
  return { x, y, w: Math.min(2048, Math.ceil(x1 + reach + 2 - x)), h: Math.min(2048, Math.ceil(y1 + reach + 2 - y)) };
}

/** The camera as null layers (one per depth), one value per frame. */
function cameraNulls(doc: Doc, from: number, to: number, depths: number[], firstInd: number): { nulls: Json[]; parentOf: Map<number, number> } {
  const cam = activeCamera(doc);
  const nulls: Json[] = [];
  const parentOf = new Map<number, number>();
  if (!cam) return { nulls, parentOf };
  const frames: number[] = [];
  for (let f = from; f <= to; f++) frames.push(f);
  const views = frames.map((f) => cameraViewOn(doc, cam, f) ?? cameraViewAt(doc, f) ?? { x: doc.width / 2, y: doc.height / 2, zoom: 1, rotation: 0 });
  const times = frames.map((f) => f - from);
  const cx = doc.width / 2;
  const cy = doc.height / 2;
  const reach = Math.hypot(doc.width, doc.height) / 2;
  for (const depth of [...new Set(depths)]) {
    const fac = parallaxFactor(depth);
    const ind = firstInd + nulls.length;
    // An anchor off by a little shows that much times the zoom; a zoom or turn off by a little shows more the further out it is.
    const topScale = Math.max(1, ...views.map((v) => depthScale(v, fac)));
    nulls.push({
      ty: 3,
      ind,
      nm: depth ? `Camera (depth ${depth})` : 'Camera',
      ip: 0,
      op: to - from + 1,
      st: 0,
      sr: 1,
      ks: {
        // Eased keys instead of one per frame: x and y (and the two scale axes) share an easing, as a camera move does.
        a: smoothTrack(views.map((v) => { const an = depthAnchor(doc, v, fac); return [r3(an.x), r3(an.y)]; }), times, CAMERA_PX / topScale),
        p: stat([r3(cx), r3(cy)]),
        s: smoothTrack(views.map((v) => r3(depthScale(v, fac) * 100)).map((z) => [z, z]), times, (CAMERA_PX / reach) * 100),
        r: smoothTrack(unwrap(views.map((v) => -v.rotation)), times, (CAMERA_PX / reach) * (180 / Math.PI)),
        o: stat(100),
      },
    });
    parentOf.set(depth, ind);
  }
  return { nulls, parentOf };
}

/** The whole Lottie animation, and plain words about anything that didn't come across exactly. */
export function lottieExport(doc: Doc, opts: LottieOptions = {}): { data: Json; notes: string[] } {
  const from = Math.max(0, opts.range?.start ?? 0);
  const to = Math.min(doc.length - 1, opts.range?.end ?? doc.length - 1);
  const count = to - from + 1;
  const ctx: Ctx = { doc, assets: [], symbolAssets: new Map(), sharedDrawings: new Map(), images: new Map(), pad: Math.max(doc.width, doc.height) * 2, tints: [], notes: new Set(), comps: 0, pictures: opts.pictures ?? 'balanced', bake: opts.bake, bakeSoft: opts.softAndShadow === 'pictures' };
  const include = (l: Layer) => l.visible && !l.reference && l.kind !== 'camera';
  const r: Range = { from, to, offset: from };
  const content = levelContent(ctx, buildPlan(doc, include), r);
  const all: Json[] = assemble(ctx, content, r, false);
  if (doc.background && !opts.transparent) {
    const { rgb } = lottieColor(doc.background);
    const hex = '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    all.push({ ty: 1, ind: Math.max(0, ...all.map((l) => l.ind)) + 1, nm: 'Stage colour', sc: hex, sw: doc.width, sh: doc.height, ip: 0, op: count, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) } });
  }
  for (const a of ctx.assets) for (const l of a.layers ?? []) delete l.frameling;
  const markers: Json[] = [];
  for (const c of doc.clips) {
    const a = Math.max(from, Math.min(c.start, c.end));
    const b = Math.min(to, Math.max(c.start, c.end));
    if (a <= b) markers.push({ tm: a - from, cm: c.name, dr: b - a + 1 });
  }
  for (const m of doc.markers) if (m.frame >= from && m.frame <= to) markers.push({ tm: m.frame - from, cm: m.name, dr: 0 });
  const data = {
    v: '5.7.4',
    nm: doc.name,
    fr: doc.fps,
    ip: 0,
    op: count,
    w: doc.width,
    h: doc.height,
    ddd: 0,
    assets: ctx.assets,
    layers: all,
    markers,
    meta: { g: 'Frameling' },
  };
  return { data, notes: [...ctx.notes] };
}

/** The whole Lottie animation. */
export function docToLottie(doc: Doc, opts: LottieOptions = {}): Json {
  return lottieExport(doc, opts).data;
}

/** The finished file's text. */
export function lottieJson(doc: Doc, opts: LottieOptions = {}): string {
  return JSON.stringify(docToLottie(doc, opts));
}

// celAt is kept for callers that want to look up a frame's key by number.
export { celAt };
