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
 *   motion paths are baked, one key per frame.
 * - Shape tweens become path keyframes, one per frame (the outlines are matched once, so every frame has the same
 *   points and the keys blend smoothly between frames).
 * - Pixel and tile layers become PNG image assets, scaled up to stage size with hard edges so they stay crisp.
 * - The camera is a null layer per depth that every stage layer hangs from (one key per frame when it moves).
 * - Clips become named markers (lottie-web's playSegments takes their names), markers become markers.
 *
 * Not carried: colour wash (tint) on symbol copies, and layer fades blend shape by shape rather than as one flat layer.
 */
import type { Cel, Doc, Easing, InstanceShape, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath, Tween } from '../core/format';
import { celAt } from '../core/doc';
import { isInstance, isPosed, pairInstances, poseAt, symbolContent, symbolFrame, tweenInstance, type PosedInstance } from '../core/symbols';
import { strokeOutline } from '../core/render';
import { cameraViewAt, cameraViewOn, activeCamera, parallaxFactor } from '../core/camera';
import { encodePng } from '../io/png';
import { flattenTilemap } from '../tiles/model';
import type { PosedMesh } from '../rig/pose';

export interface LottieOptions {
  /** Frames to include (inclusive, document frame numbers). Default: the whole animation. */
  range?: { start: number; end: number };
  /** Leave the stage colour out. */
  transparent?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const r3 = (v: number) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};

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
    v.push([r3(p.x), r3(p.y)]);
    // In: the second control of the curve arriving here. Out: the first control of the curve leaving.
    const arrive = k > 0 || sp.closed ? p : undefined;
    ii.push(arrive?.c2 && arrive.c1 ? [r3(arrive.c2.x - p.x), r3(arrive.c2.y - p.y)] : [0, 0]);
    const next = k + 1 < n ? pts[k + 1] : sp.closed ? pts[0] : undefined;
    oo.push(next?.c1 && next.c2 ? [r3(next.c1.x - p.x), r3(next.c1.y - p.y)] : [0, 0]);
  }
  return { c: sp.closed, v, i: ii, o: oo };
}

/** A brush stroke's outline, smoothed like the canvas does it (quadratic curves through the midpoints). */
export function strokeOutlinePath(s: StrokeShape): Json | null {
  const p = strokeOutline(s);
  const n = p.length;
  if (n < 2) return null;
  if (n < 4) return { c: true, v: p.map(([x, y]) => [r3(x), r3(y)]), i: p.map(() => [0, 0]), o: p.map(() => [0, 0]) };
  const v: number[][] = [];
  const ii: number[][] = [];
  const oo: number[][] = [];
  // Vertices sit on the midpoints; the curve from midpoint k-1 to midpoint k bends towards point k.
  for (let k = 0; k < n; k++) {
    const a = p[k];
    const b = p[(k + 1) % n];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    v.push([r3(m[0]), r3(m[1])]);
    ii.push([r3((2 / 3) * (a[0] - m[0])), r3((2 / 3) * (a[1] - m[1]))]);
    oo.push([r3((2 / 3) * (b[0] - m[0])), r3((2 / 3) * (b[1] - m[1]))]);
  }
  return { c: true, v, i: ii, o: oo };
}

const LC = { butt: 1, round: 2, square: 3 } as const;
const LJ = { miter: 1, round: 2, bevel: 3 } as const;

/** The parts of a plain shape that can change from frame to frame. */
interface ShapeLook {
  paths: Json[];
  fill: { rgb: number[]; o: number } | null;
  stroke: { rgb: number[]; o: number; w: number; lc: number; lj: number } | null;
}

