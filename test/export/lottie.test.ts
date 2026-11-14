import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape } from '../../src/core/format';
import { newDoc, newPixelDrawing, uid } from '../../src/core/doc';
import { makeSymbol } from '../../src/core/symbols';
import { ease } from '../../src/core/ease';
import { activeCamera, cameraViewOn, depthAnchor, depthScale, newCameraLayer, parallaxFactor, setCameraKey } from '../../src/core/camera';
import { docToLottie, exactEase, lottieColor, lottiePath } from '../../src/export/lottie';
import { makeBouncingLogo } from '../../src/templates/bouncing-logo';
import { makeCameraPan } from '../../src/templates/camera-pan';
import { addPixelLayer, addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

/** y of a CSS-style cubic bezier at x, by bisection. */
function bezierY(e: { o: { x: number[]; y: number[] }; i: { x: number[]; y: number[] } }, x: number): number {
  const [x1, y1, x2, y2] = [e.o.x[0], e.o.y[0], e.i.x[0], e.i.y[0]];
  const at = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (at(m, x1, x2) < x) lo = m;
    else hi = m;
  }
  return at((lo + hi) / 2, y1, y2);
}

type Key = { t: number; s: number[]; h?: number; o?: { y: number[] }; i?: { y: number[] } };

/** What a player makes of a track at frame `t` (the bezier's x handles sit at a third and two thirds, so its parameter is time). */
function playAt(track: { a: number; k: Key[] | number | number[] }, t: number): number[] {
  if (!track.a) return Array.isArray(track.k) ? (track.k as number[]) : [track.k as number];
  const ks = track.k as Key[];
  let n = 0;
  while (n < ks.length - 2 && ks[n + 1].t <= t) n++;
  const a = ks[n];
  const b = ks[n + 1];
  if (!b || a.h) return a.s;
  const u = (t - a.t) / (b.t - a.t);
  const g = 3 * (1 - u) * (1 - u) * u * a.o!.y[0] + 3 * (1 - u) * u * u * a.i!.y[0] + u ** 3;
  return a.s.map((v, c) => v + (b.s[c] - v) * g);
}

