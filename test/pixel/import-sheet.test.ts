// Sprite sheet slicing, the JSON that can come with a sheet, and building sprites from the cut frames. Sheets are
// generated here, so every pixel's origin is known.
import { asGrid } from '../helpers/grid';
import { describe, expect, it } from 'vitest';
import { drawingAt } from '../../src/core/doc';
import type { Doc, PixelDrawing, PixelLayer } from '../../src/core/format';
import { artboardsOf } from '../../src/artboards/model';
import { loadFile, saveFile } from '../../src/io/file';
import type { RawImage } from '../../src/io/png';
import { cutPicture, defaultCut, mergePalette, spriteDoc, spriteInto, timingOf } from '../../src/pixel/import/build';
import { readSheetJson } from '../../src/pixel/import/sheetJson';
import { autoCells, cutCell, defaultAuto, gridCells, gridShape, onEqualFrames, orderCells, unrotate, type GridSpec } from '../../src/pixel/import/slicing';
import { newDoc } from '../../src/core/doc';
import type { Picture } from '../../src/pixel/import/picture';
import { wayOf } from '../../src/pixel/way';

type RGBA = [number, number, number, number];

/** A sheet: cells of cw x ch on a grid with a margin and spacing; cell n is filled with colour n+1 (in the red channel). */
function sheet(cols: number, rows: number, cw: number, ch: number, margin = 0, spacing = 0, blankFrom = Infinity): RawImage {
  const w = margin * 2 + cols * cw + (cols - 1) * spacing;
  const h = margin * 2 + rows * ch + (rows - 1) * spacing;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      if (n >= blankFrom) continue;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) px.set([n + 1, x, y, 255], ((margin + r * (ch + spacing) + y) * w + margin + c * (cw + spacing) + x) * 4);
    }
  return { width: w, height: h, pixels: px };
}
const picture = (img: RawImage): Picture => ({ width: img.width, height: img.height, frames: [{ pixels: img.pixels }], kind: 'png', notes: [] });
const grid = (o: Partial<GridSpec>): GridSpec => ({ by: 'size', cellW: 8, cellH: 8, cols: 1, rows: 1, margin: 0, spacing: 0, ...o });
const redOf = (img: RawImage) => img.pixels[0];

