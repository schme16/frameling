import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { renderFrame } from '../../src/core/render';
import { isPosed, newInstance, poseAt } from '../../src/core/symbols';
import { clearTilemapCache, tilemapStats } from '../../src/tiles/map';
import { frameToSvg } from '../../src/export/svg';
import { installFakeCanvas, mainCtx, removeFakeCanvas } from '../perf/fakeCanvas';
import { sampleTileDoc } from '../tiles/helpers';

// A tilemap layer moved into a symbol, with one instance of it on the stage.
function tilesInSymbol(): Doc {
  const { doc } = sampleTileDoc();
  const tiles = doc.layers.pop()!;
  doc.symbols = { y1: { id: 'y1', name: 'Level', layers: [tiles], length: 4, origin: { x: 0, y: 0 } } };
  const d = newVectorDrawing();
  d.shapes.push(newInstance('y1', { x: 0, y: 0 }));
  doc.drawings[d.id] = d;
  const stage = newVectorLayer('Stage');
  stage.cels.push({ id: 'cs', start: 0, length: 1, drawingId: d.id });
  doc.layers = [stage];
  return doc;
}

describe('tilemaps inside symbols', () => {
  beforeEach(() => {
    installFakeCanvas();
    clearTilemapCache();
    tilemapStats.builds = 0;
  });
  afterEach(() => removeFakeCanvas());

  it('draw on the stage', () => {
    const doc = tilesInSymbol();
    renderFrame(mainCtx(), doc, 0);
    expect(tilemapStats.builds).toBe(1);
  });

  it('remember the symbol frame they were posed at', () => {
    const doc = tilesInSymbol();
    const posed = poseAt(doc, doc.layers[0], 0);
    const inst = posed?.kind === 'vector' ? posed.shapes[0] : undefined;
    expect(inst && isPosed(inst) ? inst.posed.layers[0].frame : -1).toBe(0);
  });

  it('come out in SVG', () => {
    const doc = tilesInSymbol();
    const svg = frameToSvg(doc, 0);
    expect(svg).toContain('fill="#50b43c"');
  });
});

describe('layers inside symbols that never show on their own', () => {
  it('leaves masks, reference layers and hidden folders out of the instance', () => {
    const doc = tilesInSymbol();
    const inner = doc.symbols!.y1.layers[0];
    const mk = (extra: object) => ({ ...inner, id: Math.random().toString(36), ...extra });
    doc.folders = { off: { id: 'off', name: 'Off', visible: false, opacity: 1 } };
    doc.symbols!.y1.layers.push(mk({ mask: 'show' }), mk({ reference: true }), mk({ folder: 'off' }));
    const posed = poseAt(doc, doc.layers[0], 0);
    const inst = posed?.kind === 'vector' ? posed.shapes[0] : undefined;
    expect(inst && isPosed(inst) ? inst.posed.layers.length : -1).toBe(1);
  });
});
