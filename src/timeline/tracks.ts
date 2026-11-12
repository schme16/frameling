/**
 * Property tracks for the detailed timeline: what changes on a layer over time, one row per thing (position, zoom,
 * a bone, an effect), with a diamond wherever that thing has a key. Pure, worked out from the document, never stored.
 *
 * Three kinds of key live here. A drawing key (`c:`) is a cel: moving one moves that drawing, so every property row it
 * shows on moves with it (and so does a morph row key: the shape is the drawing). An effect key (`e:`) is one of an
 * effect's own keys, independent of the drawings. A property key (`p:`) is one value on a drawing key: a symbol's
 * position, size, turn, slant, see-through or tint, one bone's pose, or the camera's place, zoom or turn. Moving it
 * moves only that row (see propKeys.ts).
 */
import type { Cel, CameraView, Doc, Easing, Id, InstanceShape, Layer, LayerEffect, VectorDrawing } from '../core/format';
import { tweenEase } from '../core/ease';
import { isInstance, nextKey, pairInstances } from '../core/symbols';
import { bonePose } from '../rig/math';
import { effectInfo, isAnimated } from '../effects/model';

export type KeyRef = string;

export const celRef = (layerId: Id, celId: Id): KeyRef => `c:${layerId}:${celId}`;
export const fxRef = (layerId: Id, effectId: Id, frame: number): KeyRef => `e:${layerId}:${effectId}:${frame}`;
export const propRef = (layerId: Id, propId: string, celId: Id): KeyRef => `p:${layerId}:${propId}:${celId}`;

export type ParsedRef =
  | { kind: 'cel'; layerId: Id; celId: Id }
  | { kind: 'fx'; layerId: Id; effectId: Id; frame: number }
  | { kind: 'prop'; layerId: Id; propId: string; celId: Id };

export function parseRef(ref: KeyRef): ParsedRef | null {
  const p = ref.split(':');
  if (p[0] === 'c' && p.length === 3) return { kind: 'cel', layerId: p[1], celId: p[2] };
  if (p[0] === 'e' && p.length === 4 && Number.isFinite(Number(p[3]))) return { kind: 'fx', layerId: p[1], effectId: p[2], frame: Number(p[3]) };
  if (p[0] === 'p' && p.length === 4) return { kind: 'prop', layerId: p[1], propId: p[2], celId: p[3] };
  return null;
}

export interface TrackKey {
  frame: number;
  ref: KeyRef;
  /** Short words for the tooltip ("x 120, y 40"). */
  value: string;
}

/** Between two keys: in-betweens (with their easing), a shape melt, or an even change (effects). */
export interface TrackSpan {
  from: number;
  to: number;
  kind: 'tween' | 'shape' | 'even';
  ease?: Easing;
  /** The part of the easing curve the span plays (set when it is made of the pieces of a cut span). */
  slice?: [number, number];
}

export interface Track {
  /** Unique within the layer. */
  id: string;
  label: string;
  icon: string;
  keys: TrackKey[];
  spans: TrackSpan[];
}

export const r1 = (n: number) => String(Math.round(n * 10) / 10);
export const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

export interface Prop<T> {
  id: string;
  label: string;
  icon: string;
  read: (x: T) => number[] | null;
  words: (v: number[]) => string;
}

/**
 * Keys for one property read off each drawing key: a key wherever the value differs from the key before (the first
 * key with a value always counts). Spans follow the tweens. Returns null when the property never changes.
 */
function celTrack<T>(layer: Layer, values: (T | undefined)[], prop: Prop<T>, refOf: (cel: Cel) => KeyRef = (c) => celRef(layer.id, c.id)): Track | null {
  const keys: TrackKey[] = [];
  const spans: TrackSpan[] = [];
  let prev: number[] | null = null;
  let changes = 0;
  layer.cels.forEach((cel, i) => {
    const x = values[i];
    const v = x === undefined ? null : prop.read(x);
    if (!v) {
      prev = null;
      return;
    }
    const differs = !prev || !same(prev, v);
    if (prev && differs) changes++;
    // A key a cut left on the way along an unbroken tween is not a key of this row: nothing was set here.
    if (differs && !(prev && passesThrough(layer, i, prev, v, values[i + 1] === undefined ? null : prop.read(values[i + 1] as T)))) keys.push({ frame: cel.start, ref: refOf(cel), value: prop.words(v) });
    prev = v;
  });
  if (!changes) return null;
  addTweenSpans(layer, keys, spans);
  return { id: prop.id, label: prop.label, icon: prop.icon, keys, spans };
}

