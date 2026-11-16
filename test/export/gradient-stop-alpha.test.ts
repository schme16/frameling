// A gradient stop can be see-through (its colour is #rrggbbaa): it survives save and open, and reaches the writers.
import { describe, expect, it } from 'vitest';
import type { Doc, Gradient, PathShape, VectorDrawing } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { writePdf } from '../../src/export/pdf';
import { shapeToSvg } from '../../src/export/svg';
import { docToLottie } from '../../src/export/lottie';
import { loadFile, saveFile } from '../../src/io/file';

const faded: Gradient = { kind: 'linear', stops: [{ at: 0, color: '#ff0000ff' }, { at: 0.5, color: '#00ff0080' }, { at: 1, color: '#0000ff00' }], from: { x: 0, y: 0 }, to: { x: 20, y: 0 } };
const shape: PathShape = {
  id: 'r',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }],
  fill: '#ff0000',
  stroke: null,
  opacity: 1,
  fillGradient: faded,
};

function docWith(s: PathShape): Doc {
  const doc = newDoc({ width: 20, height: 20 });
  const l = Object.assign(newVectorLayer('A'), { id: 'a' });
  doc.drawings = { d: { id: 'd', kind: 'vector', shapes: [s] } };
  l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
  doc.layers = [l];
  doc.length = 1;
  return doc;
}

describe('see-through gradient stops', () => {
  it('survive save and open', () => {
    const back = loadFile(saveFile(docWith(shape), '1.2.3')).doc;
    const s = (back.drawings.d as VectorDrawing).shapes[0] as PathShape;
    expect(s.fillGradient?.stops).toEqual(faded.stops);
  });

  it('reach SVG as stop opacity', () => {
    const svg = shapeToSvg(shape);
    expect(svg).toContain('stop-opacity="0.502"');
    expect(svg).toContain('stop-opacity="0"');
  });

  it('reach Lottie as the gradient alphas', () => {
    const json = JSON.parse(JSON.stringify(docToLottie(docWith(shape))));
    const gf = JSON.stringify(json).match(/"ty":"gf"[^]*?"g":\{"p":3,"k":(\{[^}]*\}|\[[^\]]*\])/);
    expect(gf).toBeTruthy();
    // Three stops of (offset, r, g, b) then three of (offset, alpha): 21 numbers, the last alpha 0.
    expect(gf![1]).toContain('0.502');
  });

  it('reach PDF as a soft mask', () => {
    const text = Buffer.from(writePdf(docWith(shape), { frames: [0], scale: 1, background: null, title: 't' })).toString('latin1');
    expect(text).toContain('/SMask');
  });
});
