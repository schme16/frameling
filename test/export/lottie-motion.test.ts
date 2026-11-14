import { describe, expect, it } from 'vitest';
import { newDoc, uid } from '../../src/core/doc';
import { docToLottie, positionTrack, rigidMoves, smoothTrack, type ShapeLook } from '../../src/export/lottie';
import { newParticles } from '../../src/particles/model';
import { TEMPLATES } from '../../src/templates';
import { addVectorLayer, hold, vectorDrawing } from '../../src/templates/build';

type Key = { t: number; s: number[]; h?: number; o?: { y: number[] }; i?: { y: number[] } };

/** What a player makes of a track at frame `t` (x handles at a third and two thirds, so the bezier parameter is time). */
function playAt(track: { a: number; k: Key[] | number | number[] }, t: number): number[] {
  if (!track.a) return Array.isArray(track.k) ? (track.k as number[]) : [track.k as number];
  const ks = track.k as Key[];
  let n = 0;
  while (n < ks.length - 2 && ks[n + 1].t <= t) n++;
  const a = ks[n];
  const b = ks[n + 1];
  if (!b || a.h) return a.s;
  const u = (t - a.t) / (b.t - a.t);
  const [y1, y2] = [a.o!.y[0], a.i!.y[0]];
  const g = 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
  return a.s.map((v, c) => v + (b.s[c] - v) * g);
}

const keys = (t: { a: number; k: unknown }) => (t.a ? (t.k as Key[]).length : 0);

