// Folders in SVG are named groups: an id from the folder's name and an Inkscape label, plain pass-through folders too.
import { describe, expect, it } from 'vitest';
import type { Doc, LayerFolder, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { animatedSvg } from '../../src/export/svg-anim';
import { frameSvgExport, layerId } from '../../src/export/svg';

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }],
  fill,
  stroke: null,
  opacity: 1,
});

describe('named folder groups in SVG', () => {
  function folders(): Doc {
    const doc = newDoc({ width: 100, height: 50, background: '#ffffff' });
    doc.folders = {
      f1: { id: 'f1', name: 'Scenery', visible: true, opacity: 1 } as LayerFolder,
      f2: { id: 'f2', name: 'Hills & sky (far)', visible: true, opacity: 1, parent: 'f1' } as LayerFolder,
      f3: { id: 'f3', name: 'Scenery', visible: true, opacity: 0.5 } as LayerFolder,
      f4: { id: 'f4', name: '日本', visible: true, opacity: 1 } as LayerFolder,
    };
    const mk = (name: string, id: string, folder: string) => {
      const l = Object.assign(newVectorLayer(name), { id, folder });
      l.cels = [{ id: 'c' + id, start: 0, length: 1, drawingId: 'd' + id }];
      doc.drawings['d' + id] = { id: 'd' + id, kind: 'vector', shapes: [rect('r' + id, 5, 5, 20, 20, '#ff0000')] };
      return l;
    };
    doc.layers = [mk('A', 'a', 'f1'), mk('B', 'b', 'f2'), mk('C', 'c', 'f3'), mk('D', 'd', 'f4')];
    doc.length = 1;
    return doc;
  }
  const groups = (svg: string) => [...svg.matchAll(/<g id="([^"]+)" inkscape:label="([^"]*)"/g)].map((m) => [m[1], m[2]]);

  it('writes a group with a safe, unique id and an Inkscape label for every folder, plain pass-through ones too', () => {
    const { svg } = frameSvgExport(folders(), 0);
    expect(groups(svg)).toEqual(expect.arrayContaining([['Scenery', 'Scenery'], ['Scenery_', 'Scenery'], ['Hills-sky-far', 'Hills &amp; sky (far)'], ['folder', '日本']]));
    expect(svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"');
    // The inner folder's group is inside the outer one.
    expect(svg.indexOf('id="Scenery"')).toBeLessThan(svg.indexOf('id="Hills-sky-far"'));
    // Every id in the file is used once.
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves the Inkscape namespace out when there are no folders, and keeps a layer called like a folder apart', () => {
    const doc = folders();
    doc.folders = {};
    for (const l of doc.layers) l.folder = undefined;
    expect(frameSvgExport(doc, 0).svg).not.toContain('inkscape');
    const used = new Set<string>(['Scenery']);
    expect(layerId('Scenery', used, 'folder')).toBe('Scenery_');
    expect(layerId('日本', new Set(), 'folder')).toBe('folder');
    expect(layerId('3 hills', new Set(), 'folder')).toBe('folder-3-hills');
  });

  it('the moving SVG names its folder groups too', () => {
    const doc = folders();
    doc.length = 2;
    const svg = animatedSvg(doc, {});
    expect(svg).toContain('inkscape:label="Scenery"');
    expect(svg).toContain('xmlns:inkscape=');
  });

  it('is well formed XML', () => {
    const { svg } = frameSvgExport(folders(), 0);
    expect(svg.match(/<g[ >]/g)!.length).toBe(svg.match(/<\/g>/g)!.length);
  });
});

