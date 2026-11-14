import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { newCameraLayer } from '../../src/core/camera';
import type { CanvasMark, Doc, Layer } from '../../src/core/format';
import { artPixel, cameraAt, fitPage, marksVisible, pageOf, shownFrame, throughCamera, withoutPictures } from '../../src/popout/show';
import { isDarkColour } from '../../src/popout/link';
import { inkWanted, noteInk, noteLive, setInkTap, setLiveTap } from '../../src/popout/ink';

const withCamera = (visible = true): Doc => {
  const d = newDoc({ width: 400, height: 200, length: 10 });
  const { layer, drawing } = newCameraLayer(d);
  d.drawings[drawing.id] = drawing;
  d.layers.push({ ...layer, visible });
  return d;
};

describe('the camera decision', () => {
  it('a drawing with no camera is never looked at through one', () => {
    const d = newDoc();
    expect(throughCamera('camera', d, true)).toBe(false);
    expect(throughCamera('same', d, true)).toBe(false);
  });
  it('"what the camera sees" always looks through it, even while the drawing window shows the whole page', () => {
    expect(throughCamera('camera', withCamera(), false)).toBe(true);
  });
  it('"same as my drawing window" does what the drawing window does', () => {
    expect(throughCamera('same', withCamera(), true)).toBe(true);
    expect(throughCamera('same', withCamera(), false)).toBe(false);
  });
  it('a hidden camera is not looked through', () => {
    expect(throughCamera('camera', withCamera(false), true)).toBe(false);
  });
  it('finds the camera view on a frame', () => {
    expect(cameraAt(withCamera(), 3)).toBeDefined();
    expect(cameraAt(newDoc(), 0)).toBeUndefined();
  });
});

describe('the marks decision', () => {
  it('shows them only when asked, the marks switch is on, and the picture is still and not through the camera', () => {
    expect(marksVisible('show', false, false, true)).toBe(true);
    expect(marksVisible('hide', false, false, true)).toBe(false);
    expect(marksVisible('show', true, false, true)).toBe(false);
    expect(marksVisible('show', false, true, true)).toBe(false);
    expect(marksVisible('show', false, false, false)).toBe(false);
  });
});

describe('the frame and page shown', () => {
  it('is the playhead, kept inside the drawing', () => {
    const d = newDoc({ length: 10 });
    expect(shownFrame(d, 4)).toBe(4);
    expect(shownFrame(d, 99)).toBe(9);
    expect(shownFrame(d, -3)).toBe(0);
  });
  it('is the whole page, at the outer playhead, while a symbol is open for editing', () => {
    const d = newDoc({ length: 10 });
    const inner: Layer[] = [];
    const open: Doc = { ...d, length: 3, layers: inner, editing: [{ symbolId: 's', layers: d.layers, length: 10, frame: 6, activeLayerId: null, matrix: [1, 0, 0, 1, 0, 0] }] };
    expect(pageOf(open).editing).toBeUndefined();
    expect(pageOf(open).length).toBe(10);
    expect(shownFrame(open, 1)).toBe(6);
  });
  it('fits the page whole with a thin margin, centred', () => {
    const d = newDoc({ width: 400, height: 200 });
    const r = fitPage(1600, 1000, d, 1);
    expect(r.w / r.h).toBeCloseTo(2, 1);
    expect(r.w).toBeGreaterThan(1400);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x * 2 + r.w).toBeCloseTo(1600, -1);
    const hi = fitPage(3200, 2000, d, 2);
    expect(hi.w).toBeGreaterThan(2800);
  });
  it('shows pixel art with every art pixel the same whole size', () => {
    const d = newDoc({ width: 64, height: 64, pixel: { pixelSize: 1 } });
    expect(artPixel(d)).toBe(1);
    const r = fitPage(1000, 900, d, 1);
    expect(r.w % 64).toBe(0);
    expect(r.w).toBeGreaterThan(700);
    expect(artPixel(newDoc())).toBe(0);
  });
  it('leaves reference pictures out, like an export does, and keeps the document it was given', () => {
    const d = newDoc();
    const layer = { ...d.layers[0], picture: { x: 0, y: 0, scale: 1, shots: [{ picture: 'p', start: 0 }] } } as Layer;
    const doc: Doc = { ...d, layers: [layer] };
    const out = withoutPictures(doc);
    expect(out.layers[0].picture).toBeUndefined();
    expect(doc.layers[0].picture).toBeDefined();
    expect(withoutPictures(doc)).toBe(out);
    expect(withoutPictures(d)).toBe(d);
  });
});

describe('what it colours itself from', () => {
  it('tells a dark background from a light one', () => {
    expect(isDarkColour('#121019')).toBe(true);
    expect(isDarkColour('#f3eee6')).toBe(false);
    expect(isDarkColour('not a colour')).toBe(true);
  });
});

describe('the taps the tools call', () => {
  it('cost nothing and say so when nobody is listening', () => {
    setInkTap(null);
    setLiveTap(null);
    expect(inkWanted()).toBe(false);
    expect(() => noteInk(null)).not.toThrow();
    expect(() => noteLive(null)).not.toThrow();
  });
  it('pass a stroke on, and only vector drawings for a half-done change', () => {
    const seen: unknown[] = [];
    const lives: unknown[] = [];
    setInkTap((s) => void seen.push(s));
    setLiveTap((l) => void lives.push(l));
    expect(inkWanted()).toBe(true);
    noteInk(null);
    const drawing = newVectorDrawing();
    noteLive({ layerId: 'L', kind: 'vector', drawing });
    noteLive({ layerId: 'L', kind: 'pixel' });
    noteLive(null);
    expect(seen).toEqual([null]);
    expect(lives).toEqual([{ layerId: 'L', drawing }, null, null]);
    setInkTap(null);
    setLiveTap(null);
  });
  it('unused marks type stays exported', () => {
    const m: CanvasMark = { id: 'a', kind: 'arrow', pts: [0, 0, 1, 1] };
    expect(m.kind).toBe('arrow');
  });
});