function movingDoc(easeName: 'easeInOut' | 'bounceOut' | 'linear'): Doc {
  const doc = newDoc({ width: 200, height: 100, length: 10 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Mover');
  const d = vectorDrawing(doc, [fill([rectPath(0, 0, 10, 10)], '#ff0000')]);
  makeSymbol(doc, d.id, [d.shapes[0].id], { x: 5, y: 5 }, 'Box');
  const inst = d.shapes[0] as InstanceShape;
  const end = vectorDrawing(doc, []);
  end.shapes = [{ ...inst, id: uid('s'), transform: { ...inst.transform, x: 105, rotation: 90 } }];
  hold(l, d.id, 0, 8);
  hold(l, end.id, 8, 2);
  l.cels[0].tween = { ease: easeName };
  return doc;
}

describe('Lottie export', () => {
  it('writes colours and paths the Lottie way', () => {
    expect(lottieColor('#ff000080')).toEqual({ rgb: [1, 0, 0], alpha: 128 / 255 });
    const p = lottiePath({ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 3, y: -5 }, c2: { x: 7, y: -5 } }, { x: 10, y: 10 }] });
    expect(p.v).toEqual([[0, 0], [10, 0], [10, 10]]);
    // The curve into point 1 leaves point 0 towards (3, -5) and arrives at point 1 from (7, -5).
    expect(p.o[0]).toEqual([3, -5]);
    expect(p.i[1]).toEqual([-3, -5]);
    expect(p.c).toBe(true);
  });

  it('exact easings match Frameling\'s own curves', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'backIn', 'backOut'] as const) {
      const [[, e]] = exactEase(name)!;
      for (const x of [0.1, 0.3, 0.5, 0.8]) expect(bezierY(e, x)).toBeCloseTo(ease(name, x), 4);
    }
    const halves = exactEase('easeInOut')!;
    expect(halves.map(([at]) => at)).toEqual([0, 0.5]);
    expect(exactEase('bounceOut')).toBeNull();
    expect(exactEase([0.1, 0.2, 0.3, 0.4])).toEqual([[0, { o: { x: [0.1], y: [0.2] }, i: { x: [0.3], y: [0.4] } }]]);
  });

  it('a symbol becomes a precomp and its classic tween two eased keys', () => {
    const lot = docToLottie(movingDoc('linear'));
    expect(lot.assets).toHaveLength(1);
    expect(lot.assets[0].nm).toBe('Box');
    const pre = lot.layers.find((l: any) => l.ty === 0 && l.ip === 0);
    expect(pre.refId).toBe(lot.assets[0].id);
    expect(pre.ks.p.a).toBe(1);
    expect(pre.ks.p.k.map((k: any) => k.t)).toEqual([0, 8]);
    expect(pre.ks.p.k[1].s).toEqual([105, 5]);
    expect(pre.ks.r.k[1].s).toEqual([90]);
    expect(pre.ks.p.k[0].o).toBeDefined();
    // Gentle start and stop is two halves, so three keys.
    const io = docToLottie(movingDoc('easeInOut')).layers.find((l: any) => l.ty === 0 && l.ip === 0);
    expect(io.ks.p.k.map((k: any) => k.t)).toEqual([0, 4, 8]);
    // Bouncy can't be written as a curve: a key for every frame.
    const b = docToLottie(movingDoc('bounceOut')).layers.find((l: any) => l.ty === 0 && l.ip === 0);
    expect(b.ks.p.k.length).toBeGreaterThanOrEqual(8);
  });

  it('layers are listed top first and keys show only on their frames', () => {
    const lot = docToLottie(makeBouncingLogo());
    const shapes = lot.layers.filter((l: any) => l.ty === 4 || l.ty === 0);
    expect(shapes.length).toBeGreaterThan(2);
    for (const l of lot.layers) {
      expect(l.ip).toBeGreaterThanOrEqual(0);
      expect(l.op).toBeLessThanOrEqual(lot.op);
    }
    // The stage colour is the bottom layer.
    expect(lot.layers[lot.layers.length - 1].ty).toBe(1);
    expect(docToLottie(makeBouncingLogo(), { transparent: true }).layers.some((l: any) => l.ty === 1)).toBe(false);
    // Unique layer numbers.
    const inds = lot.layers.map((l: any) => l.ind);
    expect(new Set(inds).size).toBe(inds.length);
  });

  it('clips and markers become markers; a range moves frames to start at 0', () => {
    const doc = movingDoc('linear');
    doc.clips = [{ id: 'c', name: 'slide', start: 2, end: 9, loop: true }];
    doc.markers = [{ id: 'm', name: 'hit', frame: 5 }];
    const lot = docToLottie(doc, { range: { start: 2, end: 9 } });
    expect(lot.op).toBe(8);
    expect(lot.markers).toEqual([
      { tm: 0, cm: 'slide', dr: 8 },
      { tm: 3, cm: 'hit', dr: 0 },
    ]);
  });

  it('pixel layers become crisp image assets', () => {
    const doc = newDoc({ width: 16, height: 16, length: 2 });
    doc.layers = [];
    const l = addPixelLayer(doc, 'Art', 4);
    const d = newPixelDrawing(4, 4);
    d.pixels.set([255, 0, 0, 255], 0);
    doc.drawings[d.id] = d;
    hold(l, d.id, 0, 2);
    const lot = docToLottie(doc);
    const img = lot.assets.find((a: any) => a.p?.startsWith('data:image/png;base64,'));
    expect(img).toMatchObject({ w: 16, h: 16, e: 1 });
    expect(lot.layers.find((x: any) => x.ty === 2).refId).toBe(img.id);
  });

  it('the camera is a null layer that the stage layers hang from', () => {
    const doc = movingDoc('linear');
    doc.layers[0].depth = 1;
    const { layer, drawing } = newCameraLayer(doc);
    doc.drawings[drawing.id] = drawing;
    doc.layers.push(layer);
    layer.cels[0].tween = { ease: 'linear' };
    setCameraKey(doc, layer, 5, { x: 120, y: 50, zoom: 2, rotation: 0 });
    const lot = docToLottie(doc);
    const nul = lot.layers.find((l: any) => l.ty === 3);
    expect(nul.nm).toContain('depth 1');
    expect(nul.ks.s.a).toBe(1);
    for (const l of lot.layers.filter((x: any) => x.ty === 0 || x.ty === 4)) expect(l.parent).toBe(nul.ind);
  });

  it('camera tracks are a few eased keys, not one per frame, and play the same', () => {
    const doc = makeCameraPan();
    const lot = docToLottie(doc);
    const nuls = lot.layers.filter((l: any) => l.ty === 3);
    expect(nuls.length).toBeGreaterThan(1);
    const views = Array.from({ length: doc.length }, (_, f) => cameraViewOn(doc, activeCamera(doc)!, f)!);
    for (const nul of nuls) {
      const depth = Number(/depth (\d+)/.exec(nul.nm)?.[1] ?? 0);
      const fac = parallaxFactor(depth);
      // The anchor and the zoom are written as fewer than a third of the frames each.
      expect(nul.ks.a.k.length).toBeLessThan(doc.length / 3);
      expect(nul.ks.s.k.length).toBeLessThan(doc.length / 3);
      const reach = Math.hypot(doc.width, doc.height) / 2;
      views.forEach((v, f) => {
        const an = depthAnchor(doc, v, fac);
        const a = playAt(nul.ks.a, f);
        // What shows on screen: the anchor times the zoom, the zoom's share at the far edge, the turn at the far edge.
        expect(Math.hypot(a[0] - an.x, a[1] - an.y) * depthScale(v, fac)).toBeLessThan(0.25);
        expect((Math.abs(playAt(nul.ks.s, f)[0] - depthScale(v, fac) * 100) / 100) * reach).toBeLessThan(0.25);
        expect(((Math.abs(playAt(nul.ks.r, f)[0] + v.rotation) * Math.PI) / 180) * reach).toBeLessThan(0.25);
      });
    }
  });

  it('a camera that holds still stays a plain value', () => {
    const doc = movingDoc('linear');
    const { layer, drawing } = newCameraLayer(doc);
    doc.drawings[drawing.id] = drawing;
    doc.layers.push(layer);
    const nul = docToLottie(doc).layers.find((l: any) => l.ty === 3);
    expect(nul.ks.a.a).toBe(0);
    expect(nul.ks.s.a).toBe(0);
    expect(nul.ks.r.a).toBe(0);
  });
});
