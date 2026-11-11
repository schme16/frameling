import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import { frameToSvg, pixelRects, splitColor } from '../../src/export/svg';

describe('svg', () => {
  it('writes a brush stroke as one filled path from its outline', () => {
    const doc = newDoc({ width: 100, height: 50, background: null });
    const v = newVectorDrawing();
    v.shapes.push({
      id: 's',
      type: 'stroke',
      points: [{ x: 10, y: 10, p: 0.5 }, { x: 40, y: 20, p: 0.5 }, { x: 80, y: 30, p: 0.5 }],
      brush: { size: 8, thinning: 0, smoothing: 0.5, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true },
      color: '#ff0000',
      opacity: 0.5,
    });
    doc.drawings[v.id] = v;
    doc.layers[0].cels.push({ id: 'c', start: 0, length: 1, drawingId: v.id });
    const svg = frameToSvg(doc, 0);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">')).toBe(true);
    const m = /<path d="(M[^"]+Z)" fill="#ff0000" fill-opacity="0.5"\/>/.exec(svg);
    expect(m).not.toBeNull();
    // A smoothed outline: a start point, then curves through midpoints, then closed.
    expect(m![1]).toMatch(/^M-?[\d.]+ -?[\d.]+(Q-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+)+Z$/);
    expect(svg).toContain('<g id="Layer-1">');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    // No background rectangle when the document has none.
    expect(svg).not.toContain('<rect');
  });

  it('writes shapes with curves, fill and stroke, and a background unless transparent', () => {
    const doc = newDoc({ width: 20, height: 20, background: '#ffffff' });
    const v = newVectorDrawing();
    v.shapes.push({
      id: 'p',
      type: 'path',
      paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 3, y: -4 }, c2: { x: 7, y: -4 } }, { x: 10, y: 10 }] }],
      fill: '#00ff0080',
      stroke: { color: '#000', width: 2, join: 'round', cap: 'butt' },
      opacity: 1,
    });
    doc.drawings[v.id] = v;
    doc.layers[0].cels.push({ id: 'c', start: 0, length: 1, drawingId: v.id });
    const svg = frameToSvg(doc, 0);
    expect(svg).toContain('<rect width="20" height="20" fill="#ffffff"/>');
    expect(svg).toContain('<path d="M0 0C3 -4 7 -4 10 0L10 10Z" fill="#00ff00" fill-opacity="0.502" fill-rule="evenodd" stroke="#000000" stroke-width="2" stroke-linejoin="round" stroke-linecap="butt"/>');
    expect(frameToSvg(doc, 0, { transparent: true })).not.toContain('<rect width="20"');
    expect(frameToSvg(doc, 0, { scale: 2 })).toContain('width="40" height="40" viewBox="0 0 20 20"');
  });

  it('turns pixel runs into rectangles, and joins identical runs on the rows below', () => {
    const d = newPixelDrawing(4, 3);
    // Row 0: red red blue (empty). Row 1: red red blue (empty). Row 2: empty empty empty green.
    const set = (x: number, y: number, c: number[]) => d.pixels.set(c, (y * 4 + x) * 4);
    for (const y of [0, 1]) {
      set(0, y, [255, 0, 0, 255]);
      set(1, y, [255, 0, 0, 255]);
      set(2, y, [0, 0, 255, 255]);
    }
    set(3, 2, [0, 255, 0, 128]);
    expect(pixelRects(d, 8)).toEqual([
      '<rect x="0" y="0" width="16" height="16" fill="#ff0000"/>',
      '<rect x="16" y="0" width="8" height="16" fill="#0000ff"/>',
      '<rect x="24" y="16" width="8" height="8" fill="#00ff00" fill-opacity="0.5"/>',
    ]);
  });

  it('puts pixel layers in a crisp group with the layer opacity', () => {
    const doc = newDoc({ width: 8, height: 8, background: null });
    const layer = newPixelLayer('Sprite 1', 2);
    layer.opacity = 0.5;
    const d = newPixelDrawing(4, 4);
    d.pixels.set([1, 2, 3, 255], 0);
    doc.drawings[d.id] = d;
    layer.cels.push({ id: 'c', start: 0, length: 1, drawingId: d.id });
    doc.layers = [layer];
    expect(frameToSvg(doc, 0)).toContain('<g id="Sprite-1" opacity="0.5" shape-rendering="crispEdges">\n<rect x="0" y="0" width="2" height="2" fill="#010203"/>\n</g>');
  });

  it('skips hidden layers and empty frames, and reads short hex colours', () => {
    const doc = newDoc({ width: 8, height: 8, background: null });
    doc.layers[0].visible = false;
    expect(frameToSvg(doc, 0)).not.toContain('<g');
    expect(splitColor('#f00')).toEqual({ color: '#ff0000', alpha: 1 });
    expect(splitColor('red')).toEqual({ color: 'red', alpha: 1 });
  });
});
