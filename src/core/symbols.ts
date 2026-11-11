/**
 * Symbols and classic tweens, as pure functions on the format (no DOM, no store).
 *
 * - Instance maths: an instance's Transform2D to and from a matrix.
 * - Editing in place: `enterSymbol` / `exitSymbol` swap the open symbol's layers into `doc.layers`, so every tool,
 *   the timeline and the canvas work on it unchanged. `rootDoc` puts everything back where it belongs (for saving,
 *   exporting and drawing the dimmed scene).
 * - Posing: `poseAt` is what a layer shows at a frame once instances know which of their own frames to show and
 *   tweens have moved them. Plain drawings come back as themselves, so the canvas's bitmap cache keeps working.
 */
import type { Cel, Doc, Drawing, EditFrame, Id, InstanceShape, Layer, MotionPath, PathPoint, Shape, SymbolDef, Transform2D, Tween, VectorDrawing } from './format';
import { ease } from './ease';
import { celAt, uid } from './doc';
import { boundDrawing, type PosedMesh } from '../rig/pose';

// ---------------------------------------------------------------- matrices

/** [a, b, c, d, e, f], the canvas setTransform layout. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY_MAT: Mat = [1, 0, 0, 1, 0, 0];

/** Applies `b` first, then `a`. */
export function mul(a: readonly number[], b: readonly number[]): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function invert(m: readonly number[]): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [...IDENTITY_MAT];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function applyMat(m: readonly number[], x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

const RAD = Math.PI / 180;

export function identityTransform(x = 0, y = 0): Transform2D {
  return { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 };
}

/** Instance space (symbol space) to the space the instance sits in. */
export function transformMatrix(t: Transform2D, origin: { x: number; y: number }): Mat {
  const c = Math.cos(t.rotation * RAD);
  const s = Math.sin(t.rotation * RAD);
  const k = Math.tan(t.skew * RAD);
  // R * K * S, K = [[1, k], [0, 1]] (skew along x).
  const a = c * t.scaleX;
  const b = s * t.scaleX;
  const cc = (c * k - s) * t.scaleY;
  const d = (s * k + c) * t.scaleY;
  return [a, b, cc, d, t.x - (a * origin.x + cc * origin.y), t.y - (b * origin.x + d * origin.y)];
}

/** The transform whose matrix is `m` (any affine matrix has one). */
export function decompose(m: readonly number[], origin: { x: number; y: number }): Transform2D {
  const [a, b, c, d] = m;
  const rot = Math.atan2(b, a);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const scaleX = Math.hypot(a, b);
  const scaleY = -sin * c + cos * d;
  const k = scaleY ? (cos * c + sin * d) / scaleY : 0;
  const p = applyMat(m, origin.x, origin.y);
  const tidy = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { x: p.x, y: p.y, scaleX, scaleY, rotation: tidy(rot / RAD), skew: tidy(Math.atan(k) / RAD) };
}

// ---------------------------------------------------------------- finding symbols

export function isInstance(s: Shape): s is InstanceShape {
  return s.type === 'instance';
}

export function hasInstances(d: Drawing | undefined): boolean {
  return !!d && d.kind === 'vector' && d.shapes.some(isInstance);
}

/**
 * A symbol's layers and length as they are right now: while it's open for editing, its live layers are in
 * `doc.layers` (or in the editing frame above, for one opened further out).
 */
export function symbolContent(doc: Doc, id: Id): { def: SymbolDef; layers: Layer[]; length: number } | undefined {
  const def = doc.symbols?.[id];
  if (!def) return undefined;
  const stack = doc.editing ?? [];
  const k = stack.findIndex((f) => f.symbolId === id);
  if (k < 0) return { def, layers: def.layers, length: def.length };
  if (k === stack.length - 1) return { def, layers: doc.layers, length: doc.length };
  return { def, layers: stack[k + 1].layers, length: stack[k + 1].length };
}

/** Every list of layers in the document: the stage's, every symbol's, and whatever editing has set aside. */
export function allLayerLists(doc: Doc): Layer[][] {
  const out: Layer[][] = [doc.layers];
  for (const f of doc.editing ?? []) out.push(f.layers);
  for (const s of Object.values(doc.symbols ?? {})) out.push(s.layers);
  return out;
}

// ---------------------------------------------------------------- editing in place

const rootCache = new WeakMap<Doc, Doc>();

/** The document as saved: the stage's own layers in place and every symbol holding its own. */
export function rootDoc(doc: Doc): Doc {
  if (!doc.editing?.length) return doc;
  let r = rootCache.get(doc);
  if (r) return r;
  let layers = doc.layers;
  let length = doc.length;
  const symbols = { ...doc.symbols };
  for (let k = doc.editing.length - 1; k >= 0; k--) {
    const f = doc.editing[k];
    const def = symbols[f.symbolId];
    if (def) symbols[f.symbolId] = { ...def, layers, length };
    layers = f.layers;
    length = f.length;
  }
  r = { ...doc, layers, length, symbols };
  delete r.editing;
  rootCache.set(doc, r);
  return r;
}

/** Opens a symbol for editing (on a draft). The caller moves the playhead and active layer. */
export function enterSymbol(doc: Doc, symbolId: Id, at: Omit<EditFrame, 'symbolId' | 'layers' | 'length'>): boolean {
  const def = doc.symbols?.[symbolId];
  if (!def || doc.editing?.some((f) => f.symbolId === symbolId)) return false;
  const frame: EditFrame = { symbolId, layers: doc.layers, length: doc.length, ...at };
  (doc.editing ??= []).push(frame);
  doc.layers = def.layers;
  doc.length = def.length;
  def.layers = [];
  return true;
}

/** Closes the innermost open symbol (on a draft) and returns what was set aside, or undefined if none was open. */
export function exitSymbol(doc: Doc): EditFrame | undefined {
  const f = doc.editing?.pop();
  if (!f) return undefined;
  const def = doc.symbols?.[f.symbolId];
  if (def) {
    def.layers = doc.layers;
    def.length = Math.max(1, doc.length);
  }
  doc.layers = f.layers;
  doc.length = f.length;
  if (!doc.editing!.length) delete doc.editing;
  return f;
}

/** Symbol space of the open symbol to stage space (identity when nothing is open). */
export function editingMatrix(doc: Doc): Mat {
  let m: Mat = [...IDENTITY_MAT];
  for (const f of doc.editing ?? []) m = mul(m, f.matrix);
  return m;
}

// ---------------------------------------------------------------- making and managing symbols

/** A name not yet used by another symbol: "Symbol 1", "Symbol 2"... or "<base> copy". */
export function freeSymbolName(doc: Doc, base = 'Symbol'): string {
  const names = new Set(Object.values(doc.symbols ?? {}).map((s) => s.name));
  if (base !== 'Symbol' && !names.has(base)) return base;
  for (let i = 1; ; i++) {
    const n = base === 'Symbol' ? `Symbol ${i}` : `${base} ${i + 1}`;
    if (!names.has(n)) return n;
  }
}

export function newInstance(symbolId: Id, at: { x: number; y: number }): InstanceShape {
  return { id: uid('s'), type: 'instance', symbolId, transform: identityTransform(at.x, at.y), opacity: 1, play: 'loop', firstFrame: 0 };
}

/**
 * Turns shapes of a vector drawing into a new symbol and puts an instance in their place (on a draft). `origin` is
 * the registration point (usually the middle of the shapes). Returns the new symbol and instance ids.
 */
export function makeSymbol(doc: Doc, drawingId: Id, shapeIds: Id[], origin: { x: number; y: number }, name?: string): { symbolId: Id; instanceId: Id } | undefined {
  const d = doc.drawings[drawingId];
  if (!d || d.kind !== 'vector') return undefined;
  const pick = new Set(shapeIds);
  const taken = d.shapes.filter((s) => pick.has(s.id));
  if (!taken.length) return undefined;
  const inner: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: structuredClone(plainShapes(taken)) };
  for (const s of inner.shapes) delete s.group;
  doc.drawings[inner.id] = inner;
  const symbolId = uid('y');
  const layer: Layer = { id: uid('l'), name: 'Layer 1', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: uid('c'), start: 0, length: 1, drawingId: inner.id }] };
  (doc.symbols ??= {})[symbolId] = { id: symbolId, name: name ?? freeSymbolName(doc), layers: [layer], length: 1, origin: { ...origin } };
  const inst = newInstance(symbolId, origin);
  const top = Math.max(...taken.map((s) => d.shapes.indexOf(s)));
  const kept: Shape[] = [];
  d.shapes.forEach((s, i) => {
    if (!pick.has(s.id)) kept.push(s);
    if (i === top) kept.push(inst);
  });
  d.shapes = kept;
  return { symbolId, instanceId: inst.id };
}

