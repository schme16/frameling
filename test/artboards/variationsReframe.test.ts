import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CameraDrawing, Doc } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { goToArtboard, installArtboards, resizeArtboard } from '../../src/artboards/ops';
import { activeId, artboardsOf, findArtboard } from '../../src/artboards/model';
import { makeVariationOf } from '../../src/artboards/variationOps';
import { loadFile, saveFile } from '../../src/io/file';
import { addCamera, setView } from '../../src/camera/ops';

const doc = () => store().get().doc;
const camOf = (id: string): CameraDrawing => {
  const a = findArtboard(doc(), id)!;
  const l = (a.content ?? doc()).layers.find((x) => x.kind === 'camera')!;
  const key = l.cels[0];
  return doc().drawings[key.drawingId] as CameraDrawing;
};

beforeEach(() => {
  setViewSettings({ throughCamera: false, throughBy: {} });
  setChoice('variations.frame', 'fill');
  const d = newDoc({ name: 'Hero', width: 200, height: 100, length: 4, fps: 12 });
  d.layers = [{ ...newVectorLayer('Body'), id: 'L1' }];
  resetStore(d);
});

describe('variations: re-framing when the original is resized', () => {
  it('a cut Frameling framed is framed again, in the same undo step as the resize', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'square'))!;
    goToArtboard(orig);
    const before = camOf(v).view.zoom;
    expect(before).toBeCloseTo(1, 5);
    expect(findArtboard(doc(), v)!.framing?.mode).toBe('fill');
    resizeArtboard(orig, 400, 200);
    const a = findArtboard(doc(), v)!;
    expect(a.content!.width).toBe(100);
    expect(a.content!.height).toBe(100);
    expect(camOf(v).view).toMatchObject({ x: 200, y: 100, zoom: 0.5 });
    store().undo();
    expect(findArtboard(doc(), v)!.content!.width).toBe(100);
    expect(camOf(v).view.zoom).toBeCloseTo(1, 5);
    expect(activeId(doc())).toBe(orig);
    expect(doc().width).toBe(200);
  });

  it('leaves a cut alone once the person moved its camera', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'square'))!;
    expect(activeId(doc())).toBe(v);
    setView({ x: 30 });
    goToArtboard(orig);
    expect(camOf(v).view.x).toBe(30);
    resizeArtboard(orig, 400, 200);
    expect(camOf(v).view).toMatchObject({ x: 30, zoom: 1 });
  });

  it('keeps tracking across save and load, and still notices a moved camera', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'wide'))!;
    goToArtboard(orig);
    const back = loadFile(saveFile(doc())).doc as Doc;
    expect(artboardsOf(back).find((a) => a.id === v)!.framing?.mode).toBe('fill');
    resetStore(back);
    resizeArtboard(orig, 400, 200);
    expect(camOf(v).view.zoom).toBeCloseTo(0.5, 5);
  });

  it('zooms the original\'s own camera keys for the new fit', async () => {
    installArtboards();
    const orig = activeId(doc());
    addCamera();
    const v = (await makeVariationOf(orig, 'square'))!;
    goToArtboard(orig);
    const base = (doc().drawings[doc().layers.find((l) => l.kind === 'camera')!.cels[0].drawingId] as CameraDrawing).view.zoom;
    resizeArtboard(orig, 400, 200);
    expect(camOf(v).view.zoom).toBeCloseTo(base * 0.5, 5);
  });

  it('a cut at the original\'s own size is not tracked', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'same'))!;
    goToArtboard(orig);
    expect(findArtboard(doc(), v)!.framing).toBeUndefined();
    resizeArtboard(orig, 400, 200);
    expect(findArtboard(doc(), v)!.content!.width).toBe(400);
  });
});
