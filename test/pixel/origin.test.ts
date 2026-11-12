// Pixel drawings hold only their painted part: a block at (x, y) on the art grid, blank = 0 x 0.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBlankPixelDrawing, newDoc, newPixelDrawing } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { coversGrid, gridPixels, placeOnGrid, pixelsOver, setGridPixels, trimmedDrawing, trimPixels, unionRect } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { encodePng } from '../../src/io/png';
import { drawDrawing, drawingBox } from '../../src/core/render';
import { frameToSvg, pixelRects } from '../../src/export/svg';
import { docToLottie } from '../../src/export/lottie';
import { addPixelLayer, hold } from '../../src/templates/build';
import { PixelSession } from '../../src/tools/pixelSession';
import { newBlankKey } from '../../src/timeline/edit-core';
import { pixelBounds } from '../../src/canvas/lost';
import { regridPixels } from '../../src/canvas/resize';
import { asGrid } from '../helpers/grid';

const RED = [255, 0, 0, 255] as const;

function grid(w: number, h: number, dots: [number, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of dots) px.set(RED, (y * w + x) * 4);
  return px;
}

describe('trimming', () => {
  it('cuts a grid to the painted block and remembers where it was', () => {
    const t = trimPixels(grid(10, 8, [[3, 2], [6, 5]]), 10, 8);
    expect([t.x, t.y, t.width, t.height]).toEqual([3, 2, 4, 4]);
    expect([...t.pixels.slice(0, 4)]).toEqual([...RED]);
    expect([...t.pixels.slice(((3 * 4) + 3) * 4, ((3 * 4) + 3) * 4 + 4)]).toEqual([...RED]);
  });

  it('gives a blank drawing for a grid with nothing painted, and keeps a full one as it is', () => {
    expect(trimPixels(new Uint8ClampedArray(16 * 4), 4, 4)).toMatchObject({ width: 0, height: 0 });
    const all = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    expect(trimPixels(all, 2, 2).pixels).toBe(all);
  });

  it('does not count see-through pixels, whatever colour they hold', () => {
    const px = new Uint8ClampedArray(4 * 4 * 4);
    px.set([9, 9, 9, 0], 0);
    px.set(RED, (2 * 4 + 1) * 4);
    expect(trimPixels(px, 4, 4)).toMatchObject({ x: 1, y: 2, width: 1, height: 1 });
  });

  it('lays a block back on the grid, and cuts what falls off it', () => {
    const t = trimPixels(grid(10, 8, [[3, 2], [6, 5]]), 10, 8);
    expect([...placeOnGrid(t, 10, 8)]).toEqual([...grid(10, 8, [[3, 2], [6, 5]])]);
    expect([...placeOnGrid(t, 5, 4)]).toEqual([...grid(5, 4, [[3, 2]])]);
  });

  it('gridPixels returns the drawing itself when it covers the grid, and the same copy for the same drawing', () => {
    const full = newPixelDrawing(4, 4);
    expect(coversGrid(full, 4, 4)).toBe(true);
    expect(gridPixels(full, 4, 4)).toBe(full.pixels);
    const d = trimmedDrawing({ ...newPixelDrawing(10, 8), pixels: grid(10, 8, [[3, 2]]) });
    expect(d).toMatchObject({ x: 3, y: 2, width: 1, height: 1 });
    expect(gridPixels(d, 10, 8)).toBe(gridPixels(d, 10, 8));
    expect([...gridPixels(d, 10, 8)]).toEqual([...grid(10, 8, [[3, 2]])]);
  });

  it('setGridPixels leaves x and y out for a drawing at the corner', () => {
    const d: PixelDrawing = { id: 'a', kind: 'pixel', x: 5, y: 5, width: 1, height: 1, pixels: new Uint8ClampedArray(4) };
    setGridPixels(d, grid(6, 6, [[0, 0], [1, 1]]), 6, 6);
    expect(d.x).toBeUndefined();
    expect(d.y).toBeUndefined();
    expect([d.width, d.height]).toEqual([2, 2]);
  });

  it('unionRect and pixelsOver put two blocks over one area', () => {
    const a: PixelDrawing = { id: 'a', kind: 'pixel', x: 2, y: 2, width: 1, height: 1, pixels: new Uint8ClampedArray(RED) };
    const b: PixelDrawing = { id: 'b', kind: 'pixel', x: 5, y: 4, width: 1, height: 2, pixels: new Uint8ClampedArray(8).fill(1) };
    const u = unionRect(a, b)!;
    expect(u).toEqual({ x: 2, y: 2, w: 4, h: 4 });
    expect([...pixelsOver(a, u).slice(0, 4)]).toEqual([...RED]);
    expect(unionRect(newBlankPixelDrawing(), newBlankPixelDrawing())).toBeNull();
  });
});