function plainShapes(shapes: Shape[]): Shape[] {
  // Drafts can't be structured-cloned; JSON is fine for shapes (plain data).
  return JSON.parse(JSON.stringify(shapes));
}

/** How many instances of each symbol there are, anywhere (stage, symbols, set-aside layers). */
export function symbolUsage(doc: Doc): Map<Id, number> {
  const counts = new Map<Id, number>();
  const seen = new Set<Id>();
  for (const list of allLayerLists(doc))
    for (const l of list)
      for (const c of l.cels) {
        if (seen.has(c.drawingId)) continue;
        seen.add(c.drawingId);
        const d = doc.drawings[c.drawingId];
        if (d?.kind !== 'vector') continue;
        for (const s of d.shapes) if (isInstance(s)) counts.set(s.symbolId, (counts.get(s.symbolId) ?? 0) + 1);
      }
  return counts;
}

/** Symbols nested inside `id` (any depth), to refuse a symbol inside itself. */
export function symbolsInside(doc: Doc, id: Id, out = new Set<Id>()): Set<Id> {
  const c = symbolContent(doc, id);
  if (!c) return out;
  for (const l of c.layers)
    for (const cel of l.cels) {
      const d = doc.drawings[cel.drawingId];
      if (d?.kind !== 'vector') continue;
      for (const s of d.shapes)
        if (isInstance(s) && !out.has(s.symbolId)) {
          out.add(s.symbolId);
          symbolsInside(doc, s.symbolId, out);
        }
    }
  return out;
}

