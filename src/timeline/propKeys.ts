/**
 * Editing one row's keys on their own, without touching the drawing or the other rows: a symbol's position, size, turn,
 * slant, see-through and tint, one bone's pose, or the camera's place, zoom and turn. A property key is a drawing key
 * where that row's value differs from the key before,
 * so moving it means: the key it leaves takes the earlier value, and the frame it lands on (a drawing key already
 * there, or a new one cut out of the hold or tween it lands in) takes its value. Everything else stays as it was.
 *
 * Pure on a draft or plain doc. `planPropEdits` only looks (so a refusal leaves the doc alone); `applyPropEdits` does it.
 */
import type { Cel, Doc, Id, Layer } from '../core/format';
import { allLayerLists, isInstance, nextKey, pairInstances, symbolContent, tweenInstance, tweenProgress } from '../core/symbols';
import { cameraViewOn } from '../core/camera';
import { cutTween, cutProblem, takeTurns } from '../core/tweenCut';
import { rigPoseAt } from '../rig/pose';
import { tidyPose } from '../rig/math';
import { uid } from '../core/doc';
import { cloneDrawing, MAX_LENGTH } from './edit-core';
import { propRef, rowOf, same, type KeyRef, type RowDef } from './tracks';

const end = (c: { start: number; length: number }) => c.start + c.length;

/** Picked property keys: layer, then row id, then the drawing keys they sit on. */
export type PropPicks = Map<Id, Map<string, Set<Id>>>;

interface Snap {
  frame: number;
  /** One number list per symbol copy on the key. */
  value: number[][];
}

interface PropPlan {
  prop: RowDef;
  /** The row's keys after the edit, earliest first. */
  keys: Snap[];
  /** The drawing keys that are moved targets: their frames. */
  targets: number[];
}

interface LayerPlan {
  layer: Layer;
  props: PropPlan[];
  /** Frames that need a new drawing key cut out of whatever holds them. */
  splits: number[];
  changed: boolean;
}

export interface PropEditPlan {
  layers: LayerPlan[];
  changed: boolean;
}

/** Why the last plan said no, in plain words (empty when it didn't). */
export let propWhy = '';
const no = (why: string): null => {
  propWhy = why;
  return null;
};

const flat = (v: number[][] | null) => (v ? v.flat() : null);

/**
 * Looks at moving (`map`) or taking away (`map` null) the picked property keys. Returns what would happen, or null
 * when they'd collide, land where there's no symbol, or the row would lose its start.
 */