describe('painting', () => {
  beforeEach(() => {
    // A 400 x 300 page at 1 per pixel: a 400 x 300 art grid.
    resetStore(newDoc({ width: 400, height: 300, pixel: { pixelSize: 1 } }));
  });

  const paint = (dots: [number, number][], c: readonly [number, number, number, number] = RED) => {
    const { doc, ui } = store().get();
    const s = new PixelSession(doc, doc.layers[0] as PixelLayer, ui.frame);
    for (const [x, y] of dots) s.set(x, y, [...c] as [number, number, number, number]);
    return s.commit('Paint');
  };
  const drawing = () => Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing;

  it('a new drawing holds nothing, and the first stroke holds only what it painted', () => {
    expect(paint([[100, 50], [103, 52]])).toBe('ok');
    const d = drawing();
    expect([d.x, d.y, d.width, d.height]).toEqual([100, 50, 4, 3]);
    expect(d.pixels.length).toBe(4 * 3 * 4);
  });

  it('grows as you paint further out, and keeps what was there', () => {
    paint([[100, 50]]);
    paint([[90, 60]]);
    const d = drawing();
    expect([d.x, d.y, d.width, d.height]).toEqual([90, 50, 11, 11]);
    const g = asGrid(d);
    expect(g.pixels[(50 * 400 + 100) * 4 + 3]).toBe(255);
    expect(g.pixels[(60 * 400 + 90) * 4 + 3]).toBe(255);
  });

  it('shrinks when the outer pixels are rubbed out, and is blank again when everything is', () => {
    paint([[100, 50], [140, 90]]);
    expect(drawing().width).toBe(41);
    paint([[140, 90]], [0, 0, 0, 0]);
    expect([drawing().x, drawing().y, drawing().width, drawing().height]).toEqual([100, 50, 1, 1]);
    paint([[100, 50]], [0, 0, 0, 0]);
    expect([drawing().width, drawing().height, drawing().pixels.length]).toEqual([0, 0, 0]);
  });

  it('undo brings back the drawing as it was, block and all', () => {
    paint([[100, 50]]);
    const before = drawing();
    paint([[10, 10]]);
    store().undo();
    expect(drawing()).toEqual(before);
    store().redo();
    expect([drawing().x, drawing().y]).toEqual([10, 10]);
  });

  it('a picture that fills the grid is held whole (x and y missing)', () => {
    resetStore(newDoc({ width: 4, height: 4, pixel: { pixelSize: 1 } }));
    const dots: [number, number][] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) dots.push([x, y]);
    paint(dots);
    const d = drawing();
    expect([d.x, d.y, d.width, d.height]).toEqual([undefined, undefined, 4, 4]);
  });

  it('a blank key made by the timeline holds no pixels', () => {
    const doc = newDoc({ width: 2000, height: 2000, pixel: { pixelSize: 1 } });
    newBlankKey(doc, doc.layers[0].id, 3);
    const d = Object.values(doc.drawings).find((x) => x.kind === 'pixel') as PixelDrawing;
    expect(d.pixels.byteLength).toBe(0);
  });
});

describe('the file', () => {
  const docWith = (d: PixelDrawing) => {
    const doc = newDoc({ width: 64, height: 48, pixel: { pixelSize: 2 } });
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c1', start: 0, length: 1, drawingId: d.id });
    return doc;
  };
  const block = (x: number, y: number): PixelDrawing => ({ id: 'p1', kind: 'pixel', x, y, width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(200) });

  it('keeps a drawing that sits away from the corner, with its place', () => {
    const doc = docWith(block(10, 7));
    const back = loadFile(saveFile(doc)).doc;
    expect(back.drawings.p1).toMatchObject({ x: 10, y: 7, width: 2, height: 2 });
    expect([...(back.drawings.p1 as PixelDrawing).pixels]).toEqual(new Array(16).fill(200));
    const text = strFromU8(unzipSync(saveFile(doc))['doc.json']);
    expect(text).toContain('"x":10');
  });

  it('keeps a blank drawing blank, with no picture entry for it', () => {
    const doc = docWith({ ...newBlankPixelDrawing(), id: 'p1' });
    const files = unzipSync(saveFile(doc));
    expect(Object.keys(files).some((n) => n.startsWith('pixels/'))).toBe(false);
    expect(loadFile(saveFile(doc)).doc.drawings.p1).toMatchObject({ width: 0, height: 0 });
  });

  it('saves a whole-grid drawing as just its painted part, and opens it trimmed', () => {
    const full = newPixelDrawing(32, 24);
    full.id = 'p1';
    full.pixels.set(RED, (5 * 32 + 6) * 4);
    const doc = docWith(full);
    const files = unzipSync(saveFile(doc));
    expect(files['pixels/p1.png'].length).toBeLessThan(200);
    const back = loadFile(saveFile(doc)).doc.drawings.p1 as PixelDrawing;
    expect([back.x, back.y, back.width, back.height]).toEqual([6, 5, 1, 1]);
    // Over the whole grid it is the same picture.
    expect([...gridPixels(back, 32, 24)]).toEqual([...full.pixels]);
  });

  it('opens a version 2 file (whole-grid drawings, no x or y) unchanged', () => {
    const full = newPixelDrawing(32, 24);
    full.id = 'p1';
    full.pixels.set(RED, 0);
    const files = unzipSync(saveFile(docWith(full)));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.version = 2;
    // The picture as an older build wrote it: the whole 32 x 24 grid.
    const doc = JSON.parse(strFromU8(files['doc.json']));
    expect(doc.drawings.p1.width).toBe(1);
    const old = docWith(full);
    const oldFiles = unzipSync(saveFile(old));
    oldFiles['pixels/p1.png'] = encodePng({ width: 32, height: 24, pixels: full.pixels }, { level: 0 });
    doc.drawings.p1 = { id: 'p1', kind: 'pixel', width: 32, height: 24, pixels: 'pixels/p1.png' };
    oldFiles['doc.json'] = strToU8(JSON.stringify(doc));
    oldFiles['manifest.json'] = strToU8(JSON.stringify(manifest));
    const loaded = loadFile(zipSync(oldFiles));
    expect(loaded.warnings).toEqual([]);
    expect([...gridPixels(loaded.doc.drawings.p1 as PixelDrawing, 32, 24)]).toEqual([...full.pixels]);
  });

  it('does not trim tile frames', () => {
    const doc = newDoc({ width: 32, height: 32 });
    const tile = newPixelDrawing(8, 8);
    doc.drawings[tile.id] = tile;
    doc.tileset = { tileWidth: 8, tileHeight: 8, nextKey: 2, tiles: [{ key: 1, name: 'Empty', frames: [{ drawingId: tile.id, duration: 1 }] }] } as never;
    const back = loadFile(saveFile(doc)).doc.drawings[tile.id] as PixelDrawing;
    expect([back.width, back.height]).toEqual([8, 8]);
  });
});

