import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import type { RawImage } from '../../src/io/png';
import { resetStore, store } from '../../src/core/store';
import { planExport, defaultSettings } from '../../src/export/plan';
import { addArtboard, activeId, artboardDoc, artboardsOf, findArtboard } from '../../src/artboards/model';
import { packArtboardAtlas } from '../../src/artboards/pack';
import { buildReel, reelAt } from '../../src/artboards/player';
import { goToArtboard, installArtboards, moveArtboardTo, openArtboardUnder, resetArtboardView, resizeArtboard } from '../../src/artboards/ops';
import { setViewport } from '../../src/canvas/controller';

function img(w: number, h: number, fill: number): RawImage {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = fill;
    pixels[i * 4 + 3] = 255;
  }
  return { width: w, height: h, pixels };
}

function sprites(): Doc {
  const doc = newDoc({ name: 'Hero', width: 16, height: 16, length: 2, pixel: { pixelSize: 2 } });
  const layer = doc.layers[0] as PixelLayer;
  const d = newPixelDrawing(8, 8);
  d.pixels[3] = 255;
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c', start: 0, length: 2, drawingId: d.id });
  addArtboard(doc, { name: 'Run', width: 32, height: 16, length: 3 });
  artboardsOf(doc)[0].name = 'Idle';
  artboardsOf(doc)[1].exportName = 'hero-run';
  return doc;
}

describe('exporting artboards', () => {
  it('each artboard exports under its own name and size', () => {
    const doc = sprites();
    const s = defaultSettings(doc);
    const [a, b] = artboardsOf(doc);
    const pa = planExport(artboardDoc(doc, a.id), { ...s, range: 'all' }, 0);
    const pb = planExport(artboardDoc(doc, b.id), { ...s, range: 'all' }, 0);
    expect(pa.name).toBe('Idle');
    expect(pb.name).toBe('hero-run');
    expect(pb.count).toBe(3);
    expect(pb.width / pa.width).toBe(2);
  });

  it('packs every artboard onto one atlas, an animation each, with their clips', () => {
    const r = packArtboardAtlas(
      [
        { name: 'Idle', frames: [img(4, 4, 10), img(4, 4, 10)], clips: [] },
        { name: 'Run', frames: [img(8, 4, 20), img(8, 4, 30), img(8, 4, 40)], clips: [{ id: 'c', name: 'loop', start: 1, end: 2, loop: true }] },
      ],
      { fps: 12, scale: 1, maxSide: 4096, image: 'Hero-atlas.png' },
    );
    if ('problem' in r) throw new Error(r.problem);
    // Idle's two frames are the same, so it's one picture.
    expect(r.names).toEqual(['Idle', 'Run/0', 'Run/1', 'Run/2']);
    const json = r.json as { frames: Record<string, unknown>; animations: Record<string, { frames: string[]; loop: boolean }> };
    expect(Object.keys(json.frames)).toEqual(r.names);
    expect(json.animations.Idle.frames).toEqual(['Idle', 'Idle']);
    expect(json.animations.Run.frames).toEqual(['Run/0', 'Run/1', 'Run/2']);
    expect(json.animations['Run/loop'].frames).toEqual(['Run/1', 'Run/2']);
    expect(r.image.width * r.image.height).toBeGreaterThanOrEqual(4 * 4 + 3 * 8 * 4);
  });

  it('says when it does not fit', () => {
    const r = packArtboardAtlas([{ name: 'Big', frames: [img(64, 64, 1)], clips: [] }], { fps: 12, scale: 1, maxSide: 32, image: 'x.png' });
    expect('problem' in r).toBe(true);
  });

  it('plays the artboards in order as a reel', () => {
    const doc = sprites();
    const reel = buildReel(doc);
    expect(reel.length).toBe(5);
    expect(reelAt(reel, 1)).toEqual({ shot: 0, frame: 1 });
    expect(reelAt(reel, 4)).toEqual({ shot: 1, frame: 2 });
  });
});

