/**
 * Painting how much each part of a bent layer follows each bone (weight painting), as pure maths on a SkinMesh: a
 * soft round brush that adds or takes away one bone's pull, smoothing, and normalising so every point's weights add
 * up to 1. Every function returns a new mesh (or the same one when nothing changed), so undo can compare them.
 */
import type { Id, Rig, SkinMesh } from '../core/format';
import { distanceToSegment, rigState, type Pt } from './math';

/** Weights per point as dense rows, one number per mesh bone. */
export function denseWeights(mesh: SkinMesh): number[][] {
  const n = mesh.bones.length;
  return mesh.weights.map((w) => {
    const row = new Array<number>(n).fill(0);
    for (let k = 0; k < w.length; k += 2) if (w[k] >= 0 && w[k] < n) row[w[k]] += w[k + 1];
    return row;
  });
}

/** Dense rows back to flat pairs, dropping the tiny ones (what they held goes to the rest, so totals stay the same). */
export function sparseWeights(rows: number[][], floor = 0.002): number[][] {
  return rows.map((row) => {
    const total = row.reduce((a, x) => a + x, 0);
    const kept = row.reduce((a, x) => a + (x > floor ? x : 0), 0);
    const k = kept > 0 ? total / kept : 1;
    const out: number[] = [];
    row.forEach((v, i) => {
      if (v > floor) out.push(i, Math.round(v * k * 1e6) / 1e6);
    });
    return out;
  });
}

/** How much a bone pulls each point (0 to 1). */
export function boneWeights(mesh: SkinMesh, boneId: Id): number[] {
  const bi = mesh.bones.indexOf(boneId);
  return mesh.weights.map((w) => {
    let s = 0;
    for (let k = 0; k < w.length; k += 2) if (w[k] === bi) s += w[k + 1];
    return s;
  });
}

/** The mesh with `boneId` in its bone list (painting a bone drawn after the layer started bending). */
export function withBone(mesh: SkinMesh, boneId: Id): SkinMesh {
  return mesh.bones.includes(boneId) ? mesh : { ...mesh, bones: [...mesh.bones, boneId] };
}

/** A soft round brush: 1 in the middle, easing to 0 at the edge. */
export function brushFalloff(d: number, radius: number): number {
  if (radius <= 0 || d >= radius) return 0;
  const t = d / radius;
  return (1 - t * t) * (1 - t * t);
}

/** Each point's neighbours along triangle edges. */
export function meshNeighbours(mesh: SkinMesh): number[][] {
  const n = mesh.points.length / 2;
  const sets = Array.from({ length: n }, () => new Set<number>());
  const t = mesh.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((s) => [...s]);
}

/**
 * Rows scaled so each adds up to 1, keeping `keep` (a bone index) where it was set when it can. A point with no weight
 * left at all goes to `fallback` for that point.
 */
function normaliseRows(rows: number[][], keep: number | null, fallback: (v: number) => number): void {
  rows.forEach((row, v) => {
    for (let i = 0; i < row.length; i++) row[i] = Math.max(0, Math.min(1, row[i]));
    const total = row.reduce((a, x) => a + x, 0);
    if (keep !== null) {
      const mine = row[keep];
      const others = total - mine;
      if (others > 1e-9) {
        const k = (1 - mine) / others;
        for (let i = 0; i < row.length; i++) if (i !== keep) row[i] *= k;
        return;
      }
      if (mine < 1 - 1e-9) {
        // Nothing else pulls this point: what's taken from this bone goes to the next one along.
        const f = fallback(v);
        if (f !== keep && f >= 0) row[f] = 1 - mine;
        else row[keep] = 1;
      }
      return;
    }
    if (total > 1e-9) for (let i = 0; i < row.length; i++) row[i] /= total;
    else {
      const f = fallback(v);
      if (f >= 0) row[f] = 1;
    }
  });
}

