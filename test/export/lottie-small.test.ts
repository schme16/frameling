import { describe, expect, it } from 'vitest';
import { newDoc, uid } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { strokeOutline } from '../../src/core/render';
import { docToLottie, smoothTrack } from '../../src/export/lottie';
import { newParticles } from '../../src/particles/model';
import { fitClosed, sampleMidpointSpline, type Cubic, type Pt } from '../../src/export/curve-fit';
import { addVectorLayer, fill, hold, rectPath, stroke, vectorDrawing } from '../../src/templates/build';

const wavy = (n: number, dy = 0): [number, number][] => Array.from({ length: n }, (_, i) => [100 + (i / (n - 1)) * 300, 150 + dy - Math.sin((i / (n - 1)) * Math.PI) * 80] as [number, number]);

/** Distance from `p` to the closed polyline `poly`. */
function near(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

function flatten(cs: Cubic[]): Pt[] {
  const out: Pt[] = [];
  for (const c of cs)
    for (let i = 0; i < 100; i++) {
      const t = i / 100;
      const s = 1 - t;
      out.push([0, 1].map((k) => s ** 3 * c[0][k] + 3 * s * s * t * c[1][k] + 3 * s * t * t * c[2][k] + t ** 3 * c[3][k]) as Pt);
    }
  return out;
}

describe('Lottie export, smaller files', () => {
  it('a refitted brush outline stays within the tolerance with far fewer points', () => {
    const s = stroke(wavy(60), '#000000', 14);
    const o = strokeOutline(s);
    const dense = sampleMidpointSpline(o, 0.2, 5000);
    const cubics = fitClosed(sampleMidpointSpline(o, 0.75, 400), 0.05);
    expect(cubics.length).toBeGreaterThan(3);
    expect(cubics.length).toBeLessThan(o.length / 2);
    const fit = flatten(cubics);
    for (const p of dense) expect(near(p, fit)).toBeLessThan(0.08);
    // Handles are continuous where the curve closes.
    const first = cubics[0];
    const last = cubics[cubics.length - 1];
    expect(last[3]).toEqual(first[0]);
  });

  it('writes path numbers to two decimals and brush strokes with fewer vertices', () => {
    const doc = newDoc({ width: 500, height: 300, length: 1 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Line');
    const d = vectorDrawing(doc, [stroke(wavy(60), '#000000', 14)]);
    hold(l, d.id, 0, 1);
    const data = docToLottie(doc);
    const path = data.layers[0].shapes[0].it[0].ks.k;
    expect(path.v.length).toBeLessThan(strokeOutline(d.shapes[0] as never).length / 2);
    for (const n of JSON.stringify(path).match(/-?\d+\.\d+/g) ?? []) expect(n.split('.')[1].length).toBeLessThanOrEqual(2);
  });

  it('different drawings stay separate layers, each refitted on its own', () => {
    const doc = newDoc({ width: 500, height: 300, length: 2 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Line');
    hold(l, vectorDrawing(doc, [stroke(wavy(40), '#000000', 14)]).id, 0, 1);
    hold(l, vectorDrawing(doc, [stroke(wavy(40, 30), '#000000', 14)]).id, 1, 1);
    const data = docToLottie(doc);
    expect(data.layers.filter((x: { ty: number }) => x.ty === 4)).toHaveLength(2);
  });

  function repeats(big: boolean): Doc {
    const doc = newDoc({ width: 500, height: 300, length: 6 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Cycle');
    const a = vectorDrawing(doc, big ? [stroke(wavy(80), '#000000', 14), stroke(wavy(60, 40), '#aa0000', 10)] : [fill([rectPath(0, 0, 10, 10)], '#ff0000')]);
    const b = vectorDrawing(doc, [fill([rectPath(0, 0, 20, 20)], '#00ff00')]);
    hold(l, a.id, 0, 2);
    hold(l, b.id, 2, 2);
    hold(l, a.id, 4, 2);
    return doc;
  }

  it('a drawing used in several keys is written once and the keys point at it', () => {
    const data = docToLottie(repeats(true));
    expect(data.assets).toHaveLength(1);
    const id = data.assets[0].id;
    const uses = data.layers.filter((x: { refId?: string }) => x.refId === id);
    expect(uses.map((x: { ip: number; op: number }) => [x.ip, x.op])).toEqual([[4, 6], [0, 2]]);
    // The precomp shows its first frame whenever it starts.
    for (const u of uses) expect(u.st).toBe(u.ip);
  });

  it('a small drawing is repeated as it is, since a precomp would cost more', () => {
    const data = docToLottie(repeats(false));
    expect(data.assets).toHaveLength(0);
    expect(data.layers.filter((x: { ty: number }) => x.ty === 4)).toHaveLength(3);
  });

  it('a held drawing is one layer for its whole run', () => {
    const doc = newDoc({ width: 500, height: 300, length: 12 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Hold');
    hold(l, vectorDrawing(doc, [stroke(wavy(30), '#000000', 14)]).id, 0, 12);
    const data = docToLottie(doc);
    const shapes = data.layers.filter((x: { ty: number }) => x.ty === 4);
    expect(shapes).toHaveLength(1);
    expect([shapes[0].ip, shapes[0].op]).toEqual([0, 12]);
    expect(shapes[0].shapes[0].it[0].ks.a).toBe(0);
  });

  /** What a player makes of a track at frame `t`: the key before it and its easing (x handles at a third and two thirds). */
  function playAt(track: { k: { t: number; s: number[]; h?: number; o?: { y: number[] }; i?: { y: number[] } }[] }, t: number): number[] {
    const ks = track.k;
    let n = 0;
    while (n < ks.length - 2 && ks[n + 1].t <= t) n++;
    const a = ks[n];
    const b = ks[n + 1];
    if (!b || a.h) return a.s;
    const u = (t - a.t) / (b.t - a.t);
    const [y1, y2] = [a.o!.y[0], a.i!.y[0]];
    // x is a third and two thirds, so the bezier's parameter is time itself.
    const g = 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
    return a.s.map((v, c) => v + (b.s[c] - v) * g);
  }

  it('a motion that slows down needs a few eased keys instead of one per frame, within the tolerance', () => {
    const times = Array.from({ length: 24 }, (_, i) => i);
    // Drag: fast at first, then easing to a stop. x and y share one timing.
    const values = times.map((t) => [256 + 180 * (1 - Math.exp(-t / 6)), 300 - 90 * (1 - Math.exp(-t / 6))]);
    const tr = smoothTrack(values, times, 0.25);
    expect(tr.k.length).toBeLessThanOrEqual(4);
    for (const t of times) {
      const v = playAt(tr, t);
      expect(Math.abs(v[0] - values[t][0])).toBeLessThanOrEqual(0.26);
      expect(Math.abs(v[1] - values[t][1])).toBeLessThanOrEqual(0.26);
    }
  });

  it('an eased key never overshoots its neighbours, so an opacity cannot go below zero between frames', () => {
    const times = [0, 1, 2, 3, 4, 5, 6, 7];
    const values = [0.748, 0.55, 0.31, 0.12, 0.02, 0, 0, 0];
    const tr = smoothTrack(values, times, 0.5);
    for (let t = 0; t <= 7; t += 0.25) for (const v of playAt(tr, t)) expect(v).toBeGreaterThanOrEqual(-1e-9);
    // A track that never changes is not animated at all.
    expect(smoothTrack([5, 5, 5], [0, 1, 2], 0.5)).toEqual({ a: 0, k: 5 });
  });

  it('rain streaks are drawn along their own axis and the group carries the position', () => {
    const doc = newDoc({ width: 400, height: 300, length: 8, fps: 12 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Rain');
    const d = vectorDrawing(doc, []);
    d.shapes = [{ ...newParticles(uid('s'), 'rain', { x: 200, y: 10 }), width: 400, rate: 40 }] as never;
    hold(l, d.id, 0, 8);
    const groups = docToLottie(doc).layers[0].shapes;
    expect(groups.length).toBeGreaterThan(5);
    for (const g of groups) {
      const path = g.it[0].ks.k;
      const first = Array.isArray(path) ? path[0].s[0] : path;
      // Every streak starts at its origin and runs back along x; the position and angle live in the transform.
      expect(first.v[0]).toEqual([0, 0]);
      expect(first.v[1][1]).toBe(0);
      expect(first.v[1][0]).toBeLessThan(0);
      expect(g.it.find((x: { ty: string }) => x.ty === 'tr').p).toBeDefined();
    }
  });
});
