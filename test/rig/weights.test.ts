import { beforeEach, describe, expect, it } from 'vitest';
import type { Rig, SkinMesh } from '../../src/core/format';
import { boneBetween, deformMesh, gridMesh, rigState, skinMesh } from '../../src/rig/math';
import { boneWeights, brushFalloff, denseWeights, heatColour, meshNeighbours, normaliseWeights, paintWeights, smoothWeights, withBone } from '../../src/rig/weights';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { normaliseActive, paintTarget, setLayerMesh } from '../../src/rig/weightsTool';

const close = (a: number, b: number, eps = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(eps);

/** A bar 0..100 along y = 0 with two bones, and a mesh over it. */
function bar(): { rig: Rig; mesh: SkinMesh } {
  const rig: Rig = { bones: [boneBetween('u', 'Upper', { x: 0, y: 0 }, { x: 50, y: 0 }, null), boneBetween('l', 'Lower', { x: 50, y: 0 }, { x: 100, y: 0 }, 'u')] };
  return { rig, mesh: skinMesh(rig, gridMesh({ x: 0, y: -10, w: 100, h: 20 }, 10)) };
}

const sums = (m: SkinMesh) => denseWeights(m).map((r) => r.reduce((a, x) => a + x, 0));

describe('painting how much it bends', () => {
  it('a soft brush: full in the middle, nothing at the edge', () => {
    expect(brushFalloff(0, 10)).toBe(1);
    expect(brushFalloff(10, 10)).toBe(0);
    expect(brushFalloff(5, 10)).toBeGreaterThan(0.4);
    expect(brushFalloff(5, 10)).toBeLessThan(0.6);
  });

  it('more makes the picked bone pull harder, only under the brush, and every point still adds up to 1', () => {
    const { rig, mesh } = bar();
    const before = boneWeights(mesh, 'l');
    const out = paintWeights(mesh, rig, 'l', mesh.points, { at: { x: 30, y: 0 }, radius: 12, strength: 0.8, mode: 'more' });
    const after = boneWeights(out, 'l');
    let raised = 0;
    for (let v = 0; v < before.length; v++) {
      const d = Math.hypot(mesh.points[v * 2] - 30, mesh.points[v * 2 + 1]);
      if (d >= 12) close(after[v], before[v]);
      else if (after[v] > before[v] + 1e-3) raised++;
    }
    expect(raised).toBeGreaterThan(0);
    for (const s of sums(out)) close(s, 1);
    // The original is left alone (undo compares by reference).
    expect(boneWeights(mesh, 'l')).toEqual(before);
  });

  it('less hands the pull to the other bones; painting a bone to nothing leaves its neighbour fully in charge', () => {
    const { rig, mesh } = bar();
    let m = mesh;
    for (let i = 0; i < 30; i++) m = paintWeights(m, rig, 'l', m.points, { at: { x: 100, y: 0 }, radius: 20, strength: 1, mode: 'less' });
    const end = mesh.points.findIndex((_, i) => i % 2 === 0 && mesh.points[i] === 100 && mesh.points[i + 1] === 0) / 2;
    close(boneWeights(m, 'l')[end], 0, 1e-3);
    close(boneWeights(m, 'u')[end], 1, 1e-3);
    // And now the end follows the upper bone only: bend the lower one and it stays.
    const st = rigState(rig, { l: { r: 40 } });
    const posed = deformMesh(m, st);
    close(posed[end * 2], 100, 0.2);
    close(posed[end * 2 + 1], 0, 0.2);
  });

  it('smooth evens out a sudden change between neighbours', () => {
    const { rig, mesh } = bar();
    const nb = meshNeighbours(mesh);
    const jump = (m: SkinMesh) => {
      const w = boneWeights(m, 'u');
      let worst = 0;
      nb.forEach((list, v) => list.forEach((u) => (worst = Math.max(worst, Math.abs(w[v] - w[u])))));
      return worst;
    };
    const smoothed = smoothWeights(smoothWeights(mesh, rig), rig);
    expect(jump(smoothed)).toBeLessThan(jump(mesh));
    for (const s of sums(smoothed)) close(s, 1);
    const brushed = paintWeights(mesh, rig, 'u', mesh.points, { at: { x: 50, y: 0 }, radius: 30, strength: 1, mode: 'smooth' });
    expect(jump(brushed)).toBeLessThanOrEqual(jump(mesh) + 1e-9);
  });

  it('normalising fixes points whose weights stopped adding up to 1', () => {
    const { rig, mesh } = bar();
    const broken = { ...mesh, weights: mesh.weights.map((w, i) => (i === 0 ? [] : w.map((x, k) => (k % 2 ? x * 0.5 : x)))) };
    const fixed = normaliseWeights(broken, rig);
    for (const s of sums(fixed)) close(s, 1);
    // The empty point goes to its nearest bone.
    expect(boneWeights(fixed, 'u')[0]).toBe(1);
  });

  it('a bone drawn after bending is added to the mesh when it is painted', () => {
    const { rig, mesh } = bar();
    const extra = boneBetween('x', 'Extra', { x: 100, y: 0 }, { x: 120, y: 0 }, 'l');
    const rig2 = { bones: [...rig.bones, extra] };
    expect(withBone(mesh, 'u')).toBe(mesh);
    const out = paintWeights(mesh, rig2, 'x', mesh.points, { at: { x: 100, y: 0 }, radius: 10, strength: 1, mode: 'more' });
    expect(out.bones).toContain('x');
    expect(Math.max(...boneWeights(out, 'x'))).toBeGreaterThan(0.5);
  });

  it('the heat map runs from blue to red', () => {
    const [r0, , b0] = heatColour(0);
    const [r1, , b1] = heatColour(1);
    expect(b0).toBeGreaterThan(r0);
    expect(r1).toBeGreaterThan(b1);
  });
});

describe('painting in the document', () => {
  beforeEach(() => {
    const doc = newDoc({ width: 200, height: 200, length: 4 });
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
    const { rig, mesh } = bar();
    const rd = newVectorDrawing();
    doc.drawings[rd.id] = rd;
    doc.layers.push({ id: 'R', name: 'Bones', kind: 'vector', visible: true, locked: false, opacity: 1, rig, cels: [{ id: 'c2', start: 0, length: 4, drawingId: rd.id }] });
    doc.layers[0].bind = { rig: 'R', bone: 'u', mesh };
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id });
  });

  it('finds the bending layer, and a stroke is one undo step', () => {
    const t = paintTarget()!;
    expect(t.rig.id).toBe('R');
    const before = t.layer.bind.mesh;
    const m1 = paintWeights(before, t.rig.rig, 'l', before.points, { at: { x: 20, y: 0 }, radius: 10, strength: 1, mode: 'more' });
    setLayerMesh(t.layer.id, m1, 'Paint bending', 'weights-1');
    const m2 = paintWeights(m1, t.rig.rig, 'l', m1.points, { at: { x: 30, y: 0 }, radius: 10, strength: 1, mode: 'more' });
    setLayerMesh(t.layer.id, m2, 'Paint bending', 'weights-1');
    expect(paintTarget()!.layer.bind.mesh).toEqual(m2);
    store().undo();
    expect(paintTarget()!.layer.bind.mesh).toEqual(before);
    expect(normaliseActive()).toBeUndefined();
  });
});
