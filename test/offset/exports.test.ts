import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { docToLottie } from '../../src/export/lottie';

/** A vector triangle and a pixel dot, each on its own layer, both moved. */
function movedDoc(moved: boolean) {
  const doc = newDoc({ width: 20, height: 20, background: null, length: 2 });
  const v = newVectorDrawing();
  v.shapes.push({ id: 'p', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], fill: '#00ff00', stroke: null, opacity: 1 } as never);
  doc.drawings[v.id] = v;
  doc.layers[0].cels.push({ id: 'c', start: 0, length: 2, drawingId: v.id, ...(moved ? { offset: { x: 5, y: -3 } } : {}) });
  const pl = newPixelLayer('px', 2);
  const pd = newPixelDrawing(10, 10);
  pd.pixels.set([255, 0, 0, 255], 0);
  doc.drawings[pd.id] = pd;
  pl.cels.push({ id: 'pc', start: 0, length: 2, drawingId: pd.id, ...(moved ? { offset: { x: 4, y: 2 } } : {}) });
  doc.layers.push(pl);
  return doc;
}

describe('a moved drawing in the exports that write shapes', () => {
  it('SVG puts it in a group with the move', () => {
    const svg = frameToSvg(movedDoc(true), 0);
    expect(svg).toContain('<g transform="matrix(1 0 0 1 5 -3)"><path d="M0 0L10 0L10 10Z"');
    expect(svg).toContain('<g transform="matrix(1 0 0 1 4 2)"><rect x="0" y="0" width="2" height="2"');
    expect(frameToSvg(movedDoc(false), 0)).not.toContain('matrix(');
  });

  it('animated SVG keeps it', () => {
    const svg = animatedSvg(movedDoc(true), {});
    expect(svg).toContain('matrix(1 0 0 1 5 -3)');
    expect(svg).toContain('matrix(1 0 0 1 4 2)');
  });

  it('Lottie moves the picture of a pixel layer and the points of a shape, and stays one still picture over a hold', () => {
    const lottie = docToLottie(movedDoc(true), {} as never) as { layers: { ty: number; ks: { p: { k: unknown } }; shapes?: { it: { ks?: { k: { v: number[][] } } }[] }[] }[] };
    const image = lottie.layers.find((l) => l.ty === 2)!;
    expect(image.ks.p.k).toEqual([4, 2]);
    const shape = lottie.layers.find((l) => l.ty === 4)!;
    expect(shape.shapes![0].it[0].ks!.k.v).toEqual([[5, -3], [15, -3], [15, 7]]);
    // Not an animated path: the same on both frames of the hold.
    expect(JSON.stringify(shape)).not.toContain('"a":1');
  });
});
