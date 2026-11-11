/**
 * Bones as pure maths on the format (no DOM, no store): where every bone is in a pose, IK, pins, automatic weights,
 * meshes and skinning. The bone tools, the renderer and the tests all share it.
 *
 * Spaces: a bone's rest matrix takes bone space (x along the bone, origin at its joint) to layer space. A bone's
 * posed matrix does the same in a pose. Its skin matrix (posed * inverse rest) takes art drawn at rest to where it is
 * in the pose, which is what an attached layer is drawn with.
 */
import type { Bone, BonePose, Id, Pose, Rig, SkinMesh } from '../core/format';

export type Mat = [number, number, number, number, number, number];
export interface Pt {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;
const I: Mat = [1, 0, 0, 1, 0, 0];

// ---------------------------------------------------------------- small matrix helpers

/** Applies `b` first, then `a`. */
export function mmul(a: readonly number[], b: readonly number[]): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function minv(m: readonly number[]): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [...I];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function mapply(m: readonly number[], x: number, y: number): Pt {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function rot(deg: number): Mat {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [c, s, -s, c, 0, 0];
}

/** Wraps an angle into -180..180. */
export function wrapAngle(a: number): number {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

const angleOf = (dx: number, dy: number) => Math.atan2(dy, dx) / RAD;

// ---------------------------------------------------------------- rest and pose

export function restMatrix(b: Bone): Mat {
  const c = Math.cos(b.angle * RAD);
  const s = Math.sin(b.angle * RAD);
  return [c, s, -s, c, b.x, b.y];
}

export interface BoneState {
  bone: Bone;
  rest: Mat;
  posed: Mat;
  /** Rest art to posed art. */
  skin: Mat;
  /** World angle in the pose, degrees. */
  angle: number;
  base: Pt;
  tip: Pt;
}

export type RigState = Map<Id, BoneState>;

const stateCache = new WeakMap<Rig, WeakMap<Pose, RigState>>();
const EMPTY_POSE: Pose = {};

/** Where every bone is in a pose (missing pose = rest). Memoised per rig and pose object. */
export function rigState(rig: Rig, pose: Pose = EMPTY_POSE): RigState {
  let byPose = stateCache.get(rig);
  if (!byPose) stateCache.set(rig, (byPose = new WeakMap()));
  let st = byPose.get(pose);
  if (!st) {
    st = computeState(rig, pose);
    byPose.set(pose, st);
  }
  return st;
}

function computeState(rig: Rig, pose: Pose): RigState {
  const out: RigState = new Map();
  for (const b of rig.bones) {
    const rest = restMatrix(b);
    const p: BonePose | undefined = pose[b.id];
    const parent = b.parent ? out.get(b.parent) : undefined;
    // Local rest placement under the parent, then the pose: moved in the parent's space, turned about the joint.
    const local = parent ? mmul(minv(parent.rest), rest) : rest;
    const moved = p && (p.x || p.y) ? mmul([1, 0, 0, 1, p.x ?? 0, p.y ?? 0], local) : local;
    let posed = mmul(parent ? parent.posed : I, moved);
    if (p?.r) posed = mmul(posed, rot(p.r));
    const skin = mmul(posed, minv(rest));
    const base = { x: posed[4], y: posed[5] };
    const tip = mapply(posed, b.length, 0);
    out.set(b.id, { bone: b, rest, posed, skin, angle: angleOf(posed[0], posed[1]), base, tip });
  }
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A pose `t` of the way from `a` to `b` (bones missing from one are at rest there). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const p = a[id];
    const q = b[id];
    const r = lerp(p?.r ?? 0, q?.r ?? 0, t);
    const x = lerp(p?.x ?? 0, q?.x ?? 0, t);
    const y = lerp(p?.y ?? 0, q?.y ?? 0, t);
    out[id] = x || y ? { r, x, y } : { r };
  }
  return out;
}

/** Drops bones that are at rest, so poses stay small. */
export function tidyPose(p: Pose): Pose {
  const out: Pose = {};
  for (const [id, b] of Object.entries(p)) {
    const r = Math.abs(b.r) < 1e-6 ? 0 : b.r;
    const x = Math.abs(b.x ?? 0) < 1e-6 ? 0 : b.x!;
    const y = Math.abs(b.y ?? 0) < 1e-6 ? 0 : b.y!;
    if (!r && !x && !y) continue;
    out[id] = x || y ? { r, x, y } : { r };
  }
  return out;
}

// ---------------------------------------------------------------- the skeleton's shape

export function childrenOf(rig: Rig, id: Id | null): Bone[] {
  return rig.bones.filter((b) => (b.parent ?? null) === id);
}

/** A bone and every bone hanging below it. */
export function descendants(rig: Rig, id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  for (const b of rig.bones) if (b.parent && out.has(b.parent)) out.add(b.id);
  return out;
}

/**
 * The bones IK bends when the tip of `id` is dragged, root first: `id` and its parents, up to `max` bones, stopping
 * before a pinned bone or a bone where the skeleton branches (a chest with arms and a neck stays put when a hand moves).
 */
export function ikChain(rig: Rig, id: Id, max = 3): Id[] {
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  const chain: Id[] = [id];
  let cur = byId.get(id);
  while (cur?.parent && chain.length < max) {
    const p = byId.get(cur.parent);
    if (!p || p.pin || childrenOf(rig, p.id).length > 1) break;
    chain.unshift(p.id);
    cur = p;
  }
  return chain;
}

// ---------------------------------------------------------------- IK

/**
 * Moves a chain of points (bases of n segments, then the end) so the end reaches `target`, keeping the first point and
 * every segment's length. One segment points at it; two are solved exactly (keeping the side the middle joint bends to);
 * longer chains use CCD (cyclic coordinate descent). A target out of reach straightens the chain toward it.
 */
export function solvePoints(joints: Pt[], target: Pt, iterations = 24, bendHint = 0): Pt[] {
  const n = joints.length - 1;
  const p = joints.map((q) => ({ ...q }));
  if (n < 1) return p;
  const root = p[0];
  const lens: number[] = [];
  for (let i = 0; i < n; i++) lens.push(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y));
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return p;
  const phi = Math.atan2(dy, dx);
  if (n === 1) return [root, { x: root.x + Math.cos(phi) * lens[0], y: root.y + Math.sin(phi) * lens[0] }];
  if (n === 2) {
    const [l1, l2] = lens;
    const d = Math.max(Math.abs(l1 - l2), Math.min(l1 + l2, dist));
    const cross = (p[1].x - root.x) * (p[2].y - root.y) - (p[1].y - root.y) * (p[2].x - root.x);
    // Keep the elbow on the side it's on now. A straight limb bends the way it was drawn (the hint), else clockwise.
    const side = Math.abs(cross) > 1e-6 * (l1 + l2) * (l1 + l2) ? cross : bendHint;
    const bend = side > 0 ? -1 : 1;
    let a = 0;
    if (l1 > 1e-9 && d > 1e-9) a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const mid = { x: root.x + Math.cos(phi + bend * a) * l1, y: root.y + Math.sin(phi + bend * a) * l1 };
    const end = { x: root.x + Math.cos(phi) * d, y: root.y + Math.sin(phi) * d };
    return [root, mid, end];
  }
  // CCD: from the last joint back to the root, turn everything past the joint so the end points at the target.
  for (let it = 0; it < iterations; it++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = p[i];
      const e = p[n];
      const da = Math.atan2(target.y - j.y, target.x - j.x) - Math.atan2(e.y - j.y, e.x - j.x);
      if (Math.abs(da) < 1e-7) continue;
      const c = Math.cos(da);
      const s = Math.sin(da);
      for (let k = i + 1; k <= n; k++) {
        const vx = p[k].x - j.x;
        const vy = p[k].y - j.y;
        p[k] = { x: j.x + vx * c - vy * s, y: j.y + vx * s + vy * c };
      }
    }
    if (Math.hypot(p[n].x - target.x, p[n].y - target.y) < 0.01) break;
  }
  return p;
}