function lookOf(s: Exclude<Shape, InstanceShape>): ShapeLook {
  // Text and particles aren't in Lottie files yet (see docs/effects.md): they come out empty.
  if (s.type === 'text' || s.type === 'particles') return { paths: [], fill: null, stroke: null };
  if (s.type === 'stroke') {
    const c = lottieColor(s.color);
    const p = strokeOutlinePath(s);
    return { paths: p ? [p] : [], fill: { rgb: c.rgb, o: r3(c.alpha * s.opacity * 100) }, stroke: null };
  }
  const paths = s.paths.filter((sp) => sp.points.length).map(lottiePath);
  if (s.type === 'fill') {
    const c = lottieColor(s.color);
    return { paths, fill: { rgb: c.rgb, o: r3(c.alpha * s.opacity * 100) }, stroke: null };
  }
  const f = s.fill ? lottieColor(s.fill) : null;
  const st = (s as PathShape).stroke;
  const sc = st ? lottieColor(st.color) : null;
  return {
    paths,
    fill: f ? { rgb: f.rgb, o: r3(f.alpha * s.opacity * 100) } : null,
    stroke: st && sc ? { rgb: sc.rgb, o: r3(sc.alpha * s.opacity * 100), w: r3(st.width), lc: LC[st.cap], lj: LJ[st.join] } : null,
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

// A fresh one each time: lottie-web writes into the data it's given, so shared objects break it.
const noTr = () => ({ ty: 'tr', p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100), sk: stat(0), sa: stat(0) });

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

/** A group for one shape over a run of frames. */
function shapeGroup(looks: ShapeLook[], times: number[], name: string): Json {
  const it: Json[] = [];
  const nPaths = looks[0].paths.length;
  const pathsMatch = looks.every((l) => l.paths.length === nPaths);
  for (let k = 0; k < nPaths; k++) {
    // Blend between frames only when every frame has the same number of points. Players also need every key of a
    // path to have the same number of points, so shorter ones get extra points that change nothing.
    const vals = looks.map((l) => (pathsMatch ? l.paths[k] : l.paths[k] ?? { c: true, v: [], i: [], o: [] }));
    const blend = vals.every((v) => v.v.length === vals[0].v.length);
    const most = Math.max(...vals.map((v) => v.v.length));
    if (!blend) for (let j = 0; j < vals.length; j++) vals[j] = padPath(vals[j], most);
    it.push({ ty: 'sh', nm: `Path ${k + 1}`, ks: track(vals, times, blend, (v) => v) });
  }
  // Fill and line are kept on every frame where any frame has them (see-through where missing), so the structure
  // is the same throughout.
  const anyStroke = looks.some((l) => l.stroke);
  if (anyStroke) {
    const st = looks.find((l) => l.stroke)!.stroke!;
    it.push({
      ty: 'st',
      nm: 'Line',
      c: track(looks.map((l) => [...(l.stroke ?? st).rgb, 1]), times, true),
      o: track(looks.map((l) => (l.stroke ? l.stroke.o : 0)), times, true),
      w: track(looks.map((l) => (l.stroke ? l.stroke.w : 0)), times, true),
      lc: st.lc,
      lj: st.lj,
      ml: 10,
    });
  }
  if (looks.some((l) => l.fill)) {
    const f = looks.find((l) => l.fill)!.fill!;
    it.push({ ty: 'fl', nm: 'Fill', c: track(looks.map((l) => [...(l.fill ?? f).rgb, 1]), times, true), o: track(looks.map((l) => (l.fill ? l.fill.o : 0)), times, true), r: 2 });
  }
  it.push(noTr());
  return { ty: 'gr', nm: name, it };
}

// ---------------------------------------------------------------- building

interface Ctx {
  doc: Doc;
  assets: Json[];
  symbolAssets: Map<string, string>;
  images: Map<string, string>;
  /** How far symbol content may sit outside the stage before a copy clips it. */
  pad: number;
}

/** Instance transform to Lottie's (anchor at the registration point; Lottie's skew turns the other way). */
function instanceKs(insts: InstanceShape[], times: number[], origin: { x: number; y: number }, pad: number, tween?: { cel: Cel; next: Cel; a: InstanceShape; b: InstanceShape; tw: Tween; offset: number }): Json {
  const ks: Json = { a: stat([r3(origin.x + pad), r3(origin.y + pad)]) };
  const exact = tween && !tween.tw.path ? exactEase(tween.tw.ease) : null;
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
  ks.p = track(insts.map((s) => [r3(s.transform.x), r3(s.transform.y)]), times, true);
  ks.s = track(insts.map((s) => [r3(s.transform.scaleX * 100), r3(s.transform.scaleY * 100)]), times, true);
  ks.r = track(insts.map((s) => r3(s.transform.rotation)), times, true);
  ks.sk = track(insts.map((s) => r3(-s.transform.skew)), times, true);
  ks.sa = stat(0);
  ks.o = track(insts.map((s) => r3(s.opacity * 100)), times, true);
  return ks;
}

/** The precomp asset for a symbol, made once. */
function symbolAsset(ctx: Ctx, symbolId: string): string | undefined {
  const known = ctx.symbolAssets.get(symbolId);
  if (known) return known;
  const c = symbolContent(ctx.doc, symbolId);
  if (!c) return undefined;
  const id = `symbol_${ctx.symbolAssets.size}`;
  ctx.symbolAssets.set(symbolId, id);
  const asset: Json = { id, nm: c.def.name, fr: ctx.doc.fps, layers: [] };
  ctx.assets.push(asset);
  const layers = buildLayers(ctx, c.layers, 0, c.length - 1, 0);
  // Everything inside hangs off one null that moves it into the precomp's padded box (precomps clip to their box).
  const shift = { ty: 3, ind: 1, nm: 'Offset', ip: 0, op: c.length, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([ctx.pad, ctx.pad]), s: stat([100, 100]), r: stat(0), o: stat(100) } };
  asset.layers = [...numbered(layers, 2, 1), shift];
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

function imageAsset(ctx: Ctx, key: string, d: PixelDrawing, pixelSize: number): string {
  const known = ctx.images.get(key);
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
  const png = encodePng({ width: w, height: h, pixels: big });
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  const id = `image_${ctx.images.size}`;
  ctx.images.set(key, id);
  ctx.assets.push({ id, w, h, u: '', p: 'data:image/png;base64,' + btoa(bin), e: 1 });
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
 * `frame - offset`.
 */
function buildLayers(ctx: Ctx, layers: Layer[], from: number, to: number, offset: number): Json[] {
  const out: Json[] = [];
  const { doc } = ctx;
  for (const layer of layers) {
    // Mask layers are never shown; effects, blend modes, clipping and masks aren't carried (see docs/effects.md).
    if (!layer.visible || layer.reference || layer.kind === 'camera' || layer.mask || (layer.folder && doc.folders?.[layer.folder]?.visible === false)) continue;
    const op = layer.opacity;
    for (const cel of layer.cels) {
      const a = Math.max(from, cel.start);
      const b = Math.min(to, cel.start + cel.length - 1);
      if (a > b) continue;
      const tag = (l: Json) => {
        l.nm = layer.name + (layer.cels.length > 1 ? ` (frame ${cel.start + 1})` : '');
        l.frameling = { layer: layer.id };
        if (op < 1) l.ks.o = l.ks.o && l.ks.o.a === 1 ? scaleOpacity(l.ks.o, op) : stat(r3((l.ks.o?.k ?? 100) * op));
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
        frames.forEach((f, k) => out.push(...vectorRuns(ctx, layer, cel, [f], [drawings[k]!.kind === 'vector' ? (drawings[k] as any).shapes : []], offset).map(tag)));
        continue;
      }
      out.push(...vectorRuns(ctx, layer, cel, frames, drawings.map((d) => (d as any).shapes as Shape[]), offset).map(tag));
    }
  }
  return out;
}

function scaleOpacity(o: Json, by: number): Json {
  return { a: 1, k: o.k.map((key: Json) => ({ ...key, s: key.s.map((v: number) => r3(v * by)) })) };
}

/** A key's shapes over its frames: runs of plain shapes become shape layers, symbol copies become precomp layers. */
function vectorRuns(ctx: Ctx, layer: Layer, cel: Cel, frames: number[], shapes: Shape[][], offset: number): Json[] {
  const { doc } = ctx;
  const times = frames.map((f) => f - offset);
  const ip = frames[0] - offset;
  const opEnd = frames[frames.length - 1] + 1 - offset;
  const out: Json[] = [];
  const n = shapes[0].length;
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const groups = run
      .map((k) => shapeGroup(shapes.map((list) => lookOf(list[k] as Exclude<Shape, InstanceShape>)), times, `Shape ${k + 1}`))
      .filter((g) => g.it.length > 1)
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
  for (let k = 0; k < n; k++) {
    const s0 = shapes[0][k];
    if (!isInstance(s0)) {
      run.push(k);
      continue;
    }
    flush();
    const which = instIndex++;
    const insts = shapes.map((list) => list[k] as InstanceShape);
    const c = symbolContent(doc, s0.symbolId);
    const ref = symbolAsset(ctx, s0.symbolId);
    if (!c || !ref) continue;
    const key = fromInst[which];
    const b = pairs[which];
    const eased = nextCel && key && b && tw ? { cel, next: nextCel, a: key, b, tw, offset } : undefined;
    const inner = frames.map((f, i) => symbolFrame(isPosed(insts[i]) ? insts[i] : (insts[i] as PosedInstance), f - cel.start, c.length));
    out.push({
      ty: 0,
      refId: ref,
      w: doc.width + ctx.pad * 2,
      h: doc.height + ctx.pad * 2,
      ip,
      op: opEnd,
      st: 0,
      sr: 1,
      // A tiny nudge past each frame's start, so rounding never shows the frame before.
      tm: track(inner.map((v) => r3((v + 0.001) / doc.fps)), times, false),
      ks: instanceKs(insts, times, c.def.origin, ctx.pad, eased),
    });
  }
  flush();
  return out;
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
  for (const depth of [...new Set(depths)]) {
    const fac = parallaxFactor(depth);
    const ind = firstInd + nulls.length;
    nulls.push({
      ty: 3,
      ind,
      nm: depth ? `Camera (depth ${depth})` : 'Camera',
      ip: 0,
      op: to - from + 1,
      st: 0,
      sr: 1,
      ks: {
        a: track(views.map((v) => [r3(cx + (v.x - cx) * fac), r3(cy + (v.y - cy) * fac)]), times, true),
        p: stat([r3(cx), r3(cy)]),
        s: track(views.map((v) => r3(Math.pow(v.zoom, fac) * 100)).map((z) => [z, z]), times, true),
        r: track(views.map((v) => r3(-v.rotation)), times, true),
        o: stat(100),
      },
    });
    parentOf.set(depth, ind);
  }
  return { nulls, parentOf };
}

/** The whole Lottie animation. */
export function docToLottie(doc: Doc, opts: LottieOptions = {}): Json {
  const from = Math.max(0, opts.range?.start ?? 0);
  const to = Math.min(doc.length - 1, opts.range?.end ?? doc.length - 1);
  const count = to - from + 1;
  const ctx: Ctx = { doc, assets: [], symbolAssets: new Map(), images: new Map(), pad: Math.max(doc.width, doc.height) * 2 };
  const content = buildLayers(ctx, doc.layers, from, to, from);
  const depthOf = new Map(doc.layers.map((l) => [l.id, l.depth ?? 0]));
  const cam = cameraNulls(
    doc,
    from,
    to,
    content.map((l) => depthOf.get(l.frameling?.layer) ?? 0),
    1,
  );
  const layers = numbered(content, cam.nulls.length + 1, (l) => cam.parentOf.get(depthOf.get(l.frameling?.layer) ?? 0));
  for (const l of layers) delete l.frameling;
  for (const a of ctx.assets) for (const l of a.layers ?? []) delete l.frameling;
  const all: Json[] = [...layers, ...cam.nulls];
  if (doc.background && !opts.transparent) {
    const { rgb } = lottieColor(doc.background);
    const hex = '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    all.push({ ty: 1, ind: all.length + 1, nm: 'Stage colour', sc: hex, sw: doc.width, sh: doc.height, ip: 0, op: count, st: 0, sr: 1, ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) } });
  }
  const markers: Json[] = [];
  for (const c of doc.clips) {
    const a = Math.max(from, Math.min(c.start, c.end));
    const b = Math.min(to, Math.max(c.start, c.end));
    if (a <= b) markers.push({ tm: a - from, cm: c.name, dr: b - a + 1 });
  }
  for (const m of doc.markers) if (m.frame >= from && m.frame <= to) markers.push({ tm: m.frame - from, cm: m.name, dr: 0 });
  return {
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
}

/** The finished file's text. */
export function lottieJson(doc: Doc, opts: LottieOptions = {}): string {
  return JSON.stringify(docToLottie(doc, opts));
}

// celAt is kept for callers that want to look up a frame's key by number.
export { celAt };