/**
 * Is the drawing key `i` only a place a property key cut a tween, as far as this row goes? That is so when the key before
 * and this one are the two halves of one cut span (same classic easing, their slices meeting), and this row's value here
 * is exactly what the one uncut span gives at that point of its curve, between the values on the key before and the key
 * after. The motion of the row is then the same with or without the key, so it gets no diamond. A row the user set
 * a value on at the cut differs from the curve and keeps its diamond.
 */
export function passesThrough(layer: Layer, i: number, before: number[], here: number[], after: number[] | null): boolean {
  const p = layer.cels[i - 1];
  const c = layer.cels[i];
  if (!p || !c || !after || !p.tween || !c.tween || after.length !== here.length || before.length !== here.length) return false;
  if (!nextKey(layer, p) || !nextKey(layer, c)) return false;
  const a = p.tween;
  const b = c.tween;
  if (a.kind === 'shape' || b.kind === 'shape' || a.spin || b.spin || a.path || b.path) return false;
  if (JSON.stringify(a.ease) !== JSON.stringify(b.ease)) return false;
  const [s0, s1] = a.slice ?? [0, 1];
  const [t1, s2] = b.slice ?? [0, 1];
  if (s1 !== t1) return false;
  const e = tweenEase({ ease: a.ease, slice: [s0, s2] }, (s1 - s0) / (s2 - s0));
  return here.every((v, k) => Math.abs(v - (before[k] + (after[k] - before[k]) * e)) < 1e-6);
}

/** A span from each key to the next one on the row, when in-betweens run all the way between them. */
function addTweenSpans(layer: Layer, keys: TrackKey[], spans: TrackSpan[]): void {
  const at = new Map(layer.cels.map((c) => [c.start, c] as const));
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i].frame;
    const b = keys[i + 1].frame;
    // Every drawing key from a to b has to be tweened into the next for the change to glide.
    let c: Cel | undefined = at.get(a);
    let ok = !!c;
    let ease: Easing | undefined;
    let kind: TrackSpan['kind'] = 'tween';
    // Pieces of one cut span join up into the one curve they came from.
    let lo = 0;
    let hi = 1;
    let joined = true;
    let first = true;
    while (c && c.start < b) {
      if (!c.tween || !nextKey(layer, c)) {
        ok = false;
        break;
      }
      const [x, y] = c.tween.slice ?? [0, 1];
      if (first) {
        ease = c.tween.ease;
        lo = x;
      } else if (JSON.stringify(c.tween.ease) !== JSON.stringify(ease) || x !== hi) joined = false;
      hi = y;
      first = false;
      if (c.tween.kind === 'shape') kind = 'shape';
      c = nextKey(layer, c);
    }
    if (ok && c?.start === b) spans.push({ from: a, to: b, kind, ease, ...(joined && (lo !== 0 || hi !== 1) ? { slice: [lo, hi] as [number, number] } : {}) });
  }
}

/**
 * A row whose keys can be edited on their own: how to find what each drawing key holds for it (`holders`: the symbol
 * copies, the drawing carrying a bone's pose, the camera view) and read or write the row's numbers on one of them.
 */
export interface RowDef<T = any> extends Prop<T[]> {
  get: (h: T) => number[];
  set: (h: T, v: number[]) => void;
  holders: (doc: Doc, layer: Layer) => (T[] | undefined)[];
  /** What a key needs under it, for a refusal ("a symbol", "a bones key"). */
  noun: string;
}

function rowDef<T>(id: string, label: string, icon: string, noun: string, holders: RowDef<T>['holders'], get: RowDef<T>['get'], set: RowDef<T>['set'], words: (v: number[]) => string): RowDef<T> {
  return { id, label, icon, noun, holders, get, set, words, read: (l) => (l.length ? l.flatMap(get) : null) };
}

/** Instances on each key, paired with the key before so the same thing is compared with itself. */
export function instanceLists(doc: Doc, layer: Layer): (InstanceShape[] | undefined)[] {
  let prev: InstanceShape[] | undefined;
  return layer.cels.map((c) => {
    const d = doc.drawings[c.drawingId];
    const list = d && d.kind === 'vector' ? d.shapes.filter(isInstance) : [];
    if (!list.length) return (prev = undefined);
    const paired = prev ? pairInstances(prev, list).map((x, i) => x ?? list[i]).filter((x): x is InstanceShape => !!x) : list;
    // Instances that are new on this key go on the end, so the lists line up.
    for (const x of list) if (!paired.includes(x)) paired.push(x);
    return (prev = paired);
  });
}

type InstProp = RowDef<InstanceShape>;
const instProp = (id: string, label: string, icon: string, get: InstProp['get'], set: InstProp['set'], words: (v: number[]) => string): InstProp => rowDef(id, label, icon, 'a symbol', instanceLists, get, set, words);

