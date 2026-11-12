// Joined shots: the picture size choice (first / largest / custom) and parallax layers lining up with the fit.
import { afterEach, describe, expect, it } from 'vitest';
import { cameraMatrix, cameraViewOn, layerCameraMatrix, mixViews, newCameraDrawing, parallaxFactor } from '../../src/core/camera';
import { newDoc } from '../../src/core/doc';
import type { CameraLayer, Doc, Layer } from '../../src/core/format';
import { setChoice } from '../../src/core/choices';
import { currentPictureSize, customPicture, fitPlacement, pictureSizeFor, setCustomPicture } from '../../src/artboards/fit';
import { addArtboard, artboardsOf, joinShots } from '../../src/artboards/model';
import { planArtboards, setArtboardExport } from '../../src/artboards/export';
import { store } from '../../src/core/store';
import { defaultSettings } from '../../src/export/plan';

const apply = (m: readonly number[], x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function shots(sizes: [number, number][]): { doc: Doc; ids: string[] } {
  const doc = newDoc({ name: 'Film', width: sizes[0][0], height: sizes[0][1], length: 4, background: '#ffffff' });
  const ids = [artboardsOf(doc)[0].id];
  for (let i = 1; i < sizes.length; i++) ids.push(addArtboard(doc, { name: `Shot ${i + 1}`, width: sizes[i][0], height: sizes[i][1], length: 3, background: '#112233' }));
  return { doc, ids };
}
const join = (doc: Doc, ids: string[], opts = {}) => {
  const r = joinShots(doc, ids, opts);
  if ('problem' in r) throw new Error(r.problem);
  return r;
};
const camOf = (d: Doc) => d.layers.find((l) => l.kind === 'camera') as CameraLayer;

afterEach(() => {
  setChoice('artboards.pictureSize', undefined);
  setChoice('artboards.fit', undefined);
  customPicture.set(null);
});

describe('the picture size', () => {
  const sizes = [{ width: 32, height: 32 }, { width: 64, height: 32 }, { width: 16, height: 48 }];
  it('first shot, the shot with the most area, or what was typed', () => {
    expect(pictureSizeFor(sizes, 'first')).toEqual({ width: 32, height: 32 });
    expect(pictureSizeFor(sizes, 'largest')).toEqual({ width: 64, height: 32 });
    expect(pictureSizeFor(sizes, 'custom', { width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
  });
  it('a custom size nobody typed yet is the first shot, and typed sizes are whole and bounded', () => {
    expect(pictureSizeFor(sizes, 'custom')).toEqual({ width: 32, height: 32 });
    expect(pictureSizeFor(sizes, 'custom', { width: 0.2, height: 99999 })).toEqual({ width: 1, height: 8192 });
    setCustomPicture({ width: 12.6, height: 7 });
    expect(customPicture.get()).toEqual({ width: 13, height: 7 });
  });
  it('ties go to the first of them', () => {
    expect(pictureSizeFor([{ width: 10, height: 20 }, { width: 20, height: 10 }], 'largest')).toEqual({ width: 10, height: 20 });
  });
  it('joinShots follows the choice, and defaults to the first shot', () => {
    const { doc, ids } = shots([[32, 32], [64, 32], [16, 48]]);
    const a = join(doc, ids).doc;
    expect([a.width, a.height]).toEqual([32, 32]);
    setChoice('artboards.pictureSize', 'largest');
    const b = join(doc, ids).doc;
    expect([b.width, b.height]).toEqual([64, 32]);
    // The first shot is now the one that is fitted (pillarbox), and the largest one is left alone.
    expect(cameraViewOn(b, camOf(b), 0)!.zoom).toBe(1);
    expect(cameraViewOn(b, camOf(b), 4)).toEqual({ x: 32, y: 16, zoom: 1, rotation: 0 });
    setCustomPicture({ width: 100, height: 60 });
    setChoice('artboards.pictureSize', 'custom');
    const c = join(doc, ids).doc;
    expect([c.width, c.height]).toEqual([100, 60]);
    expect(currentPictureSize([{ width: 1, height: 1 }])).toEqual({ width: 100, height: 60 });
  });
  it('an explicit size still wins, and the export plan reports the picture', () => {
    const { doc, ids } = shots([[32, 32], [64, 32]]);
    expect(join(doc, ids, { size: { width: 40, height: 20 } }).doc.width).toBe(40);
    store().load(doc);
    setArtboardExport({ mode: 'joined', ids });
    setChoice('artboards.pictureSize', 'largest');
    const plan = planArtboards(store().rootDoc(), { ...defaultSettings(doc), format: 'gif', range: 'all', scale: 1 }, 0);
    expect(plan?.size).toEqual({ width: 64, height: 32 });
  });
});

describe('layers at another depth line up with the fit', () => {
  const depthLayer = (depth: number): Layer => ({ id: 'far', name: 'Far', kind: 'vector', visible: true, locked: false, opacity: 1, depth, cels: [] });

  /** Where the shot's own camera (at its own size) puts a stage point for a layer at `factor`, then the fit places it. */
  function expected(shotW: number, shotH: number, view: { x: number; y: number; zoom: number; rotation: number }, factor: number, W: number, H: number, mode: 'bars' | 'fill', x: number, y: number) {
    const own = apply(cameraMatrix({ width: shotW, height: shotH }, view, factor), x, y);
    const p = fitPlacement(shotW, shotH, W, H, mode);
    return { x: p.x + own.x * p.k, y: p.y + own.y * p.k };
  }

  for (const mode of ['bars', 'fill'] as const) {
    for (const own of [null, { x: 40, y: 10, zoom: 2, rotation: 0 }, { x: 20, y: 20, zoom: 1.5, rotation: 25 }]) {
      it(`${mode}${own ? `, shot camera ${JSON.stringify(own)}` : ', no shot camera'}`, () => {
        const { doc, ids } = shots([[32, 32], [64, 32]]);
        const ab = artboardsOf(doc)[1].content!;
        const view = own ?? { x: 32, y: 16, zoom: 1, rotation: 0 };
        if (own) {
          const k = newCameraDrawing(own);
          doc.drawings[k.id] = k;
          ab.layers.push({ id: 'cam', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'kc', start: 0, length: 3, drawingId: k.id }] } as CameraLayer);
        }
        ab.layers.push(depthLayer(1), { ...depthLayer(-0.5), id: 'near', name: 'Near' });
        const { doc: out } = join(doc, ids, { fit: mode });
        const v = cameraViewOn(out, camOf(out), 5)!;
        for (const [name, depth] of [['Far', 1], ['Near', -0.5], ['Far', 1]] as const) {
          const layer = out.layers.find((l) => l.name === name)!;
          const m = layerCameraMatrix(out, layer, v) ?? [1, 0, 0, 1, 0, 0];
          for (const [x, y] of [[0, 0], [64, 32], [10, 25], [33, 7]]) {
            const got = apply(m, x, y);
            const want = expected(64, 32, view, parallaxFactor(depth), 32, 32, mode, x, y);
            expect(got.x).toBeCloseTo(want.x, 6);
            expect(got.y).toBeCloseTo(want.y, 6);
          }
        }
      });
    }
  }

  it('a plain fit keeps a far layer exactly where the stage layers are', () => {
    const { doc, ids } = shots([[32, 32], [64, 32]]);
    artboardsOf(doc)[1].content!.layers.push(depthLayer(2));
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    const v = cameraViewOn(out, camOf(out), 4)!;
    const far = out.layers.find((l) => l.name === 'Far')!;
    const m = layerCameraMatrix(out, far, v)!;
    const plain = cameraMatrix(out, v);
    for (const [x, y] of [[0, 0], [64, 32], [20, 5]]) {
      expect(apply(m, x, y).x).toBeCloseTo(apply(plain, x, y).x, 9);
      expect(apply(m, x, y).y).toBeCloseTo(apply(plain, x, y).y, 9);
    }
  });

  it('views carry the fit through in-betweens, and a view with no fit works as before', () => {
    const a = { x: 0, y: 0, zoom: 1, rotation: 0, fit: { k: 0.5, w: 64, h: 32 } };
    const b = { x: 10, y: 0, zoom: 2, rotation: 0 };
    expect(mixViews(a, b, 0.5).fit).toEqual({ k: 0.5, w: 64, h: 32 });
    expect(mixViews(b, b, 0.5).fit).toBeUndefined();
    const m = cameraMatrix({ width: 32, height: 32 }, { x: 10, y: 12, zoom: 2, rotation: 0 }, 0.5);
    expect(m[0]).toBeCloseTo(Math.SQRT2, 9);
  });
});

describe('exports of a joined film follow the same depth rule', () => {
  it('Lottie: a far layer scales by the shot zoom to the depth factor, times the fit', async () => {
    const { lottieExport } = await import('../../src/export/lottie');
    const { doc, ids } = shots([[32, 32], [64, 32]]);
    const ab = artboardsOf(doc)[1].content!;
    const k = newCameraDrawing({ x: 32, y: 16, zoom: 4, rotation: 0 });
    doc.drawings[k.id] = k;
    doc.drawings.fd = { id: 'fd', kind: 'vector', shapes: [{ id: 's1', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }] }], fill: '#ff0000', stroke: null, opacity: 1 }] };
    ab.layers.push({ id: 'cam', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'kc', start: 0, length: 3, drawingId: k.id }] } as CameraLayer, { id: 'far', name: 'Far', kind: 'vector', visible: true, locked: false, opacity: 1, depth: 1, cels: [{ id: 'fc', start: 0, length: 3, drawingId: 'fd' }] });
    const { doc: out } = join(doc, ids, { fit: 'bars' });
    const { data } = lottieExport(out, { range: { start: 4, end: 6 } });
    const nulls = (data.layers as { ty: number; nm: string; ks: { s: { k: unknown } } }[]).filter((l) => l.ty === 3);
    const far = nulls.find((l) => l.nm === 'Camera (depth 1)')!;
    expect(far).toBeDefined();
    const s = far.ks.s.k as number[] | number[][];
    const first = Array.isArray(s[0]) ? (s[0] as number[])[0] : (s as number[])[0];
    // The shot zooms 4x, a layer at depth 1 zooms 2x of that, and the fit (half size) comes after: 100% * 0.5 * 2.
    expect(first).toBeCloseTo(100, 1);
  });
});
