// Gradients reach every vector writer, merge drawing and moves.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Gradient, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { shapeToSvg, frameToSvg } from '../../src/export/svg';
import { writePdf } from '../../src/export/pdf';
import { docToLottie } from '../../src/export/lottie';
import { carryWarnings } from '../../src/export/carries';
import { mergeShapes } from '../../src/geometry/merge';
import { transformShape } from '../../src/canvas/geometry';

const grad = (kind: 'linear' | 'radial' = 'linear', end = '#0000ff'): Gradient => ({ kind, stops: [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#00ff00' }, { at: 1, color: end }], from: { x: 0, y: 0 }, to: { x: 20, y: 0 } });

const rect = (g?: Gradient, sg?: Gradient): PathShape => ({
  id: 'r',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }],
  fill: '#ff0000',
  stroke: sg ? { color: '#ff0000', width: 4, join: 'round', cap: 'round' } : null,
  opacity: 1,
  ...(g ? { fillGradient: g } : {}),
  ...(sg ? { strokeGradient: sg } : {}),
});

function docWith(s: PathShape): Doc {
  const doc = newDoc({ width: 20, height: 20 });
  const l = Object.assign(newVectorLayer('A'), { id: 'a' });
  doc.drawings = { d: { id: 'd', kind: 'vector', shapes: [s] } };
  l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
  doc.layers = [l];
  doc.length = 1;
  return doc;
}

describe('gradients in exports', () => {
  it('SVG gets real linear and radial gradients, fill and line', () => {
    const svg = shapeToSvg(rect(grad(), grad('radial')));
    expect(svg).toMatch(/<linearGradient id="(grad\w+)" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="20" y2="0">/);
    expect(svg).toContain('<radialGradient');
    expect(svg).toContain('offset="0.5" stop-color="#00ff00"');
    expect(svg).toMatch(/fill="url\(#grad\w+\)"/);
    expect(svg).toMatch(/stroke="url\(#grad\w+\)"/);
    expect(frameToSvg(docWith(rect(grad())), 0)).toContain('<linearGradient');
  });

  it('PDF draws them as shadings', () => {
    const bytes = writePdf(docWith(rect(grad(), grad('radial'))), { frames: [0], scale: 1, background: null, title: 't' });
    const s = Buffer.from(bytes).toString('latin1');
    expect(s).toContain('/ShadingType 2');
    expect(s).toContain('/ShadingType 3');
    expect(s).toContain('/FunctionType 3');
    const re = /stream\n([\s\S]*?)\nendstream/g;
    let all = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      try {
        all += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1');
      } catch {
        // not compressed text
      }
    }
    expect(all).toMatch(/W\* n \/Sh\d+ sh/);
    expect(all).toMatch(/W n \/Sh\d+ sh/);
  });

  it('Lottie gets gradient fills and lines', () => {
    const json = JSON.stringify(docToLottie(docWith(rect(grad(), grad('radial')))));
    expect(json).toContain('"ty":"gf"');
    expect(json).toContain('"ty":"gs"');
    expect(json).toMatch(/"g":\{"p":3/);
  });

  it('PDF and .ai keep see-through gradient colours with a soft mask, and plain gradients need none', () => {
    const text = (g: Gradient) => Buffer.from(writePdf(docWith(rect(g)), { frames: [0], scale: 1, background: null, title: 't' })).toString('latin1');
    expect(text(grad())).not.toContain('/SMask');
    const faded = text(grad('linear', '#0000ff00'));
    expect(faded).toContain('/SMask << /Type /Mask /S /Luminosity');
    // The mask's own shading is grey, running from opaque to clear.
    expect(faded).toContain('/ColorSpace /DeviceGray');
    expect(faded).toMatch(/\/C0 \[1\] \/C1 \[0\]/);
    expect(carryWarnings(docWith(rect(grad('linear', '#0000ff80'))), 'pdf')).toEqual([]);
    expect(carryWarnings(docWith(rect(grad('linear', '#0000ff80'))), 'ai')).toEqual([]);
    expect(carryWarnings(docWith(rect(grad('linear', '#0000ff80'))), 'svg')).toEqual([]);
  });
});

describe('gradients in drawing', () => {
  it('move along with their shape', () => {
    const moved = transformShape(rect(grad()), [2, 0, 0, 2, 10, 5]);
    expect(moved.fillGradient!.from).toEqual({ x: 10, y: 5 });
    expect(moved.fillGradient!.to).toEqual({ x: 50, y: 5 });
  });

  it('survive merge drawing, and only join the very same gradient', () => {
    const r = mergeShapes([], [rect(grad())]);
    expect(r.shapes.length).toBe(1);
    expect((r.shapes[0] as { gradient?: Gradient }).gradient?.stops.length).toBe(3);
    // A plain red square on top of a gradient one cuts it rather than joining it (they're different paints).
    const plain = { ...rect(), id: 'p', paths: [{ closed: true, points: [{ x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 10, y: 20 }] }] };
    const both = mergeShapes(r.shapes, [plain]);
    expect(both.shapes.length).toBe(2);
    expect(both.shapes.filter((s) => (s as { gradient?: Gradient }).gradient).length).toBe(1);
  });
});