export function planPropEdits(doc: Doc, picks: PropPicks, map: ((frame: number) => number) | null): PropEditPlan | null {
  propWhy = '';
  const layers: LayerPlan[] = [];
  let changed = false;
  for (const [layerId, byProp] of picks) {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const lp: LayerPlan = { layer, props: [], splits: [], changed: false };
    for (const [propId, celIds] of byProp) {
      const prop = rowOf(layer, propId);
      if (!prop) continue;
      const lists = prop.holders(doc, layer);
      const values = lists.map((l) => (l ? l.map((s) => prop.get(s)) : null));
      // The row's keys, worked out the way the row draws them.
      const old: { i: number; first: boolean }[] = [];
      values.forEach((v, i) => {
        if (!v) return;
        const p = i > 0 ? flat(values[i - 1]) : null;
        if (!p || !same(p, v.flat())) old.push({ i, first: !p });
      });
      const picked = old.filter((k) => celIds.has(layer.cels[k.i].id));
      if (!picked.length) continue;
      const pickedIdx = new Set(picked.map((k) => k.i));
      if (!map && picked.some((k) => k.first)) return no('The first key of a row stays: it is where that row starts. Move the drawing instead, or delete the keys after it.');
      const keys: Snap[] = old.filter((k) => !pickedIdx.has(k.i)).map((k) => ({ frame: layer.cels[k.i].start, value: values[k.i]! }));
      const targets: number[] = [];
      for (const k of picked) {
        const cel = layer.cels[k.i];
        if (!map) continue;
        const g = map(cel.start);
        if (!Number.isInteger(g) || g < 0 || g >= MAX_LENGTH) return no('That is outside the animation.');
        const holder = layer.cels.findIndex((c) => c.start <= g && g < end(c));
        if (holder < 0 || !lists[holder]) return no(`A key on this row needs ${prop.noun} on that frame. Pick a frame that has one.`);
        const c = layer.cels[holder];
        const cutWhy = c.start !== g && c.tween && nextKey(layer, c) ? cutProblem(c.tween, (g - c.start) / c.length, c.length) : null;
        if (cutWhy) return no(cutWhy);
        if (c.start !== g && !lp.splits.includes(g)) lp.splits.push(g);
        targets.push(g);
        keys.push({ frame: g, value: values[k.i]! });
        if (g !== cel.start) changed = lp.changed = true;
      }
      keys.sort((a, b) => a.frame - b.frame);
      if (new Set(keys.map((k) => k.frame)).size !== keys.length) return no('Those keys would land on other keys there.');
      // The cels as they will be, with the ones to cut out, to check each moved key still shows as a key.
      if (map && targets.length) {
        const sim = simulate(layer, lists, keys, lp.splits);
        for (const g of targets) if (!sim.has(g)) return no('That key would not show: the row has the same value there as just before. Pick a frame after the first key.');
      }
      if (!map && picked.length) changed = lp.changed = true;
      lp.props.push({ prop, keys, targets });
    }
    if (lp.props.length) layers.push(lp);
  }
  return layers.length ? { layers, changed } : { layers, changed: false };
}

/** The frames where a row would show a key, if each cel took the value of the last key at or before it. */
function simulate(layer: Layer, lists: (unknown[] | undefined)[], keys: Snap[], splits: number[]): Set<number> {
  const starts: { start: number; listed: boolean }[] = layer.cels.map((c, i) => ({ start: c.start, listed: !!lists[i] }));
  for (const g of splits) {
    const holder = layer.cels.findIndex((c) => c.start <= g && g < end(c));
    starts.push({ start: g, listed: !!lists[holder] });
  }
  starts.sort((a, b) => a.start - b.start);
  const at = (s: number) => (keys.filter((k) => k.frame <= s).pop() ?? keys[0]).value.flat();
  const out = new Set<number>();
  let prev: number[] | null = null;
  for (const c of starts) {
    if (!c.listed) {
      prev = null;
      continue;
    }
    const v = at(c.start);
    if (!prev || !same(prev, v)) out.add(c.start);
    prev = v;
  }
  return out;
}

/**
 * A new drawing key at `frame`, cut out of the key holding it: the same picture, so only the edited row will change.
 * On a tween the two halves each play their own part of the one easing curve (`Tween.slice`), so the motion of every
 * row over the span is exactly what it was.
 */