describe('artboards on the store', () => {
  it('opening another keeps the view steady, and undo goes back', () => {
    resetArtboardView();
    const doc = sprites();
    resetStore(doc);
    installArtboards();
    setViewport({ w: 900, h: 600, dpr: 1 });
    store().setUi({ zoom: 2, panX: 100, panY: 50 });
    const [a, b] = artboardsOf(store().get().doc);
    goToArtboard(b.id);
    const s = store().get();
    expect(activeId(s.doc)).toBe(b.id);
    expect(s.doc.width).toBe(32);
    expect(s.ui.panX).toBe(100 + (b.x - a.x) * 2);
    store().undo();
    expect(activeId(store().get().doc)).toBe(a.id);
    expect(store().get().ui.panX).toBe(100);
  });

  it('resizes an artboard that is not open, regridding its pixels', () => {
    resetArtboardView();
    const doc = sprites();
    resetStore(doc);
    const [, b] = artboardsOf(doc);
    // Give Run a pixel drawing first.
    const run = findArtboard(store().get().doc, b.id)!.content!;
    expect(run.layers[0].kind).toBe('pixel');
    resizeArtboard(b.id, 40, 20);
    const c = findArtboard(store().get().doc, b.id)!.content!;
    expect([c.width, c.height]).toEqual([40, 20]);
    // Idle is untouched.
    expect(store().get().doc.width).toBe(16);
  });

  it('moving the open artboard moves the view with it', () => {
    resetArtboardView();
    resetStore(sprites());
    installArtboards();
    store().setUi({ zoom: 1, panX: 10, panY: 10 });
    const a = artboardsOf(store().get().doc)[0];
    moveArtboardTo(a.id, 30, -5);
    expect(artboardsOf(store().get().doc)[0].x).toBe(30);
    expect(store().get().ui.panX).toBe(40);
    expect(store().get().ui.panY).toBe(5);
  });
});

describe('the timeline follows the artboard you press on', () => {
  const open = () => {
    resetArtboardView();
    resetStore(sprites());
    installArtboards();
    store().setUi({ zoom: 1, panX: 0, panY: 0 });
    const [a, b] = artboardsOf(store().get().doc);
    // A point in the open artboard's own space that lands on the other one's body.
    const into = { x: b.x - a.x + 2, y: b.y - a.y + 2 };
    return { a, b, into };
  };

  it('opens the artboard a press lands on, and the timeline (the document own layers and length) is its', () => {
    const { a, b, into } = open();
    expect(store().get().doc.length).toBe(2);
    expect(openArtboardUnder(into, 'select')).toBe(true);
    const doc = store().get().doc;
    expect(activeId(doc)).toBe(b.id);
    expect(doc.length).toBe(3);
    expect(doc.layers).not.toBe(findArtboard(doc, a.id)!.content!.layers);
    expect(findArtboard(doc, a.id)!.content).toBeDefined();
    expect(findArtboard(doc, b.id)!.content).toBeUndefined();
  });

  it('also opens it from its name above the top edge', () => {
    const { a, b } = open();
    expect(openArtboardUnder({ x: b.x - a.x + 2, y: b.y - a.y - 10 }, 'brush')).toBe(true);
    expect(activeId(store().get().doc)).toBe(b.id);
  });

  it('leaves the view tools and the Artboard tool alone, and presses inside the open artboard', () => {
    const { a, b, into } = open();
    for (const t of ['hand', 'zoom', 'artboard']) expect(openArtboardUnder(into, t)).toBe(false);
    expect(openArtboardUnder({ x: 3, y: 3 }, 'brush')).toBe(false);
    expect(openArtboardUnder({ x: -500, y: -500 }, 'brush')).toBe(false);
    expect(activeId(store().get().doc)).toBe(a.id);
    expect(b).toBeDefined();
  });
});