/** Copies a symbol and its drawings under new ids (on a draft). */
export function duplicateSymbol(doc: Doc, id: Id): Id | undefined {
  const c = symbolContent(doc, id);
  if (!c) return undefined;
  const copyId = uid('y');
  const layers: Layer[] = JSON.parse(JSON.stringify(c.layers));
  const map = new Map<Id, Id>();
  for (const l of layers) {
    l.id = uid('l');
    for (const cel of l.cels) {
      cel.id = uid('c');
      let nd = map.get(cel.drawingId);
      if (!nd) {
        const src = doc.drawings[cel.drawingId];
        if (!src) continue;
        nd = src.kind === 'pixel' ? uid('p') : uid('v');
        doc.drawings[nd] = src.kind === 'pixel' ? { ...src, id: nd, pixels: new Uint8ClampedArray(src.pixels) } : { ...(JSON.parse(JSON.stringify(src)) as VectorDrawing), id: nd };
        map.set(cel.drawingId, nd);
      }
      cel.drawingId = nd;
    }
  }
  doc.symbols![copyId] = { id: copyId, name: freeSymbolName(doc, `${c.def.name} copy`), layers, length: c.length, origin: { ...c.def.origin } };
  return copyId;
}

/** Deletes symbols nothing uses (on a draft). Returns how many went. Open symbols are kept. */
export function deleteUnusedSymbols(doc: Doc, only?: Id): number {
  let n = 0;
  // Removing one can leave another unused (it was only inside the first), so go round until nothing changes.
  for (;;) {
    const used = symbolUsage(doc);
    const open = new Set((doc.editing ?? []).map((f) => f.symbolId));
    const gone = Object.keys(doc.symbols ?? {}).filter((id) => !used.get(id) && !open.has(id) && (!only || id === only));
    if (!gone.length) break;
    for (const id of gone) delete doc.symbols![id];
    n += gone.length;
    if (only) break;
  }
  return n;
}

// ---------------------------------------------------------------- tweens