const POSITION = instProp('position', 'Position', 'path', (s) => [s.transform.x, s.transform.y], (s, v) => void ((s.transform.x = v[0]), (s.transform.y = v[1])), (v) => `x ${r1(v[0])}, y ${r1(v[1])}`);
const SCALE = instProp('scale', 'Size', 'rect', (s) => [s.transform.scaleX, s.transform.scaleY], (s, v) => void ((s.transform.scaleX = v[0]), (s.transform.scaleY = v[1])), (v) => `${Math.round(v[0] * 100)}% by ${Math.round(v[1] * 100)}%`);
const ROTATION = instProp('rotation', 'Turn', 'rotate', (s) => [s.transform.rotation], (s, v) => void (s.transform.rotation = v[0]), (v) => `${r1(v[0])} degrees`);
const SKEW = instProp('skew', 'Slant', 'shade', (s) => [s.transform.skew], (s, v) => void (s.transform.skew = v[0]), (v) => `${r1(v[0])} degrees`);
const OPACITY = instProp('opacity', 'See-through', 'eye', (s) => [s.opacity], (s, v) => void (s.opacity = v[0]), (v) => `${Math.round(v[0] * 100)}%`);
const TINT = instProp(
  'tint',
  'Tint',
  'palette',
  (s) => [s.tint ? s.tint.amount : 0, s.tint ? parseInt(s.tint.color.replace('#', '').slice(0, 6), 16) || 0 : 0],
  (s, v) => {
    if (!v[0] && !v[1]) delete s.tint;
    else s.tint = { amount: v[0], color: `#${Math.round(v[1]).toString(16).padStart(6, '0')}` };
  },
  (v) => `${Math.round(v[0] * 100)}%`,
);

/** The symbol properties that have rows, in row order. */
export const INSTANCE_PROPS: readonly InstProp[] = [POSITION, SCALE, ROTATION, SKEW, OPACITY, TINT];

/** The drawing on each key of a bones layer (undefined where it isn't a vector drawing). */
const poseHolders = (doc: Doc, layer: Layer): (VectorDrawing[] | undefined)[] =>
  layer.cels.map((c) => {
    const d = doc.drawings[c.drawingId];
    return d && d.kind === 'vector' ? [d] : undefined;
  });

const BONE_ROW = 'bone-';

/** One bone's row: its turn, move and stretch on each key's pose. */
function boneRow(boneId: Id, name: string): RowDef<VectorDrawing> {
  return rowDef(
    BONE_ROW + boneId,
    name,
    'bone',
    'a bones key',
    poseHolders,
    (d) => {
      const b = d.pose?.[boneId];
      return [b?.r ?? 0, b?.x ?? 0, b?.y ?? 0, b?.s ?? 1];
    },
    (d, v) => {
      // A bone at rest is left out of the pose, like the pose tools do.
      const b = bonePose(v[0], v[1], v[2], v[3]);
      if (!b.r && b.x === undefined && b.s === undefined) {
        if (d.pose) delete d.pose[boneId];
      } else (d.pose ??= {})[boneId] = b;
    },
    (v) => `turned ${r1(v[0])} degrees${v[1] || v[2] ? `, moved ${r1(v[1])}, ${r1(v[2])}` : ''}${v[3] !== 1 ? `, ${Math.round(v[3] * 100)}% long` : ''}`,
  );
}

const cameraHolders = (doc: Doc, layer: Layer): (CameraView[] | undefined)[] =>
  layer.cels.map((c) => {
    const d = doc.drawings[c.drawingId];
    return d && d.kind === 'camera' ? [d.view] : undefined;
  });

const camRow = (id: string, label: string, icon: string, get: (v: CameraView) => number[], set: (v: CameraView, n: number[]) => void, words: (n: number[]) => string) => rowDef<CameraView>(id, label, icon, 'a camera key', cameraHolders, get, set, words);

/** The camera's rows, in row order. */
const CAMERA_PROPS: readonly RowDef<CameraView>[] = [
  camRow('cam-position', 'Where it looks', 'camera', (v) => [v.x, v.y], (v, n) => void ((v.x = n[0]), (v.y = n[1])), (n) => `x ${r1(n[0])}, y ${r1(n[1])}`),
  camRow('cam-zoom', 'Zoom', 'zoom', (v) => [v.zoom], (v, n) => void (v.zoom = n[0]), (n) => `${Math.round(n[0] * 100)}%`),
  camRow('cam-rotation', 'Turn', 'rotate', (v) => [v.rotation], (v, n) => void (v.rotation = n[0]), (n) => `${r1(n[0])} degrees`),
];