describe('grid slicing', () => {
  it('by cell size with margin and spacing', () => {
    const img = sheet(4, 3, 8, 6, 2, 1);
    const cells = gridCells(img.width, img.height, grid({ cellW: 8, cellH: 6, margin: 2, spacing: 1 }));
    expect(cells.length).toBe(12);
    expect(cells.map((c) => redOf(cutCell(img, c)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(cells[5]).toMatchObject({ x: 2 + 1 * 9, y: 2 + 1 * 7, row: 1, col: 1 });
  });
  it('by rows and columns', () => {
    const img = sheet(5, 2, 7, 9, 3, 2);
    const shape = gridShape(img.width, img.height, grid({ by: 'count', cols: 5, rows: 2, margin: 3, spacing: 2 }));
    expect(shape).toMatchObject({ cols: 5, rows: 2, cellW: 7, cellH: 9 });
    const cells = gridCells(img.width, img.height, grid({ by: 'count', cols: 5, rows: 2, margin: 3, spacing: 2 }));
    expect(cells.map((c) => redOf(cutCell(img, c)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('gives no cells for sizes that cannot work, and ignores nonsense numbers', () => {
    expect(gridCells(10, 10, grid({ cellW: 0, cellH: 0 })).length).toBe(100);
    expect(gridCells(10, 10, grid({ by: 'count', cols: 0, rows: 0 })).length).toBe(1);
    expect(gridCells(4, 4, grid({ cellW: 9, cellH: 9 })).length).toBe(0);
    expect(gridCells(10, 10, grid({ cellW: NaN as number, cellH: 2 })).length).toBeGreaterThan(0);
  });
  it('orders the cells four ways', () => {
    const cells = gridCells(16, 16, grid({ cellW: 8, cellH: 8 }));
    const at = (o: Parameters<typeof orderCells>[1]) => orderCells(cells, o).map((c) => `${c.row}${c.col}`);
    expect(at('rows')).toEqual(['00', '01', '10', '11']);
    expect(at('columns')).toEqual(['00', '10', '01', '11']);
    expect(at('rows-back')).toEqual(['11', '10', '01', '00']);
    expect(at('columns-back')).toEqual(['11', '01', '10', '00']);
  });
});

describe('finding sprites by their gutters', () => {
  const blank = (w: number, h: number): RawImage => ({ width: w, height: h, pixels: new Uint8ClampedArray(w * h * 4) });
  const box = (img: RawImage, x: number, y: number, w: number, h: number, c: RGBA = [200, 10, 10, 255]) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.pixels.set(c, (j * img.width + i) * 4);
  };
  it('finds rows and sprites along them, in reading order, sharing each row height', () => {
    const img = blank(40, 30);
    box(img, 2, 2, 6, 8);
    box(img, 12, 4, 9, 6);
    box(img, 26, 2, 5, 8);
    box(img, 3, 18, 4, 10);
    box(img, 15, 20, 8, 5);
    const cells = autoCells(img);
    expect(cells.map((c) => [c.row, c.col, c.x, c.y, c.w, c.h])).toEqual([
      [0, 0, 2, 2, 6, 8],
      [0, 1, 12, 2, 9, 8],
      [0, 2, 26, 2, 5, 8],
      [1, 0, 3, 18, 4, 10],
      [1, 1, 15, 18, 8, 10],
    ]);
  });
  it('tight cells also trim up and down', () => {
    const img = blank(30, 20);
    box(img, 2, 2, 6, 8);
    box(img, 12, 4, 9, 6);
    const cells = autoCells(img, { ...defaultAuto(), tight: true });
    expect(cells.map((c) => [c.y, c.h])).toEqual([[2, 8], [4, 6]]);
  });
  it('a bigger gutter keeps pieces of one sprite together, and specks can be left out', () => {
    const img = blank(30, 12);
    box(img, 2, 2, 4, 8);
    box(img, 8, 2, 4, 8);
    box(img, 25, 5, 1, 1);
    expect(autoCells(img, { ...defaultAuto(), gutter: 1 }).length).toBe(3);
    expect(autoCells(img, { ...defaultAuto(), gutter: 3 }).length).toBe(2);
    expect(autoCells(img, { ...defaultAuto(), minSize: 3 }).length).toBe(2);
  });
  it('a picture with no see-through pixels uses the corner colour as the empty space', () => {
    const img = blank(30, 12);
    for (let i = 0; i < img.width * img.height; i++) img.pixels.set([30, 30, 30, 255], i * 4);
    box(img, 3, 3, 5, 5, [255, 255, 0, 255]);
    box(img, 15, 2, 6, 7, [0, 255, 255, 255]);
    expect(autoCells(img).length).toBe(2);
    expect(autoCells(img, { ...defaultAuto(), background: 'transparent' }).length).toBe(1);
  });
});

describe('equal frames', () => {
  const one = (w: number, h: number): RawImage => ({ width: w, height: h, pixels: new Uint8ClampedArray(w * h * 4).fill(255) });
  it('puts smaller pictures where asked', () => {
    const [a, b] = onEqualFrames([one(4, 4), one(8, 6)], 'bottom');
    expect([a.width, a.height, b.width, b.height]).toEqual([8, 6, 8, 6]);
    // 4x4 on 8x6 at the bottom middle: its first solid pixel is at x 2, y 2.
    expect(a.pixels[(2 * 8 + 2) * 4 + 3]).toBe(255);
    expect(a.pixels[(1 * 8 + 2) * 4 + 3]).toBe(0);
    const [c] = onEqualFrames([one(4, 4), one(8, 6)], 'top-left');
    expect(c.pixels[3]).toBe(255);
    expect(c.pixels[(0 * 8 + 4) * 4 + 3]).toBe(0);
  });
  it('turns a packed sprite back', () => {
    const img: RawImage = { width: 2, height: 3, pixels: new Uint8ClampedArray(2 * 3 * 4) };
    img.pixels.set([9, 9, 9, 255], 0); // top left of the stored (turned) picture
    const back = unrotate(img);
    expect([back.width, back.height]).toEqual([3, 2]);
    // The stored picture is the sprite turned a quarter clockwise, so its top left was the sprite's bottom left.
    expect(back.pixels[(1 * 3 + 0) * 4]).toBe(9);
  });
});

describe('the JSON that comes with a sheet', () => {
  const ase = {
    frames: [
      { filename: 'a 0', frame: { x: 0, y: 0, w: 8, h: 8 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, duration: 100 },
      { filename: 'a 1', frame: { x: 8, y: 0, w: 6, h: 8 }, rotated: false, trimmed: true, spriteSourceSize: { x: 1, y: 0, w: 6, h: 8 }, sourceSize: { w: 8, h: 8 }, duration: 200 },
      { filename: 'a 2', frame: { x: 14, y: 0, w: 8, h: 8 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, duration: 100 },
    ],
    meta: {
      app: 'http://www.aseprite.org/',
      size: { w: 22, h: 8 },
      frameTags: [{ name: 'walk', from: 0, to: 1, direction: 'pingpong' }, { name: 'idle', from: 2, to: 2, direction: 'forward' }],
      slices: [{ name: 'box', color: '#0000ffff', keys: [{ frame: 0, bounds: { x: 2, y: 3, w: 10, h: 10 }, center: { x: 3, y: 3, w: 4, h: 4 }, pivot: { x: 5, y: 9 } }] }],
    },
  };
  it('reads Aseprite sheet JSON: frames, delays, tags and slices (centre and pivot measured from the slice corner)', () => {
    const d = readSheetJson(JSON.stringify(ase))!;
    expect(d.cells.map((c) => [c.name, c.x, c.w, c.delay])).toEqual([['a 0', 0, 8, 100], ['a 1', 8, 6, 200], ['a 2', 14, 8, 100]]);
    expect(d.cells[1]).toMatchObject({ source: { w: 8, h: 8 }, offset: { x: 1, y: 0 } });
    expect(d.tags).toEqual([{ name: 'walk', from: 0, to: 1, loop: true, direction: 'pingpong' }, { name: 'idle', from: 2, to: 2, loop: true }]);
    expect(d.slices[0]).toMatchObject({ name: 'box', x: 2, y: 3, w: 10, h: 10, center: { x: 5, y: 6, w: 4, h: 4 }, pivot: { x: 7, y: 12 } });
  });
  it('reads a TexturePacker hash with a rotated frame and a pivot', () => {
    const d = readSheetJson(JSON.stringify({ frames: { 'hero.png': { frame: { x: 0, y: 0, w: 4, h: 6 }, rotated: true, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 6, h: 4 }, sourceSize: { w: 6, h: 4 }, pivot: { x: 0.5, y: 1 } } }, meta: { app: 'TexturePacker' } }))!;
    expect(d.cells[0]).toMatchObject({ rotated: true, name: 'hero.png', pivot: { x: 3, y: 4 } });
  });
  it("reads Frameling's own sheet JSON, with animations as frame numbers or names", () => {
    const f = (x: number) => ({ frame: { x, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 }, duration: 83 });
    const arr = readSheetJson(JSON.stringify({ meta: { format: 'frameling-atlas' }, frames: [f(0), f(4), f(8)], animations: { run: { fps: 12, loop: true, frames: [0, 1, 2] }, odd: { frames: [0, 2] } } }))!;
    expect(arr.tags).toEqual([{ name: 'run', from: 0, to: 2, loop: true }]);
    expect(arr.notes.join(' ')).toMatch(/odd/);
    const hash = readSheetJson(JSON.stringify({ meta: {}, frames: { a: f(0), b: f(4) }, animations: { go: { loop: false, frames: ['a', 'b'] } } }))!;
    expect(hash.tags).toEqual([{ name: 'go', from: 0, to: 1, loop: false }]);
  });
  it('is null for anything else', () => {
    expect(readSheetJson('not json')).toBeNull();
    expect(readSheetJson('{"a":1}')).toBeNull();
    expect(readSheetJson('[1,2]')).toBeNull();
    expect(readSheetJson('{"frames":[]}')).toBeNull();
  });
});

describe('cutting a picture into a sprite', () => {
  it('a grid becomes frames, with empty cells at the end left out', () => {
    const img = sheet(4, 2, 8, 8, 0, 0, 6);
    const s = cutPicture(picture(img), { ...defaultCut(), cutting: { how: 'grid', grid: grid({}) } });
    expect(s.frames.length).toBe(6);
    expect(s.groups.map((g) => g.frames)).toEqual([[0, 1, 2, 3], [4, 5]]);
    expect(s.notes.join(' ')).toMatch(/2 empty cells/);
    const keep = cutPicture(picture(img), { ...defaultCut(), skipBlank: false, cutting: { how: 'grid', grid: grid({}) } });
    expect(keep.frames.length).toBe(8);
  });
  it('column order changes the frame order', () => {
    const img = sheet(3, 2, 4, 4);
    const s = cutPicture(picture(img), { ...defaultCut(), order: 'columns', cutting: { how: 'grid', grid: grid({ cellW: 4, cellH: 4 }) } });
    expect(s.frames.map((f) => f.image.pixels[0])).toEqual([1, 4, 2, 5, 3, 6]);
  });
  it('JSON: trimmed frames go back on their full frame, tags follow, delays carry', () => {
    const img = sheet(3, 1, 8, 8);
    const json = readSheetJson(JSON.stringify({
      frames: [
        { filename: 'a', frame: { x: 0, y: 0, w: 8, h: 8 }, spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, duration: 100 },
        { filename: 'b', frame: { x: 8, y: 0, w: 4, h: 4 }, spriteSourceSize: { x: 2, y: 3, w: 4, h: 4 }, sourceSize: { w: 8, h: 8 }, duration: 200 },
      ],
      meta: { frameTags: [{ name: 'x', from: 0, to: 1 }] },
    }))!;
    const s = cutPicture(picture(img), { ...defaultCut(), cutting: { how: 'json', data: json } });
    expect([s.width, s.height, s.frames.length]).toEqual([8, 8, 2]);
    expect(s.frames[1].delay).toBe(200);
    // Frame b's pixel (0,0) of the cut sits at (2,3) of the full frame.
    expect(s.frames[1].image.pixels[(3 * 8 + 2) * 4]).toBe(2);
    expect(s.frames[1].image.pixels[0 + 3]).toBe(0);
    expect(s.tags[0]).toMatchObject({ name: 'x', from: 0, to: 1 });
    expect(s.groups[0]).toEqual({ name: 'x', frames: [0, 1] });
  });
  it('a GIF is taken frame by frame, and delays make the timing', () => {
    const f = (v: number) => ({ pixels: new Uint8ClampedArray(4 * 4 * 4).fill(v), delay: v === 1 ? 100 : 200 });
    const pic: Picture = { width: 4, height: 4, frames: [f(1), f(2), f(1)], kind: 'gif', notes: [] };
    const s = cutPicture(pic, { ...defaultCut(), cutting: { how: 'grid', grid: grid({ cellW: 2, cellH: 2 }) } });
    expect(s.frames.length).toBe(3);
    const t = timingOf(s);
    expect(t.fps).toBe(10);
    expect(t.holds).toEqual([1, 2, 1]);
    expect(t.length).toBe(4);
  });
});

describe('new documents in each way', () => {
  const frames = () => cutPicture(picture(sheet(3, 2, 6, 4)), { ...defaultCut(), cutting: { how: 'grid', grid: grid({ cellW: 6, cellH: 4 }) } });
  const px = (doc: Doc, layer: PixelLayer, f: number) => (drawingAt(doc, layer, f) as PixelDrawing).pixels[0];
  const opts = { name: 'Hero', rowsAsSprites: true, palette: false };

  it('an animation: frames on the timeline in order', () => {
    const { doc } = spriteDoc(frames(), { ...opts, way: 'animation' });
    expect([doc.width, doc.height, doc.length]).toEqual([6, 4, 6]);
    expect([0, 1, 2, 3, 4, 5].map((f) => px(doc, doc.layers[0] as PixelLayer, f))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(wayOf(doc)).toBe('animation');
    expect(doc.clips.length).toBe(1);
  });
  it('one picture takes the first cell', () => {
    const { doc, notes } = spriteDoc(frames(), { ...opts, way: 'picture' });
    expect(doc.length).toBe(1);
    expect(wayOf(doc)).toBe('picture');
    expect(notes.join(' ')).toMatch(/first picture/);
  });
  it('frames on boards: one board per frame', () => {
    const { doc } = spriteDoc(frames(), { ...opts, way: 'boards' });
    const boards = artboardsOf(doc);
    expect(boards.length).toBe(6);
    expect(boards.map((b) => b.name)).toEqual(['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4', 'Frame 5', 'Frame 6']);
    expect(px(doc, doc.layers[0] as PixelLayer, 0)).toBe(1);
    expect((boards[4].content!.layers[0] as PixelLayer).cels.length).toBe(1);
    expect(wayOf(doc)).toBe('boards');
  });
  it('sprites on a sheet: a board per row, or per cell', () => {
    const rows = spriteDoc(frames(), { ...opts, way: 'sheet' }).doc;
    expect(artboardsOf(rows).map((b) => b.name)).toEqual(['Row 1', 'Row 2']);
    expect(rows.length).toBe(3);
    expect(rows.clips[0]).toMatchObject({ start: 0, end: 2 });
    expect(artboardsOf(rows)[1].content!.clips[0]).toMatchObject({ start: 0, end: 2 });
    const cells = spriteDoc(frames(), { ...opts, way: 'sheet', rowsAsSprites: false }).doc;
    expect(artboardsOf(cells).length).toBe(6);
  });
  it('can take the picture colours as the palette, and the result saves and opens again', () => {
    const { doc } = spriteDoc(frames(), { ...opts, way: 'animation', palette: true });
    expect(doc.palette!.colors.length).toBeGreaterThan(5);
    const back = loadFile(saveFile(doc, 'test')).doc;
    expect(back.length).toBe(doc.length);
    expect(back.palette!.colors).toEqual(doc.palette!.colors);
  });
  it('merging colours keeps the ones already there', () => {
    expect(mergePalette({ name: 'a', colors: ['#ff0000'] }, { name: 'b', colors: ['#FF0000', '#00ff00'] }).colors).toEqual(['#ff0000', '#00ff00']);
  });
});

describe('adding to an open drawing', () => {
  const sprite = () => cutPicture(picture(sheet(2, 1, 6, 4)), { ...defaultCut(), cutting: { how: 'grid', grid: grid({ cellW: 6, cellH: 4 }) } });
  const base = () => newDoc({ name: 'Open', width: 16, height: 12, fps: 12, length: 4, background: null, pixel: { pixelSize: 1 } });

  it('animation: a new layer from the current frame, centred, the drawing grows to fit', () => {
    const d = base();
    spriteInto(d, sprite(), { way: 'animation', name: 'Hero', rowsAsSprites: true, palette: false }, 3);
    const layer = d.layers[d.layers.length - 1] as PixelLayer;
    expect(layer.name).toBe('Hero');
    expect(d.length).toBe(5);
    const held = drawingAt(d, layer, 3) as PixelDrawing;
    // Only the painted 6x4 block is kept, at (5, 4).
    expect([held.x, held.y, held.width, held.height]).toEqual([5, 4, 6, 4]);
    const dr = asGrid(held, d) as PixelDrawing;
    expect([dr.width, dr.height]).toEqual([16, 12]);
    // Centred: the 6x4 cell on 16x12 starts at (5, 4); cell pixel (0,0) has red 1.
    expect(dr.pixels[(4 * 16 + 5) * 4]).toBe(1);
    expect(dr.pixels[0 + 3]).toBe(0);
  });
  it('cuts what does not fit, and says so', () => {
    const d = newDoc({ name: 'Small', width: 4, height: 4, pixel: { pixelSize: 1 } });
    const notes = spriteInto(d, sprite(), { way: 'picture', name: 'Hero', rowsAsSprites: true, palette: false });
    expect(notes.join(' ')).toMatch(/cut off/);
  });
  it('boards add boards beside the open one', () => {
    const d = base();
    spriteInto(d, sprite(), { way: 'boards', name: 'Hero', rowsAsSprites: true, palette: false });
    expect(artboardsOf(d).length).toBe(3);
  });
  it('slices from a JSON follow the picture to where it is placed', () => {
    const s = sprite();
    s.slices = [{ name: 'hit', x: 1, y: 1, w: 3, h: 2, center: { x: 2, y: 1, w: 1, h: 1 }, pivot: { x: 2, y: 4 } }];
    const d = base();
    spriteInto(d, s, { way: 'picture', name: 'Hero', rowsAsSprites: true, palette: false });
    const layer = d.layers[d.layers.length - 1] as PixelLayer;
    expect(layer.slices![0]).toMatchObject({ name: 'hit', x: 6, y: 5, center: { x: 7, y: 5, w: 1, h: 1 }, pivot: { x: 7, y: 8 } });
  });
});