/** The key after `cel` on its layer, if it starts right where `cel` ends (only then do in-betweens run). */
export function nextKey(layer: Layer, cel: Cel): Cel | undefined {
  const i = layer.cels.indexOf(cel);
  const n = i >= 0 ? layer.cels[i + 1] : layer.cels.find((c) => c.start === cel.start + cel.length);
  return n && n.start === cel.start + cel.length ? n : undefined;
}

/** The instances of `to` that pair with those of `from`: same symbol in the same order, else just the same order. */
export function pairInstances(from: InstanceShape[], to: InstanceShape[]): (InstanceShape | undefined)[] {
  const used = new Set<InstanceShape>();
  return from.map((a, i) => {
    const sameSym = from.slice(0, i).filter((x) => x.symbolId === a.symbolId).length;
    const cand = to.filter((x) => x.symbolId === a.symbolId)[sameSym];
    const pick = cand && !used.has(cand) ? cand : to[i] && !used.has(to[i]) ? to[i] : undefined;
    if (pick) used.add(pick);
    return pick;
  });
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(v, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixColor(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return '#' + x.map((v, i) => Math.round(lerp(v, y[i], Math.max(0, Math.min(1, t)))).toString(16).padStart(2, '0')).join('');
}

// Motion paths are flattened once into a polyline with running lengths.
interface PathTable {
  pts: { x: number; y: number }[];
  acc: number[];
  total: number;
}
const pathTables = new WeakMap<MotionPath, PathTable>();

function flattenPath(points: PathPoint[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (!points.length) return out;
  out.push({ x: points[0].x, y: points[0].y });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const q = points[i];
    if (q.c1 && q.c2) {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * q.c1.x + 3 * u * t * t * q.c2.x + t * t * t * q.x,
          y: u * u * u * a.y + 3 * u * u * t * q.c1.y + 3 * u * t * t * q.c2.y + t * t * t * q.y,
        });
      }
    } else out.push({ x: q.x, y: q.y });
  }
  return out;
}

function pathTable(p: MotionPath): PathTable {
  let t = pathTables.get(p);
  if (!t) {
    const pts = flattenPath(p.points);
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    t = { pts, acc, total: acc[acc.length - 1] ?? 0 };
    pathTables.set(p, t);
  }
  return t;
}

/** Position and heading (degrees) at `t` (0..1, by distance along the line; past the ends it keeps going straight). */
export function pointOnPath(p: MotionPath, t: number): { x: number; y: number; angle: number } {
  const tab = pathTable(p);
  const { pts, acc, total } = tab;
  if (pts.length < 2 || !total) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, angle: 0 };
  const s = t * total;
  let i = 1;
  if (s >= total) i = pts.length - 1;
  else while (i < pts.length - 1 && acc[i] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = acc[i] - acc[i - 1] || 1;
  const u = (s - acc[i - 1]) / seg;
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), angle: Math.atan2(b.y - a.y, b.x - a.x) / RAD };
}

/** Where an instance is, `t` (eased) of the way from key `a` to key `b`. */
export function tweenInstance(a: InstanceShape, b: InstanceShape | undefined, tw: Tween, t: number): InstanceShape {
  if (!b) return a;
  const ta = a.transform;
  const tb = b.transform;
  const out: Transform2D = {
    x: lerp(ta.x, tb.x, t),
    y: lerp(ta.y, tb.y, t),
    scaleX: lerp(ta.scaleX, tb.scaleX, t),
    scaleY: lerp(ta.scaleY, tb.scaleY, t),
    rotation: lerp(ta.rotation, tb.rotation, t) + (tw.spin ?? 0) * 360 * t,
    skew: lerp(ta.skew, tb.skew, t),
  };
  if (tw.path && tw.path.points.length > 1) {
    // Follow the line's shape, bending it so it still starts and ends exactly on the two keys.
    const p0 = pointOnPath(tw.path, 0);
    const p1 = pointOnPath(tw.path, 1);
    const pt = pointOnPath(tw.path, t);
    out.x = pt.x + lerp(ta.x - p0.x, tb.x - p1.x, t);
    out.y = pt.y + lerp(ta.y - p0.y, tb.y - p1.y, t);
    if (tw.path.orient) out.rotation += pt.angle - p0.angle;
  }
  let tint = a.tint;
  if (a.tint || b.tint) {
    const ca = a.tint?.color ?? b.tint!.color;
    const cb = b.tint?.color ?? a.tint!.color;
    tint = { color: mixColor(ca, cb, t), amount: lerp(a.tint?.amount ?? 0, b.tint?.amount ?? 0, t) };
  }
  return { ...a, transform: out, opacity: Math.max(0, Math.min(1, lerp(a.opacity, b.opacity, t))), tint };
}