/** The rows of a layer whose keys edit on their own: bones, camera, then symbol properties, in row order. */
export function layerRows(layer: Layer): RowDef[] {
  if (layer.kind === 'camera') return [...CAMERA_PROPS];
  if (layer.kind !== 'vector') return [];
  return [...(layer.rig?.bones.map((b) => boneRow(b.id, b.name)) ?? []), ...INSTANCE_PROPS];
}

/** One row of a layer by its id, or undefined when the layer doesn't have it. */
export function rowOf(layer: Layer, rowId: string): RowDef | undefined {
  if (layer.kind === 'camera') return CAMERA_PROPS.find((p) => p.id === rowId);
  if (layer.kind !== 'vector') return undefined;
  if (rowId.startsWith(BONE_ROW)) {
    const b = layer.rig?.bones.find((x) => BONE_ROW + x.id === rowId);
    return b ? boneRow(b.id, b.name) : undefined;
  }
  return INSTANCE_PROPS.find((p) => p.id === rowId);
}

/** The rows of property keys a layer has: those with something that changes, each key moving on its own. */
function rowTracks(doc: Doc, layer: Layer): Track[] {
  const out: Track[] = [];
  for (const row of layerRows(layer)) {
    const lists = row.holders(doc, layer);
    if (!lists.some((l) => l?.length)) continue;
    const t = celTrack(layer, lists, row, (c) => propRef(layer.id, row.id, c.id));
    if (t) out.push(t);
  }
  return out;
}

/** A morph row: the keys that melt into the next one, and the ones they melt into. */
function shapeTrack(layer: Layer): Track | null {
  const keys: TrackKey[] = [];
  const spans: TrackSpan[] = [];
  const seen = new Set<Cel>();
  for (const c of layer.cels) {
    if (c.tween?.kind !== 'shape') continue;
    const n = nextKey(layer, c);
    for (const k of n ? [c, n] : [c]) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push({ frame: k.start, ref: celRef(layer.id, k.id), value: 'shape' });
    }
    if (n) spans.push({ from: c.start, to: n.start, kind: 'shape', ease: c.tween.ease });
  }
  if (!keys.length) return null;
  keys.sort((a, b) => a.frame - b.frame);
  return { id: 'shape', label: 'Shape (morph)', icon: 'morph', keys, spans };
}

function effectTrack(layer: Layer, e: LayerEffect, n: number): Track | null {
  if (!isAnimated(e)) return null;
  const keys = (e.keys ?? []).map((k) => ({
    frame: k.frame,
    ref: fxRef(layer.id, e.id, k.frame),
    value: Object.entries(k.values)
      .slice(0, 3)
      .map(([name, v]) => `${effectInfo(e.kind).params.find((p) => p.key === name)?.label ?? name} ${r1(v)}`)
      .join(', '),
  }));
  const spans = keys.slice(0, -1).map((k, i): TrackSpan => ({ from: k.frame, to: keys[i + 1].frame, kind: 'even' }));
  const label = effectInfo(e.kind).label;
  return { id: `fx-${e.id}`, label: n > 1 ? `${label} ${n}` : label, icon: 'effects', keys, spans };
}

const cache = new WeakMap<Layer, { drawings: Doc['drawings']; tracks: Track[] }>();

/** Every property row a layer has, in a steady order. Empty when nothing on it changes over time. */
export function layerTracks(doc: Doc, layer: Layer): Track[] {
  const hit = cache.get(layer);
  if (hit && hit.drawings === doc.drawings) return hit.tracks;
  const tracks: Track[] = [];
  tracks.push(...rowTracks(doc, layer));
  if (layer.kind === 'vector') {
    const s = shapeTrack(layer);
    if (s) tracks.push(s);
  }
  const count = new Map<string, number>();
  for (const e of layer.effects ?? []) {
    const n = (count.get(e.kind) ?? 0) + 1;
    count.set(e.kind, n);
    const t = effectTrack(layer, e, n);
    if (t) tracks.push(t);
  }
  cache.set(layer, { drawings: doc.drawings, tracks });
  return tracks;
}

/** Every key ref on a layer's own row (its drawing keys). */
export function layerKeyRefs(layer: Layer): KeyRef[] {
  return layer.cels.map((c) => celRef(layer.id, c.id));
}

/** The frame a key sits on right now, or undefined when it's gone. */
export function keyFrame(doc: Doc, ref: KeyRef): number | undefined {
  const p = parseRef(ref);
  if (!p) return undefined;
  const layer = doc.layers.find((l) => l.id === p.layerId);
  if (!layer) return undefined;
  if (p.kind === 'cel' || p.kind === 'prop') return layer.cels.find((c) => c.id === p.celId)?.start;
  const e = layer.effects?.find((x) => x.id === p.effectId);
  return e?.keys?.some((k) => k.frame === p.frame) ? p.frame : undefined;
}
