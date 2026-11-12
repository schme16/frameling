// Imported pictures are built as trimmed drawings straight away (only the painted block is held), not trimmed later on save.
import { describe, expect, it } from 'vitest';
import { drawingAt, newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { cutPicture, defaultCut, spriteDoc, spriteInto } from '../../src/pixel/import/build';
import type { Picture } from '../../src/pixel/import/picture';

const SIZE = 2000;

/** A big transparent picture with a 20 x 10 block at (300, 400) on every frame (colour changes per frame). */
function bigPicture(frames: number): Picture {
  const fr = [];
  for (let f = 0; f < frames; f++) {
    const px = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 20; x++) px.set([f + 1, 2, 3, 255], ((400 + y) * SIZE + 300 + x) * 4);
    fr.push({ pixels: px, delay: 100 });
  }
  return { width: SIZE, height: SIZE, frames: fr, kind: 'gif', notes: [] };
}

const held = (doc: { drawings: Record<string, { kind: string }> }) => Object.values(doc.drawings).reduce((n, d) => n + (d.kind === 'pixel' ? (d as PixelDrawing).pixels.byteLength : 0), 0);

describe('building from a picture', () => {
  it('a new document holds only the painted block of each frame', () => {
    const s = cutPicture(bigPicture(4), defaultCut());
    const { doc } = spriteDoc(s, { way: 'animation', name: 'Big', rowsAsSprites: true, palette: false });
    const layer = doc.layers[0] as PixelLayer;
    const d = drawingAt(doc, layer, 0) as PixelDrawing;
    expect([d.x, d.y, d.width, d.height]).toEqual([300, 400, 20, 10]);
    expect(held(doc)).toBe(4 * 20 * 10 * 4);
  });

  it('a blank frame is a blank drawing', () => {
    const pic = bigPicture(1);
    pic.frames[0].pixels.fill(0);
    const { doc } = spriteDoc(cutPicture(pic, defaultCut()), { way: 'picture', name: 'Empty', rowsAsSprites: true, palette: false });
    const d = drawingAt(doc, doc.layers[0] as PixelLayer, 0) as PixelDrawing;
    expect([d.width, d.height, d.pixels.length]).toEqual([0, 0, 0]);
  });

  it('added to an open drawing, frames are trimmed on the open drawing\'s grid', () => {
    const open = newDoc({ name: 'Open', width: 64, height: 64, length: 2, pixel: { pixelSize: 1 } });
    const px = new Uint8ClampedArray(16 * 16 * 4);
    px.set([9, 9, 9, 255], (5 * 16 + 6) * 4);
    const pic: Picture = { width: 16, height: 16, frames: [{ pixels: px }], kind: 'png', notes: [] };
    spriteInto(open, cutPicture(pic, defaultCut()), { way: 'animation', name: 'Add', rowsAsSprites: true, palette: false });
    const layer = open.layers[open.layers.length - 1] as PixelLayer;
    const d = drawingAt(open, layer, 0) as PixelDrawing;
    expect([d.width, d.height]).toEqual([1, 1]);
    // Centred on the 64 x 64 grid: the 16 x 16 picture starts at (24, 24).
    expect([d.x, d.y]).toEqual([24 + 6, 24 + 5]);
  });
});