describe('drawing', () => {
  const doc = newDoc({ width: 64, height: 64 });
  const d: PixelDrawing = { id: 'p', kind: 'pixel', x: 3, y: 5, width: 2, height: 1, pixels: new Uint8ClampedArray(8).fill(255) };

  afterEach(() => vi.unstubAllGlobals());

  it('puts the block where it sits on the grid', () => {
    class Canvas {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { putImageData: () => {} };
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    });
    const calls: number[][] = [];
    const g = { imageSmoothingEnabled: true, drawImage: (...a: unknown[]) => void calls.push(a.slice(1) as number[]) };
    drawDrawing(g as never, d, 8);
    expect(calls).toEqual([[24, 40, 16, 8]]);
    // A blank drawing draws nothing.
    drawDrawing(g as never, { ...d, width: 0, height: 0, pixels: new Uint8ClampedArray(0) }, 8);
    expect(calls).toHaveLength(1);
  });

  it('has a box where the block is (and none for a blank drawing)', () => {
    expect(drawingBox(d, 8)).toMatchObject({ x0: 24, y0: 40, x1: 40, y1: 48 });
    const blank = newBlankPixelDrawing();
    expect(drawingBox(blank, 8).x1).toBeLessThan(drawingBox(blank, 8).x0);
    void doc;
  });

  it('reports its painted box on the grid', () => {
    expect(pixelBounds(d)).toEqual({ x: 3, y: 5, w: 2, h: 1 });
    expect(pixelBounds(newBlankPixelDrawing())).toBeNull();
  });

  it('SVG rectangles sit at the block', () => {
    expect(pixelRects(d, 8)).toEqual(['<rect x="24" y="40" width="16" height="8" fill="#ffffff"/>']);
  });

  it('SVG frame and Lottie layer place a layer at its block', () => {
    const page = newDoc({ width: 64, height: 64, length: 2, background: null });
    page.layers = [];
    const l = addPixelLayer(page, 'Art', 8);
    page.drawings[d.id] = { ...d };
    hold(l, d.id, 0, 2);
    expect(frameToSvg(page, 0)).toContain('<rect x="24" y="40" width="16" height="8"');
    const lot = docToLottie(page);
    expect(lot.layers.find((x: any) => x.ty === 2).ks.p.k).toEqual([24, 40]);
  });
});

describe('moving the canvas', () => {
  it('moves the block and cuts it at the new edge', () => {
    const d: PixelDrawing = { id: 'p', kind: 'pixel', x: 2, y: 2, width: 4, height: 2, pixels: new Uint8ClampedArray(32).fill(255) };
    expect(regridPixels(d, 20, 20, 3, 1)).toMatchObject({ x: 5, y: 3, width: 4, height: 2 });
    expect(regridPixels(d, 20, 20, 0, 0)).toBe(d);
    const cut = regridPixels(d, 5, 20, 0, 0);
    expect([cut.x, cut.y, cut.width, cut.height]).toEqual([2, 2, 3, 2]);
    expect(regridPixels(d, 20, 20, -6, 0)).toMatchObject({ width: 0, height: 0 });
  });
});
