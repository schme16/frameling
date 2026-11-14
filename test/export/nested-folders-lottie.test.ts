// Folders inside folders in Lottie: each folder is its own precomposition inside its parent's, with its own fade.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { docToLottie } from '../../src/export/lottie';
import { addVectorLayer, ellipsePath, fill, hold, vectorDrawing } from '../../src/templates/build';

/** A in Outer (50 percent), B0 and B1 in Inner (50 percent) which sits in Outer. */
function make(): Doc {
  const doc = newDoc({ width: 200, height: 100, length: 2 });
  doc.layers = [];
  doc.folders = { o: { id: 'o', name: 'Outer', visible: true, opacity: 0.5 }, i: { id: 'i', name: 'Inner', visible: true, opacity: 0.5, parent: 'o' } };
  const a = addVectorLayer(doc, 'A');
  a.folder = 'o';
  hold(a, vectorDrawing(doc, [fill([ellipsePath(50, 50, 30, 30)], '#ff0000')]).id, 0, 2);
  for (const [k, c] of ['#00ff00', '#0000ff'].entries()) {
    const l = addVectorLayer(doc, 'B' + k);
    l.folder = 'i';
    hold(l, vectorDrawing(doc, [fill([ellipsePath(50 + k * 20, 50, 30, 30)], c)]).id, 0, 2);
  }
  return doc;
}

const comp = (data: any, id: string) => data.assets.find((a: any) => a.id === id);
const byName = (layers: any[], nm: string) => layers.find((l: any) => l.nm === nm);

describe('nested folders in Lottie', () => {
  it('puts the inner folder in a precomp inside the outer one, each with its own fade', () => {
    const data = docToLottie(make()) as any;
    const outer = byName(data.layers, 'Outer');
    expect(outer.ty).toBe(0);
    expect(byName(data.layers, 'Outer (fade)').ks.o.k).toBe(50);
    const outerComp = comp(data, outer.refId);
    const inner = byName(outerComp.layers, 'Inner');
    expect(inner.ty).toBe(0);
    expect(byName(outerComp.layers, 'Inner (fade)').ks.o.k).toBe(50);
    expect(byName(outerComp.layers, 'A').ty).toBe(4);
    const innerComp = comp(data, inner.refId);
    expect(['B0', 'B1'].every((n) => byName(innerComp.layers, n))).toBe(true);
    // Nothing from the inner folder leaks to the stage or the outer precomp.
    expect(byName(data.layers, 'B0')).toBeUndefined();
    expect(byName(outerComp.layers, 'B0')).toBeUndefined();
  });

  it('a plain inner folder in a plain outer one passes straight through', () => {
    const doc = make();
    doc.folders!.o.opacity = 1;
    doc.folders!.i.opacity = 1;
    const data = docToLottie(doc) as any;
    expect(data.layers.map((l: any) => l.nm).filter((n: string) => n === 'A' || n === 'B0' || n === 'B1').sort()).toEqual(['A', 'B0', 'B1']);
  });

  it('hiding the outer folder, or the inner one, leaves out what is in it', () => {
    const doc = make();
    doc.folders!.i.visible = false;
    const a = docToLottie(doc) as any;
    expect(JSON.stringify(a)).not.toContain('"B0"');
    expect(JSON.stringify(a)).toContain('"A"');
    doc.folders!.i.visible = true;
    doc.folders!.o.visible = false;
    expect(JSON.stringify(docToLottie(doc))).not.toContain('"A"');
  });
});