describe('Lottie export, motion', () => {
  const times = Array.from({ length: 36 }, (_, i) => i);
  // Drag sideways (fast, then slow) and gravity down (slow, then fast): two timings.
  const drag = times.map((t) => [60 + 300 * (1 - Math.exp(-t / 5)), 40 + 0.5 * 0.9 * t * t]);

  it('a position whose x and y keep their own timing is written as separate x and y tracks, within the tolerance', () => {
    const p = positionTrack(drag, times, 0.25);
    expect(p.s).toBe(true);
    const joint = smoothTrack(drag, times, 0.25);
    expect(keys(p.x) + keys(p.y)).toBeLessThan(keys(joint));
    expect(JSON.stringify(p).length).toBeLessThan(JSON.stringify(joint).length * 0.85);
    for (const t of times) {
      expect(Math.abs(playAt(p.x, t)[0] - drag[t][0])).toBeLessThanOrEqual(0.25 + 1e-6);
      expect(Math.abs(playAt(p.y, t)[0] - drag[t][1])).toBeLessThanOrEqual(0.25 + 1e-6);
    }
  });

  it('a position that moves in a straight line, or not at all, stays one track', () => {
    const line = times.map((t) => [10 + 3 * t, 20 + 2 * t]);
    expect(positionTrack(line, times, 0.25).s).toBeUndefined();
    const still = times.map(() => [5, 6]);
    expect(positionTrack(still, times, 0.25)).toEqual({ a: 0, k: [5, 6] });
  });

  it('particles with drag and gravity move in two nested groups (sideways outside, up and down inside)', () => {
    const doc = newDoc({ width: 400, height: 300, length: 36, fps: 12 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Sparks');
    const p = { ...newParticles(uid('s'), 'confetti', { x: 60, y: 200 }), burst: 8, life: 3, speed: 300, direction: -30, spread: 20, drag: 2.5, gravity: 500, variance: 0.1 };
    const d = vectorDrawing(doc, []);
    d.shapes = [p];
    hold(l, d.id, 0, 36);
    const data = docToLottie(doc);
    const groups: { it: { ty: string; nm?: string; it?: { ty: string }[]; p?: { a: number } }[] }[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        const g = o as { ty?: string; it?: { nm?: string }[] };
        if (g.ty === 'gr' && g.it?.[0]?.nm === 'Move') groups.push(g as never);
        Object.values(o).forEach(walk);
      }
    };
    walk(data.layers);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      // The outer group ends in its transform, which only moves along x.
      expect(g.it).toHaveLength(2);
      expect(g.it[1].ty).toBe('tr');
      expect(g.it[0].it!.at(-1)!.ty).toBe('tr');
      const outer = g.it[1].p as unknown as { a: number; k: Key[] };
      const inner = (g.it[0].it!.at(-1) as unknown as { p: { a: number; k: Key[] } }).p;
      for (const t of [0, 7, 20, 35]) {
        expect(playAt(outer, t)[1]).toBe(0);
        expect(playAt(inner, t)[0]).toBe(0);
      }
    }
  });

  /** A shape's one path (a thin bar) turned and carried like a limb: x' = cos*x - sin*y + tx. */
  const bar = (deg: number, tx: number, ty: number, scale = 1) => {
    const c = Math.cos((deg * Math.PI) / 180) * scale;
    const s = Math.sin((deg * Math.PI) / 180) * scale;
    const pts = [[0, 0], [60, 0], [60, 12], [0, 12]];
    const v = pts.map(([x, y]) => [Math.round((c * x - s * y + tx) * 100) / 100, Math.round((s * x + c * y + ty) * 100) / 100]);
    const rot = (h: number[]) => [Math.round((c * h[0] - s * h[1]) * 100) / 100, Math.round((s * h[0] + c * h[1]) * 100) / 100];
    return { c: true, v, i: pts.map(() => rot([0, 0])), o: pts.map(() => rot([0, 0])) };
  };
  const look = (path: ReturnType<typeof bar>, stroke = false): ShapeLook => ({ paths: [path], fill: { rgb: [1, 0, 0], o: 100 }, stroke: stroke ? { rgb: [0, 0, 0], o: 100, w: 4, lc: 2, lj: 2 } : null });

  it('a part that only turns and shifts is one path with an animated group transform that lands on every frame', () => {
    const angles = Array.from({ length: 12 }, (_, i) => -30 + i * 6);
    const looks = angles.map((a, i) => look(bar(a, 200 + i * 2, 100 - i)));
    const moved = rigidMoves(looks)!;
    expect(moved).not.toBeNull();
    // The path is the first frame's on every frame.
    for (const m of moved) expect(m.paths).toEqual(looks[0].paths);
    moved.forEach((m, f) => {
      const tr = m.tr!;
      const c = Math.cos((tr.r * Math.PI) / 180) * (tr.s[0] / 100);
      const s = Math.sin((tr.r * Math.PI) / 180) * (tr.s[0] / 100);
      looks[f].paths[0].v.forEach((want: number[], j: number) => {
        const [x, y] = looks[0].paths[0].v[j].map((q: number, k: number) => q - tr.a![k]);
        const got = [c * x - s * y + tr.p[0], s * x + c * y + tr.p[1]];
        expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(0.1);
      });
    });
  });

  it('is left alone when the points really change, or a line would be scaled', () => {
    const squash = [0, 1, 2, 3, 4].map((i) => look(bar(0, 0, 0)));
    squash[2] = look({ ...bar(0, 0, 0), v: [[0, 0], [60, 0], [60, 30], [0, 30]] });
    expect(rigidMoves(squash)).toBeNull();
    const grow = [0, 1, 2, 3].map((i) => look(bar(10 * i, 0, 0, 1 + i * 0.2), true));
    expect(rigidMoves(grow)).toBeNull();
    // Without a line, the same growth is a scale of the group.
    const grow2 = [0, 1, 2, 3].map((i) => look(bar(10 * i, 0, 0, 1 + i * 0.2)));
    expect(rigidMoves(grow2)!.map((m) => m.tr!.s[0])).toEqual([100, 120, 140, 160].map((v) => expect.closeTo(v, 0)));
    // Held still, or only two frames: nothing to gain.
    expect(rigidMoves([look(bar(0, 0, 0)), look(bar(0, 0, 0)), look(bar(0, 0, 0))])).toBeNull();
    expect(rigidMoves([look(bar(0, 0, 0)), look(bar(30, 0, 0))])).toBeNull();
  });

  it('the paper doll puppet is bone parts with still paths and a small file', () => {
    const doc = TEMPLATES.find((t) => t.id === 'puppet')!.make();
    const data = docToLottie(doc);
    const shin = data.layers.find((x: { nm: string }) => x.nm === 'Left shin');
    const all: { ty: string; ks?: { a: number }; r?: { a: number } }[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        const x = o as { ty?: string };
        if (x.ty === 'sh' || x.ty === 'tr') all.push(x as never);
        Object.values(o).forEach(walk);
      }
    };
    walk(shin.shapes);
    expect(all.find((x) => x.ty === 'sh')!.ks!.a).toBe(0);
    expect(all.some((x) => x.ty === 'tr' && x.r?.a === 1)).toBe(true);
    expect(JSON.stringify(data).length).toBeLessThan(90000);
  });
});