/** The points IK works on for a chain: each bone's joint, then the end (the last bone's tip, or `end`). */
export function chainPoints(st: RigState, chain: Id[], end?: Pt): Pt[] {
  const pts = chain.map((id) => st.get(id)!.base);
  pts.push(end ?? st.get(chain[chain.length - 1])!.tip);
  return pts;
}

/**
 * The pose with the chain bent so its end (the last bone's tip, or the point `endOf` names) reaches `target`.
 * Only the chain's bones turn.
 */
export function solveIK(rig: Rig, pose: Pose, chain: Id[], target: Pt, endOf?: (st: RigState) => Pt): Pose {
  if (!chain.length) return pose;
  const st0 = rigState(rig, pose);
  const joints = chainPoints(st0, chain, endOf?.(st0));
  let hint = 0;
  if (chain.length === 2) {
    // Which way the limb bends as drawn, for when it's straight now.
    const r = chainPoints(rigState(rig), chain, endOf?.(rigState(rig)));
    hint = (r[1].x - r[0].x) * (r[2].y - r[0].y) - (r[1].y - r[0].y) * (r[2].x - r[0].x);
  }
  const want = solvePoints(joints, target, 24, hint);
  return turnChainTo(rig, pose, chain, want, endOf);
}

/** Turns each bone of the chain, root first, so the chain's points line up with `want`. */
function turnChainTo(rig: Rig, pose: Pose, chain: Id[], want: Pt[], endOf?: (st: RigState) => Pt): Pose {
  let out: Pose = { ...pose };
  for (let i = 0; i < chain.length; i++) {
    const st = rigState(rig, out);
    const pts = chainPoints(st, chain, endOf?.(st));
    const cur = angleOf(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const next = angleOf(want[i + 1].x - want[i].x, want[i + 1].y - want[i].y);
    const d = wrapAngle(next - cur);
    if (Math.abs(d) < 1e-9) continue;
    const id = chain[i];
    out = { ...out, [id]: { ...(out[id] ?? { r: 0 }), r: (out[id]?.r ?? 0) + d } };
  }
  return out;
}

/** Turns one bone (FK) so that it points at `at`, as when its body is dragged. */
export function aimBone(rig: Rig, pose: Pose, id: Id, from: Pt, at: Pt): Pose {
  const s = rigState(rig, pose).get(id);
  if (!s) return pose;
  const d = wrapAngle(angleOf(at.x - s.base.x, at.y - s.base.y) - angleOf(from.x - s.base.x, from.y - s.base.y));
  return { ...pose, [id]: { ...(pose[id] ?? { r: 0 }), r: (pose[id]?.r ?? 0) + d } };
}

/** Moves a bone's joint by a world-space amount (in its parent's space underneath). */
export function moveBone(rig: Rig, pose: Pose, id: Id, dx: number, dy: number): Pose {
  const b = rig.bones.find((x) => x.id === id);
  if (!b) return pose;
  let lx = dx;
  let ly = dy;
  if (b.parent) {
    const ps = rigState(rig, pose).get(b.parent);
    if (ps) {
      const inv = minv([ps.posed[0], ps.posed[1], ps.posed[2], ps.posed[3], 0, 0]);
      const l = mapply(inv, dx, dy);
      lx = l.x;
      ly = l.y;
    }
  }
  const p = pose[id] ?? { r: 0 };
  return { ...pose, [id]: { r: p.r, x: (p.x ?? 0) + lx, y: (p.y ?? 0) + ly } };
}

// ---------------------------------------------------------------- pins

export interface PinHold {
  base: Pt;
  angle: number;
}

/** Where every pinned bone is now, to hold them there through a drag. */
export function capturePins(rig: Rig, pose: Pose): Map<Id, PinHold> {
  const st = rigState(rig, pose);
  const out = new Map<Id, PinHold>();
  for (const b of rig.bones) if (b.pin) {
    const s = st.get(b.id)!;
    out.set(b.id, { base: { ...s.base }, angle: s.angle });
  }
  return out;
}

/**
 * Puts pinned bones back where they were held: the two bones above each one bend (IK) so its joint lands back in
 * place, then it turns to keep its own angle. Pins whose bones are in `skip` (being dragged) are left alone.
 */
export function applyPins(rig: Rig, pose: Pose, holds: Map<Id, PinHold>, skip: Set<Id> = new Set()): Pose {
  let out = pose;
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  for (const [id, h] of holds) {
    const b = byId.get(id);
    if (!b || skip.has(id)) continue;
    const chain: Id[] = [];
    let p = b.parent ? byId.get(b.parent) : undefined;
    while (p && chain.length < 2 && !skip.has(p.id) && !p.pin) {
      chain.unshift(p.id);
      p = p.parent ? byId.get(p.parent) : undefined;
    }
    if (chain.length) out = solveIK(rig, out, chain, h.base, (st) => st.get(id)!.base);
    const s = rigState(rig, out).get(id)!;
    const d = wrapAngle(h.angle - s.angle);
    if (Math.abs(d) > 1e-9) out = { ...out, [id]: { ...(out[id] ?? { r: 0 }), r: (out[id]?.r ?? 0) + d } };
  }
  return out;
}

// ---------------------------------------------------------------- mirror

/** The name of the other side's bone ("Left arm" and "Right arm", "arm.L" and "arm.R", "L thigh"...), or undefined. */
export function mirrorName(name: string): string | undefined {
  const pairs: [RegExp, string][] = [
    [/\bleft\b/i, 'right'],
    [/\bright\b/i, 'left'],
  ];
  for (const [re, other] of pairs) {
    const m = name.match(re);
    if (m) return name.replace(re, matchCase(m[0], other));
  }
  const side = name.match(/(^|[\s._-])([LR])($|[\s._-])/);
  if (side) {
    const i = side.index! + side[1].length;
    return name.slice(0, i) + (side[2] === 'L' ? 'R' : 'L') + name.slice(i + 1);
  }
  return undefined;
}

function matchCase(src: string, word: string): string {
  if (src === src.toUpperCase()) return word.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/**
 * The pose with left and right swapped and nothing turned around: the near leg takes the far leg's pose. For a
 * character seen from the side, this is the second half of a walk.
 */
export function swapSides(rig: Rig, pose: Pose): Pose {
  const byName = new Map(rig.bones.map((b) => [b.name.toLowerCase(), b.id]));
  const out: Pose = {};
  for (const b of rig.bones) {
    const other = mirrorName(b.name);
    const src = other ? (byName.get(other.toLowerCase()) ?? b.id) : b.id;
    if (pose[src]) out[b.id] = { ...pose[src] };
  }
  return out;
}

/**
 * The pose flipped left for right: paired bones swap poses, and every turn reverses (as in a mirror). Bones without a
 * pair (spine, head) keep their place but turn the other way, and joint moves flip sideways.
 */
export function mirrorPose(rig: Rig, pose: Pose): Pose {
  const byName = new Map(rig.bones.map((b) => [b.name.toLowerCase(), b.id]));
  const out: Pose = {};
  for (const b of rig.bones) {
    const other = mirrorName(b.name);
    const src = other ? (byName.get(other.toLowerCase()) ?? b.id) : b.id;
    const p = pose[src];
    if (!p) continue;
    out[b.id] = p.x || p.y ? { r: -p.r, x: -(p.x ?? 0), y: p.y ?? 0 } : { r: -p.r };
  }
  return out;
}

// ---------------------------------------------------------------- weights, meshes and skinning

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The bone nearest a point at rest (by distance to the bone's line), or undefined for an empty rig. */
export function nearestBone(rig: Rig, p: Pt): Bone | undefined {
  let best: Bone | undefined;
  let bd = Infinity;
  const st = rigState(rig);
  for (const b of rig.bones) {
    const s = st.get(b.id)!;
    const d = distanceToSegment(p, s.base, s.tip);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/**
 * The bone a part drawn in `box` most likely belongs to: the one that runs closest along the box's long middle line
 * (so a forearm drawn over the top of a thigh still picks the forearm).
 */
export function boneForBox(rig: Rig, box: { x: number; y: number; w: number; h: number }): Bone | undefined {
  const st = rigState(rig);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const tall = box.h >= box.w;
  const pts: Pt[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = 0.1 + (0.8 * k) / 4;
    pts.push(tall ? { x: cx, y: box.y + box.h * t } : { x: box.x + box.w * t, y: cy });
  }
  let best: Bone | undefined;
  let bd = Infinity;
  for (const b of rig.bones) {
    const s = st.get(b.id)!;
    // The middle counts double, so a small part sits with the bone right under it.
    let d = distanceToSegment({ x: cx, y: cy }, s.base, s.tip);
    for (const p of pts) d += distanceToSegment(p, s.base, s.tip) / 2;
    if (d < bd - 1e-6) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/**
 * Automatic weights for one point: the (up to `max`) nearest bones pull it in proportion to 1 / distance^3, so a point
 * on a bone follows it rigidly and one between two bones blends them. Flat pairs [bone index, weight], summing to 1.
 */
export function autoWeights(p: Pt, segs: { base: Pt; tip: Pt }[], max = 4, falloff = 3): number[] {
  if (!segs.length) return [];
  const ds = segs.map((s, i) => ({ i, d: distanceToSegment(p, s.base, s.tip) }));
  ds.sort((a, b) => a.d - b.d);
  const pick = ds.slice(0, Math.max(1, max));
  const raw = pick.map((e) => ({ i: e.i, w: 1 / Math.pow(e.d + 1, falloff) }));
  const sum = raw.reduce((a, e) => a + e.w, 0);
  const kept = raw.filter((e) => e.w / sum >= 0.02);
  const s2 = kept.reduce((a, e) => a + e.w, 0);
  const out: number[] = [];
  for (const e of kept) out.push(e.i, e.w / s2);
  return out;
}

/**
 * A triangle mesh over a box: a grid of about `cells` squares along the longer side, two triangles each, keeping only
 * squares `keep` says have art in them (all of them when it's missing). Points nobody uses are dropped.
 */
export function gridMesh(box: { x: number; y: number; w: number; h: number }, cells = 12, keep?: (x: number, y: number, w: number, h: number) => boolean): { points: number[]; triangles: number[] } {
  const step = Math.max(box.w, box.h) / Math.max(1, cells);
  const cols = Math.max(1, Math.ceil(box.w / step));
  const rows = Math.max(1, Math.ceil(box.h / step));
  const cw = box.w / cols;
  const ch = box.h / rows;
  const index = new Map<number, number>();
  const points: number[] = [];
  const triangles: number[] = [];
  const at = (i: number, j: number) => {
    const k = j * (cols + 1) + i;
    let v = index.get(k);
    if (v === undefined) {
      v = points.length / 2;
      index.set(k, v);
      points.push(box.x + i * cw, box.y + j * ch);
    }
    return v;
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (keep && !keep(box.x + i * cw, box.y + j * ch, cw, ch)) continue;
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      triangles.push(a, b, c, b, d, c);
    }
  return { points, triangles };
}

/** A mesh with automatic weights for every bone of the rig, as it is at rest. */
export function skinMesh(rig: Rig, mesh: { points: number[]; triangles: number[] }, max = 4): SkinMesh {
  const st = rigState(rig);
  const bones = rig.bones.map((b) => b.id);
  const segs = bones.map((id) => st.get(id)!);
  const weights: number[][] = [];
  for (let i = 0; i < mesh.points.length; i += 2) weights.push(autoWeights({ x: mesh.points[i], y: mesh.points[i + 1] }, segs, max));
  return { points: mesh.points.slice(), triangles: mesh.triangles.slice(), bones, weights };
}

/** Where every mesh point is in a pose (linear blend skinning). Bones the rig no longer has leave points at rest. */
export function deformMesh(mesh: SkinMesh, st: RigState): number[] {
  const mats = mesh.bones.map((id) => st.get(id)?.skin);
  const out = new Array<number>(mesh.points.length);
  for (let v = 0, i = 0; i < mesh.points.length; v++, i += 2) {
    const x = mesh.points[i];
    const y = mesh.points[i + 1];
    const w = mesh.weights[v] ?? [];
    let ox = 0;
    let oy = 0;
    let used = 0;
    for (let k = 0; k < w.length; k += 2) {
      const m = mats[w[k]];
      const wt = w[k + 1];
      if (!m || !(wt > 0)) continue;
      ox += wt * (m[0] * x + m[2] * y + m[4]);
      oy += wt * (m[1] * x + m[3] * y + m[5]);
      used += wt;
    }
    const rest = 1 - used;
    out[i] = ox + rest * x;
    out[i + 1] = oy + rest * y;
  }
  return out;
}

/** The affine map taking triangle `src` onto `dst` (both [x0, y0, x1, y1, x2, y2]), or null for a flat triangle. */
export function triangleTransform(src: ArrayLike<number>, dst: ArrayLike<number>): Mat | null {
  const x0 = src[0], y0 = src[1], x1 = src[2], y1 = src[3], x2 = src[4], y2 = src[5];
  const det = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (v0: number, v1: number, v2: number) => [
    (v0 * (y1 - y2) - v1 * (y0 - y2) + v2 * (y0 - y1)) / det,
    (x0 * (v1 - v2) - x1 * (v0 - v2) + x2 * (v0 - v1)) / det,
    (x0 * (y1 * v2 - y2 * v1) - x1 * (y0 * v2 - y2 * v0) + x2 * (y0 * v1 - y1 * v0)) / det,
  ];
  const [a, c, e] = solve(dst[0], dst[2], dst[4]);
  const [b, d, f] = solve(dst[1], dst[3], dst[5]);
  return [a, b, c, d, e, f];
}

/** Where a posed point was at rest, through the mesh triangle it lands in (undefined when it's off the mesh). */
export function unposeOnMesh(mesh: SkinMesh, posed: number[], p: Pt): Pt | undefined {
  const t = mesh.triangles;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 2, b = t[k + 1] * 2, c = t[k + 2] * 2;
    const ax = posed[a], ay = posed[a + 1], bx = posed[b], by = posed[b + 1], cx = posed[c], cy = posed[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const l1 = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / det;
    const l2 = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const m = mesh.points;
    return { x: l1 * m[a] + l2 * m[b] + l3 * m[c], y: l1 * m[a + 1] + l2 * m[b + 1] + l3 * m[c + 1] };
  }
  return undefined;
}

// ---------------------------------------------------------------- making bones

/** A bone from `a` to `b`. */
export function boneBetween(id: Id, name: string, a: Pt, b: Pt, parent: Id | null): Bone {
  return { id, name, parent, x: a.x, y: a.y, angle: angleOf(b.x - a.x, b.y - a.y), length: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
}

/** The bone's tip at rest. */
export function restTip(b: Bone): Pt {
  return { x: b.x + Math.cos(b.angle * RAD) * b.length, y: b.y + Math.sin(b.angle * RAD) * b.length };
}