/** For each point, the nearest bone at rest other than `not` (as a mesh bone index), for weight taken away. */
function nearestOther(mesh: SkinMesh, rig: Rig, not: number | null): (v: number) => number {
  const st = rigState(rig);
  return (v) => {
    const p = { x: mesh.points[v * 2], y: mesh.points[v * 2 + 1] };
    let best = -1;
    let bd = Infinity;
    mesh.bones.forEach((id, i) => {
      if (i === not) return;
      const s = st.get(id);
      if (!s) return;
      const d = distanceToSegment(p, s.base, s.tip);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
}

export type BrushMode = 'more' | 'less' | 'smooth';

export interface Dab {
  /** Where the brush is, in the same space as `posed` (the stage, with the layer bent as you see it). */
  at: Pt;
  radius: number;
  /** 0 to 1: how much one dab does in the middle of the brush. */
  strength: number;
  mode: BrushMode;
}

/**
 * One dab of the brush. `posed` is where the mesh points are on screen, so the brush lands where it's seen.
 * More and less change the picked bone's pull and share what's left among the others; smooth evens out every bone.
 */
export function paintWeights(mesh: SkinMesh, rig: Rig, boneId: Id, posed: number[], dab: Dab): SkinMesh {
  const m = withBone(mesh, boneId);
  const bi = m.bones.indexOf(boneId);
  const rows = denseWeights(m);
  const n = rows.length;
  const hit: number[] = [];
  const fall: number[] = [];
  for (let v = 0; v < n; v++) {
    const f = brushFalloff(Math.hypot(posed[v * 2] - dab.at.x, posed[v * 2 + 1] - dab.at.y), dab.radius);
    if (f > 0) {
      hit.push(v);
      fall.push(f * Math.max(0, Math.min(1, dab.strength)));
    }
  }
  if (!hit.length) return mesh;
  if (dab.mode === 'smooth') {
    const nb = meshNeighbours(m);
    const before = rows.map((r) => r.slice());
    hit.forEach((v, j) => {
      if (!nb[v].length) return;
      for (let i = 0; i < rows[v].length; i++) {
        let avg = 0;
        for (const u of nb[v]) avg += before[u][i];
        avg /= nb[v].length;
        rows[v][i] += (avg - rows[v][i]) * fall[j];
      }
    });
    const near = nearestOther(m, rig, null);
    normaliseRows(hit.map((v) => rows[v]), null, (k) => near(hit[k]));
  } else {
    const other = nearestOther(m, rig, bi);
    const changed = hit.map((v, j) => {
      const row = rows[v];
      row[bi] = dab.mode === 'more' ? row[bi] + (1 - row[bi]) * fall[j] : row[bi] * (1 - fall[j]);
      return row;
    });
    normaliseRows(changed, bi, (k) => other(hit[k]));
  }
  return { ...m, weights: replaceRows(m.weights, sparseWeights(rows), hit) };
}

function replaceRows(old: number[][], fresh: number[][], which: number[]): number[][] {
  const out = old.slice();
  for (const v of which) out[v] = fresh[v];
  return out;
}

/** Every point's weights scaled to add up to 1 (points with none go to their nearest bone). */
export function normaliseWeights(mesh: SkinMesh, rig: Rig): SkinMesh {
  const rows = denseWeights(mesh);
  normaliseRows(rows, null, nearestOther(mesh, rig, null));
  return { ...mesh, weights: sparseWeights(rows) };
}

/** Evens out the whole mesh once: each point moves `amount` of the way toward its neighbours' average. */
export function smoothWeights(mesh: SkinMesh, rig: Rig, amount = 0.5): SkinMesh {
  const nb = meshNeighbours(mesh);
  const before = denseWeights(mesh);
  const rows = before.map((row, v) =>
    row.map((x, i) => {
      if (!nb[v].length) return x;
      let avg = 0;
      for (const u of nb[v]) avg += before[u][i];
      return x + (avg / nb[v].length - x) * amount;
    }),
  );
  normaliseRows(rows, null, nearestOther(mesh, rig, null));
  return { ...mesh, weights: sparseWeights(rows) };
}

/** A colour for a weight: deep blue for none, through green and yellow, to red for all of it. */
export function heatColour(w: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, w));
  const stops: [number, number, number, number][] = [
    [0, 48, 64, 170],
    [0.25, 40, 150, 230],
    [0.5, 60, 200, 120],
    [0.75, 250, 210, 60],
    [1, 235, 60, 50],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [b, ...hi] = stops[i];
    const [a, ...lo] = stops[i - 1];
    if (t <= b) {
      const u = (t - a) / (b - a);
      return [0, 1, 2].map((k) => Math.round(lo[k] + (hi[k] - lo[k]) * u)) as [number, number, number];
    }
  }
  return [235, 60, 50];
}
