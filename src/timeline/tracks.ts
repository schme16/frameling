/**
 * Property tracks for the detailed timeline: what changes on a layer over time, one row per thing (position, zoom,
 * a bone, an effect), with a diamond wherever that thing has a key. Pure, worked out from the document, never stored.
 *
 * Two kinds of key live here. A drawing key (`c:`) is a cel: moving one moves that drawing, so every property row it
 * shows on moves with it. An effect key (`e:`) is one of an effect's own keys, independent of the drawings.
 */
import type { Cel, Doc, Easing, Id, InstanceShape, Layer, LayerEffect } from '../core/format';
import { isInstance, nextKey, pairInstances } from '../core/symbols';
import { effectInfo, isAnimated } from '../effects/model';

export type KeyRef = string;

export const celRef = (layerId: Id, celId: Id): KeyRef => `c:${layerId}:${celId}`;
export const fxRef = (layerId: Id, effectId: Id, frame: number): KeyRef => `e:${layerId}:${effectId}:${frame}`;

export type ParsedRef = { kind: 'cel'; layerId: Id; celId: Id } | { kind: 'fx'; layerId: Id; effectId: Id; frame: number };

export function parseRef(ref: KeyRef): ParsedRef | null {
  const p = ref.split(':');
  if (p[0] === 'c' && p.length === 3) return { kind: 'cel', layerId: p[1], celId: p[2] };
  if (p[0] === 'e' && p.length === 4 && Number.isFinite(Number(p[3]))) return { kind: 'fx', layerId: p[1], effectId: p[2], frame: Number(p[3]) };
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
}

export interface Track {
  /** Unique within the layer. */
  id: string;
  label: string;
  icon: string;
  keys: TrackKey[];
  spans: TrackSpan[];
}

const r1 = (n: number) => String(Math.round(n * 10) / 10);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

interface Prop<T> {
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
function celTrack<T>(layer: Layer, values: (T | undefined)[], prop: Prop<T>): Track | null {
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
    if (differs) keys.push({ frame: cel.start, ref: celRef(layer.id, cel.id), value: prop.words(v) });
    prev = v;
  });
  if (!changes) return null;
  addTweenSpans(layer, keys, spans);
  return { id: prop.id, label: prop.label, icon: prop.icon, keys, spans };
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
    while (c && c.start < b) {
      if (!c.tween || !nextKey(layer, c)) {
        ok = false;
        break;
      }
      ease ??= c.tween.ease;
      if (c.tween.kind === 'shape') kind = 'shape';
      c = nextKey(layer, c);
    }
    if (ok && c?.start === b) spans.push({ from: a, to: b, kind, ease });
  }
}

const POSITION: Prop<InstanceShape[]> = { id: 'position', label: 'Position', icon: 'path', read: (l) => (l.length ? l.flatMap((s) => [s.transform.x, s.transform.y]) : null), words: (v) => `x ${r1(v[0])}, y ${r1(v[1])}` };
const SCALE: Prop<InstanceShape[]> = { id: 'scale', label: 'Size', icon: 'rect', read: (l) => (l.length ? l.flatMap((s) => [s.transform.scaleX, s.transform.scaleY]) : null), words: (v) => `${Math.round(v[0] * 100)}% by ${Math.round(v[1] * 100)}%` };
const ROTATION: Prop<InstanceShape[]> = { id: 'rotation', label: 'Turn', icon: 'rotate', read: (l) => (l.length ? l.map((s) => s.transform.rotation) : null), words: (v) => `${r1(v[0])} degrees` };
const SKEW: Prop<InstanceShape[]> = { id: 'skew', label: 'Slant', icon: 'shade', read: (l) => (l.length ? l.map((s) => s.transform.skew) : null), words: (v) => `${r1(v[0])} degrees` };
const OPACITY: Prop<InstanceShape[]> = { id: 'opacity', label: 'See-through', icon: 'eye', read: (l) => (l.length ? l.map((s) => s.opacity) : null), words: (v) => `${Math.round(v[0] * 100)}%` };
const TINT: Prop<InstanceShape[]> = {
  id: 'tint',
  label: 'Tint',
  icon: 'palette',
  read: (l) => (l.length ? l.flatMap((s) => [s.tint ? s.tint.amount : 0, s.tint ? parseInt(s.tint.color.replace('#', '').slice(0, 6), 16) || 0 : 0]) : null),
  words: (v) => `${Math.round(v[0] * 100)}%`,
};

/** Instances on each key, paired with the key before so the same thing is compared with itself. */
function instanceLists(doc: Doc, layer: Layer): (InstanceShape[] | undefined)[] {
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

function cameraTracks(doc: Doc, layer: Layer): Track[] {
  const views = layer.cels.map((c) => {
    const d = doc.drawings[c.drawingId];
    return d && d.kind === 'camera' ? d.view : undefined;
  });
  const props: Prop<(typeof views)[number] & object>[] = [
    { id: 'cam-position', label: 'Where it looks', icon: 'camera', read: (v) => [v.x, v.y], words: (v) => `x ${r1(v[0])}, y ${r1(v[1])}` },
    { id: 'cam-zoom', label: 'Zoom', icon: 'zoom', read: (v) => [v.zoom], words: (v) => `${Math.round(v[0] * 100)}%` },
    { id: 'cam-rotation', label: 'Turn', icon: 'rotate', read: (v) => [v.rotation], words: (v) => `${r1(v[0])} degrees` },
  ];
  return props.map((p) => celTrack(layer, views, p)).filter((t): t is Track => !!t);
}

function boneTracks(doc: Doc, layer: Layer): Track[] {
  if (layer.kind !== 'vector' || !layer.rig) return [];
  const poses = layer.cels.map((c) => {
    const d = doc.drawings[c.drawingId];
    return d && d.kind === 'vector' ? (d.pose ?? {}) : undefined;
  });
  const out: Track[] = [];
  for (const bone of layer.rig.bones) {
    const t = celTrack(layer, poses, {
      id: `bone-${bone.id}`,
      label: bone.name,
      icon: 'bone',
      read: (p) => {
        const b = p[bone.id];
        return [b?.r ?? 0, b?.x ?? 0, b?.y ?? 0, b?.s ?? 1];
      },
      words: (v) => `turned ${r1(v[0])} degrees${v[1] || v[2] ? `, moved ${r1(v[1])}, ${r1(v[2])}` : ''}${v[3] !== 1 ? `, ${Math.round(v[3] * 100)}% long` : ''}`,
    });
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
  if (layer.kind === 'camera') tracks.push(...cameraTracks(doc, layer));
  else if (layer.kind === 'vector') {
    tracks.push(...boneTracks(doc, layer));
    const lists = instanceLists(doc, layer);
    if (lists.some((l) => l?.length)) for (const p of [POSITION, SCALE, ROTATION, SKEW, OPACITY, TINT]) {
      const t = celTrack(layer, lists, p);
      if (t) tracks.push(t);
    }
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
  if (p.kind === 'cel') return layer.cels.find((c) => c.id === p.celId)?.start;
  const e = layer.effects?.find((x) => x.id === p.effectId);
  return e?.keys?.some((k) => k.frame === p.frame) ? p.frame : undefined;
}