function splitCel(doc: Doc, layer: Layer, frame: number): Cel | undefined {
  const cel = layer.cels.find((c) => c.start < frame && frame < end(c));
  const d = cel && doc.drawings[cel.drawingId];
  if (!cel || !d) return undefined;
  const local = frame - cel.start;
  const tp = tweenProgress(layer, cel, frame);
  let nd;
  if (d.kind === 'camera') {
    nd = cloneDrawing(d);
    if (nd.kind === 'camera') nd.view = { ...(cameraViewOn(doc, layer, frame) ?? d.view) };
  } else if (d.kind === 'vector') {
    nd = cloneDrawing(d);
    if (nd.kind !== 'vector') return undefined;
    const from = d.shapes.filter(isInstance);
    const to = tp ? doc.drawings[tp.next.drawingId] : undefined;
    const pairs = tp && cel.tween ? pairInstances(from, to?.kind === 'vector' ? to.shapes.filter(isInstance) : []) : [];
    nd.shapes.filter(isInstance).forEach((s, i) => {
      // Hold the in-between the tween had here, and the symbol's own playback where it had got to.
      const at = tp && cel.tween ? tweenInstance(from[i], pairs[i], cel.tween, tp.t) : from[i];
      s.transform = { ...at.transform };
      s.opacity = at.opacity;
      if (at.tint) s.tint = { ...at.tint };
      else delete s.tint;
      const n = Math.max(1, symbolContent(doc, s.symbolId)?.length ?? 1);
      const first = Math.max(0, Math.min(n - 1, Math.round(s.firstFrame) || 0));
      if (s.play === 'once') s.firstFrame = Math.min(n - 1, first + local);
      else if (s.play !== 'single') s.firstFrame = (((first + local) % n) + n) % n;
    });
    // A bones key holds the pose the glide had reached.
    if (layer.kind === 'vector' && layer.rig) {
      const pose = tidyPose(rigPoseAt(doc, layer, frame));
      if (Object.keys(pose).length) nd.pose = JSON.parse(JSON.stringify(pose));
      else delete nd.pose;
    }
  } else return undefined;
  doc.drawings[nd.id] = nd;
  const cut: Cel = { id: uid('c'), start: frame, length: end(cel) - frame, drawingId: nd.id };
  if (cel.tween && tp) {
    // Each half takes its part of the easing, its share of the spin and its piece of the motion path.
    const halves = cutTween(cel.tween, local / cel.length);
    if (halves.turns) {
      if (nd.kind === 'camera') nd.view.rotation -= halves.turns * 360;
      else if (nd.kind === 'vector') takeTurns(nd, d, doc.drawings[tp.next.drawingId], halves.turns);
    }
    cut.tween = halves.second;
    cel.tween = halves.first;
  }
  if (cel.autoHold) cut.autoHold = true;
  cel.length = local;
  delete cel.autoHold;
  layer.cels.splice(layer.cels.indexOf(cel) + 1, 0, cut);
  return cut;
}

/** Makes sure writing to this cel's symbol copies won't change another key sharing its drawing. */
function ownDrawing(doc: Doc, cel: Cel): void {
  let uses = 0;
  for (const list of allLayerLists(doc)) for (const l of list) for (const c of l.cels) if (c.drawingId === cel.drawingId) uses++;
  const d = doc.drawings[cel.drawingId];
  if (uses < 2 || !d) return;
  const nd = cloneDrawing(d);
  doc.drawings[nd.id] = nd;
  cel.drawingId = nd.id;
}

/** Does the plan. Returns the refs of the moved keys on their new frames. */
export function applyPropEdits(doc: Doc, plan: PropEditPlan): KeyRef[] {
  const out: KeyRef[] = [];
  for (const lp of plan.layers) {
    const { layer } = lp;
    const fresh = new Set<Cel>();
    for (const g of lp.splits.sort((a, b) => a - b)) {
      const c = splitCel(doc, layer, g);
      if (c) fresh.add(c);
    }
    for (const pp of lp.props) {
      let lists = pp.prop.holders(doc, layer);
      for (let i = 0; i < layer.cels.length; i++) {
        const cel = layer.cels[i];
        const isTarget = pp.targets.includes(cel.start);
        // A cut-out key only takes this row's value where a moved key lands on it; its other rows are already right.
        if (!fresh.has(cel) || isTarget) {
          const want = (pp.keys.filter((k) => k.frame <= cel.start).pop() ?? pp.keys[0]).value;
          const list = lists[i];
          if (list && list.some((s, j) => !!want[j] && !same(pp.prop.get(s), want[j]))) {
            ownDrawing(doc, cel);
            lists = pp.prop.holders(doc, layer);
            lists[i]!.forEach((s, j) => {
              if (want[j]) pp.prop.set(s, want[j].slice());
            });
          }
        }
      }
      for (const g of pp.targets) {
        const c = layer.cels.find((x) => x.start === g);
        if (c) out.push(propRef(layer.id, pp.prop.id, c.id));
      }
    }
  }
  return out;
}