/** Eased progress of a tweened key at `frame`, or undefined when no in-betweens run there. */
export function tweenProgress(layer: Layer, cel: Cel, frame: number): { t: number; next: Cel } | undefined {
  if (!cel.tween) return undefined;
  const next = nextKey(layer, cel);
  if (!next) return undefined;
  const raw = (frame - cel.start) / cel.length;
  return { t: ease(cel.tween.ease, raw), next };
}

// ---------------------------------------------------------------- posing

/** One layer of a posed instance: the drawing to draw and how. */
export interface PosedLayer {
  drawing: Drawing;
  opacity: number;
  pixelSize: number;
  /** Bent through a bone mesh (attached layers only). */
  mesh?: PosedMesh;
}

/** An instance ready to draw: its matrix and the drawings its symbol shows at the frame in question. Runtime only. */
export interface PosedInstance extends InstanceShape {
  posed: { matrix: Mat; layers: PosedLayer[] };
}

export function isPosed(s: Shape): s is PosedInstance {
  return s.type === 'instance' && 'posed' in s;
}

/** Which of its own frames an instance shows, `local` frames after its key began. */
export function symbolFrame(inst: InstanceShape, local: number, length: number): number {
  const n = Math.max(1, length);
  const first = Math.max(0, Math.min(n - 1, Math.round(inst.firstFrame) || 0));
  if (inst.play === 'single') return first;
  if (inst.play === 'once') return Math.min(n - 1, first + Math.max(0, local));
  return (((first + local) % n) + n) % n;
}

const MAX_DEPTH = 12;

// Poses are cached per world (the drawings, the symbols and, while editing, the open layers), then per cel and a
// key naming everything that changes the picture. The same frame twice gives the same object, which is what the
// canvas's bitmap cache keys on.
interface World {
  drawings: Doc['drawings'];
  symbols: Doc['symbols'];
  live: Layer[] | null;
  cels: WeakMap<Cel, Map<string, Drawing>>;
}
let lastWorld: World | null = null;
const worlds = new WeakMap<object, World[]>();

function worldOf(doc: Doc): World {
  const live = doc.editing?.length ? doc.layers : null;
  const w = lastWorld;
  if (w && w.drawings === doc.drawings && w.symbols === doc.symbols && w.live === live) return w;
  const list = worlds.get(doc.drawings) ?? [];
  let hit = list.find((x) => x.symbols === doc.symbols && x.live === live);
  if (!hit) {
    hit = { drawings: doc.drawings, symbols: doc.symbols, live, cels: new WeakMap() };
    list.push(hit);
    if (list.length > 4) list.shift();
    worlds.set(doc.drawings, list);
  }
  lastWorld = hit;
  return hit;
}

/** How many poses were built, for tests. */
export const poseStats = { built: 0 };

/**
 * What a layer shows at `frame`: its drawing, with instances posed and moved by its bone if it's attached to one.
 * Plain drawings come back unchanged.
 */
export function poseAt(doc: Doc, layer: Layer, frame: number, depth = 0): Drawing | undefined {
  const d = poseCel(doc, layer, frame, depth);
  return d && layer.bind ? boundDrawing(doc, layer, frame, d) : d;
}

