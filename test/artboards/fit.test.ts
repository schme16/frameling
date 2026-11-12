import { describe, expect, it } from 'vitest';

import { cameraMatrix, cameraViewOn, newCameraDrawing } from '../../src/core/camera';
import { newDoc } from '../../src/core/doc';
import type { CameraLayer, Doc, Layer } from '../../src/core/format';
import { setChoice } from '../../src/core/choices';
import { fitPlacement, currentFit } from '../../src/artboards/fit';
import { addArtboard, artboardsOf, joinShots } from '../../src/artboards/model';

const apply = (m: number[], x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function two(w2: number, h2: number, bg2: string | null = '#112233'): { doc: Doc; ids: [string, string] } {
  const doc = newDoc({ name: 'Film', width: 32, height: 32, length: 4, background: '#ffffff' });
  const b = addArtboard(doc, { name: 'Wide', width: w2, height: h2, length: 3, background: bg2 });
  return { doc, ids: [artboardsOf(doc)[0].id, b] };
}

const join = (doc: Doc, ids: string[], opts = {}) => {
  const r = joinShots(doc, ids, opts);
  if ('problem' in r) throw new Error(r.problem);
  return r;
};

const FIT = { k: 0.5, w: 64, h: 32 };
const camOf = (d: Doc) => d.layers.find((l) => l.kind === 'camera') as CameraLayer;

describe('fitting a shot into a picture', () => {
  it('Fit centres the whole shot and leaves bars on the short side', () => {
    const p = fitPlacement(64, 32, 32, 32, 'bars');
    expect([p.k, p.x, p.y, p.w, p.h]).toEqual([0.5, 0, 8, 32, 16]);
    expect(p.bars).toEqual([{ x: 0, y: 0, w: 32, h: 8 }, { x: 0, y: 24, w: 32, h: 8 }]);
    const tall = fitPlacement(16, 32, 32, 32, 'bars');
    expect(tall.bars.map((b) => [b.x, b.w])).toEqual([[0, 8], [24, 8]]);
  });
  it('Fill covers the picture and has no bars', () => {
    const p = fitPlacement(64, 32, 32, 32, 'fill');
    expect(p.k).toBe(1);
    expect(p.x).toBe(-16);
    expect(p.bars).toEqual([]);
  });
  it('the same shape at another scale has no bars', () => {
    expect(fitPlacement(64, 64, 32, 32, 'bars').bars).toEqual([]);
  });
});

describe('joining shots of different sizes', () => {
  it('sets a camera key per shot that maps its stage onto the fitted place', () => {
    const { doc, ids } = two(64, 32);
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    expect([out.width, out.height]).toEqual([32, 32]);
    const cam = camOf(out);
    const view = cameraViewOn(out, cam, 4)!;
    const m = cameraMatrix(out, view);
    expect(apply(m, 0, 0)).toEqual({ x: 0, y: 8 });
    expect(apply(m, 64, 32)).toEqual({ x: 32, y: 24 });
    // The first shot is the picture's own size, so it is left alone.
    expect(cameraViewOn(out, cam, 0)).toEqual({ x: 16, y: 16, zoom: 1, rotation: 0 });
  });

  it('draws the bars where the picture edge is, whatever the camera does', () => {
    const { doc, ids } = two(64, 32);
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    const bars = out.layers.find((l) => l.name === 'Wide bars')!;
    expect(bars).toBeDefined();
    const d = out.drawings[bars.cels[0].drawingId];
    if (d.kind !== 'vector') throw new Error('bars should be a vector drawing');
    const m = cameraMatrix(out, cameraViewOn(out, camOf(out), 4)!);
    const shape = d.shapes[0];
    if (shape.type !== 'path') throw new Error('bars should be a path');
    expect(shape.fill).toBe('#ffffff');
    const top = shape.paths[0].points.map((p) => apply(m, p.x, p.y));
    // The top bar ends at the picture's y 8 and reaches off the top; the bottom one starts at 24.
    expect(Math.max(...top.map((p) => p.y))).toBeCloseTo(8);
    expect(Math.min(...top.map((p) => p.y))).toBeLessThan(0);
    const bottom = shape.paths[1].points.map((p) => apply(m, p.x, p.y));
    expect(Math.min(...bottom.map((p) => p.y))).toBeCloseTo(24);
    expect(Math.max(...bottom.map((p) => p.y))).toBeGreaterThan(32);
    // Only while that shot plays.
    expect(bars.cels.every((c) => c.start >= 4 && c.start < 7)).toBe(true);
  });

  it('Fill makes no bars and zooms the shot to cover', () => {
    const { doc, ids } = two(64, 32);
    const { doc: out } = join(doc, ids, { fit: 'fill' });
    expect(out.layers.some((l) => l.name.endsWith('bars'))).toBe(false);
    const view = cameraViewOn(out, camOf(out), 5)!;
    expect(view.zoom).toBe(1);
    const m = cameraMatrix(out, view);
    expect(apply(m, 0, 0)).toEqual({ x: -16, y: 0 });
  });

  it('keeps the shot own camera and scales it by the fit', () => {
    const { doc, ids } = two(64, 32);
    // Give the wide shot a camera that zooms in 2x for its whole length.
    const ab = artboardsOf(doc)[1];
    const k = newCameraDrawing({ x: 40, y: 10, zoom: 2, rotation: 0 });
    doc.drawings[k.id] = k;
    const layer: Layer = { id: 'cam', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'kc', start: 0, length: 3, drawingId: k.id }] } as CameraLayer;
    ab.content!.layers.push(layer);
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    const view = cameraViewOn(out, camOf(out), 4)!;
    expect(view).toEqual({ x: 40, y: 10, zoom: 1, rotation: 0, fit: { k: 0.5, w: 64, h: 32 } });
    // The shot's own drawing is untouched.
    expect(k.view.zoom).toBe(2);
  });

  it('bars are the first shot background unless Preferences says otherwise', () => {
    const { doc, ids } = two(64, 32);
    setChoice('artboards.barColor', 'black');
    const bars = join(doc, ids, { fit: 'bars' }).doc.layers.find((l) => l.name === 'Wide bars')!;
    const d = join(doc, ids, { fit: 'bars' }).doc.drawings;
    expect(JSON.stringify(d[bars.cels[0].drawingId])).toContain('#000000');
    setChoice('artboards.barColor', undefined);
  });

  it('a fitted shot whose camera has gaps still gets the fit in the gaps', () => {
    const { doc, ids } = two(64, 32);
    const k = newCameraDrawing({ x: 40, y: 10, zoom: 2, rotation: 0 });
    doc.drawings[k.id] = k;
    // The camera has a key for frame 1 only (of 3).
    artboardsOf(doc)[1].content!.layers.push({ id: 'cam', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'kc', start: 1, length: 1, drawingId: k.id }] } as CameraLayer);
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    const cam = camOf(out);
    expect(cameraViewOn(out, cam, 4)).toEqual({ x: 32, y: 16, zoom: 0.5, rotation: 0, fit: FIT });
    expect(cameraViewOn(out, cam, 5)).toEqual({ x: 40, y: 10, zoom: 1, rotation: 0, fit: FIT });
    expect(cameraViewOn(out, cam, 6)).toEqual({ x: 32, y: 16, zoom: 0.5, rotation: 0, fit: FIT });
  });

  it('one bar colour for all when asked, none when same size', () => {
    const { doc, ids } = two(64, 32);
    const { doc: out } = join(doc, ids, { fit: 'bars', barColor: '#000000' });
    const bars = out.layers.find((l) => l.name === 'Wide bars')!;
    const d = out.drawings[bars.cels[0].drawingId];
    expect(d.kind === 'vector' && d.shapes[0].type === 'path' && d.shapes[0].fill).toBe('#000000');
    const same = two(32, 32);
    const j = join(same.doc, same.ids);
    expect(j.doc.layers.some((l) => l.kind === 'camera' || l.name.endsWith('bars'))).toBe(false);
  });

  it('can be told another picture size, and uses the preference by default', () => {
    const { doc, ids } = two(64, 32);
    const a = join(doc, ids, { size: { width: 64, height: 32 } }).doc;
    expect([a.width, a.height]).toEqual([64, 32]);
    // The 32 x 32 first shot is now the one fitted (pillarbox, 32 wide in 64).
    expect(cameraViewOn(a, camOf(a), 0)!.zoom).toBe(1);
    setChoice('artboards.fit', undefined);
    expect(currentFit()).toBe('bars');
    setChoice('artboards.fit', 'fill');
    expect(currentFit()).toBe('fill');
    expect(join(doc, ids).doc.layers.some((l) => l.name.endsWith('bars'))).toBe(false);
    setChoice('artboards.fit', undefined);
  });

  it('keeps every id unique and every drawing it uses', () => {
    const { doc, ids } = two(16, 48);
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    expect(new Set(out.layers.map((l) => l.id)).size).toBe(out.layers.length);
    for (const l of out.layers) for (const c of l.cels) expect(out.drawings[c.drawingId]).toBeDefined();
  });
});
