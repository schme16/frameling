// Folders inside folders in SVG: each folder that fades or blends is a group of its own inside its parent's.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { frameSvgExport } from '../../src/export/svg';
import { addVectorLayer, ellipsePath, fill, hold, vectorDrawing } from '../../src/templates/build';

function make() {
  const doc = newDoc({ width: 200, height: 100, length: 2 });
  doc.layers = [];
  doc.folders = { o: { id: 'o', name: 'Outer', visible: true, opacity: 0.5 }, i: { id: 'i', name: 'Inner', visible: true, opacity: 0.25, blend: 'multiply', parent: 'o' } };
  const a = addVectorLayer(doc, 'A');
  a.folder = 'o';
  hold(a, vectorDrawing(doc, [fill([ellipsePath(50, 50, 30, 30)], '#ff0000')]).id, 0, 2);
  const b = addVectorLayer(doc, 'B');
  b.folder = 'i';
  hold(b, vectorDrawing(doc, [fill([ellipsePath(80, 50, 30, 30)], '#0000ff')]).id, 0, 2);
  return doc;
}

describe('nested folders in SVG', () => {
  it('writes the inner folder as a group inside the outer folder group, each with its own fade and blend', () => {
    const { svg } = frameSvgExport(make(), 0);
    const outer = svg.indexOf('opacity="0.5"');
    const inner = svg.indexOf('opacity="0.25"');
    expect(outer).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(outer);
    expect(svg).toContain('mix-blend-mode:multiply');
    // Both groups close after the inner shape: the outer one opens first and so closes last.
    const shapeB = svg.indexOf('#0000ff');
    expect(shapeB).toBeGreaterThan(inner);
    expect(svg.slice(shapeB).split('</g>').length).toBeGreaterThanOrEqual(3);
  });

  it('a hidden outer folder leaves out the folders inside it', () => {
    const doc = make();
    doc.folders!.o.visible = false;
    expect(frameSvgExport(doc, 0).svg).not.toContain('#0000ff');
    doc.folders!.o.visible = true;
    doc.folders!.i.visible = false;
    const svg = frameSvgExport(doc, 0).svg;
    expect(svg).not.toContain('#0000ff');
    expect(svg).toContain('#ff0000');
  });
});