function poseCel(doc: Doc, layer: Layer, frame: number, depth: number): Drawing | undefined {
  const cel = celAt(layer, frame);
  if (!cel) return undefined;
  const d = doc.drawings[cel.drawingId];
  if (!d || d.kind !== 'vector' || !hasInstances(d)) return d;
  if (depth > MAX_DEPTH) return undefined;

  const local = frame - cel.start;
  const tp = tweenProgress(layer, cel, frame);
  const to = tp ? doc.drawings[tp.next.drawingId] : undefined;
  const toInst = to?.kind === 'vector' ? to.shapes.filter(isInstance) : [];
  const fromInst = d.shapes.filter(isInstance);
  const pairs = tp ? pairInstances(fromInst, toInst) : [];

  // Each instance's own frame, plus the tween position, names this picture.
  const frames: number[] = [];
  for (const s of fromInst) {
    const c = symbolContent(doc, s.symbolId);
    frames.push(c ? symbolFrame(s, local, c.length) : -1);
  }
  const key = (tp ? `${tp.t.toFixed(5)}|${tp.next.id}|${tp.next.drawingId}|` : '-|') + frames.join(',');
  const world = worldOf(doc);
  let byKey = world.cels.get(cel);
  if (!byKey) world.cels.set(cel, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;

  let n = 0;
  const shapes: Shape[] = d.shapes.map((s) => {
    if (!isInstance(s)) return s;
    const i = n++;
    const at = tp ? tweenInstance(s, pairs[i], cel.tween!, tp.t) : s;
    return poseInstance(doc, at, frames[i], depth);
  });
  const out: VectorDrawing = { id: `${d.id}@${key}`, kind: 'vector', shapes };
  poseStats.built++;
  byKey.set(key, out);
  // Keep a scrub through a long tween from growing this without end.
  if (byKey.size > 600) byKey.delete(byKey.keys().next().value!);
  return out;
}

/** An instance with its symbol's drawings at symbol frame `inner`. */
export function poseInstance(doc: Doc, s: InstanceShape, inner: number, depth = 0): PosedInstance {
  const c = symbolContent(doc, s.symbolId);
  if (!c || inner < 0) return { ...s, posed: { matrix: [...IDENTITY_MAT], layers: [] } };
  const layers: PosedLayer[] = [];
  for (const l of c.layers) {
    if (!l.visible) continue;
    const dr = poseAt(doc, l, inner, depth + 1);
    if (dr) layers.push({ drawing: dr, opacity: l.opacity, pixelSize: 'pixelSize' in l ? l.pixelSize : 1 });
  }
  return { ...s, posed: { matrix: transformMatrix(s.transform, c.def.origin), layers } };
}

/** Where an instance on a layer actually is at `frame` (tweens applied), for overlays and the properties panel. */
export function instanceAt(doc: Doc, layer: Layer, frame: number, id: Id): InstanceShape | undefined {
  const cel = celAt(layer, frame);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!cel || d?.kind !== 'vector') return undefined;
  const from = d.shapes.filter(isInstance);
  const i = from.findIndex((s) => s.id === id);
  if (i < 0) return undefined;
  const tp = tweenProgress(layer, cel, frame);
  if (!tp) return from[i];
  const to = doc.drawings[tp.next.drawingId];
  const pairs = pairInstances(from, to?.kind === 'vector' ? to.shapes.filter(isInstance) : []);
  return tweenInstance(from[i], pairs[i], cel.tween!, tp.t);
}

/** A drawing being changed right now (a stroke in progress), with its instances posed like the stored one's. */
export function poseLive(doc: Doc, layer: Layer, frame: number, live: Drawing): Drawing {
  const d = poseLiveCel(doc, layer, frame, live);
  return layer.bind ? boundDrawing(doc, layer, frame, d) : d;
}

function poseLiveCel(doc: Doc, layer: Layer, frame: number, live: Drawing): Drawing {
  if (live.kind !== 'vector' || !hasInstances(live)) return live;
  const posed = poseCel(doc, layer, frame, 0);
  const byId = new Map<Id, Shape>();
  if (posed?.kind === 'vector') for (const s of posed.shapes) if (isPosed(s)) byId.set(s.id, s);
  return { ...live, shapes: live.shapes.map((s) => (isInstance(s) ? (byId.get(s.id) ?? poseInstance(doc, s, 0)) : s)) };
}

/** The document and playhead of the main stage, even while a symbol is open (for exports and thumbnails). */
export function sceneOf(doc: Doc, frame: number): { doc: Doc; frame: number } {
  return doc.editing?.length ? { doc: rootDoc(doc), frame: doc.editing[0].frame } : { doc, frame };
}
