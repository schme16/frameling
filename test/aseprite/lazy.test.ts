// Reading an Aseprite file lazily: each cel's picture is unpacked when it becomes a drawing and not kept, so a big file
// never holds every picture unpacked at once. The drawings that come out are the same as with the eager reader.
import { describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { asepriteDoc } from '../../src/aseprite/convert';
import { AsepriteProblem, parseAseprite } from '../../src/aseprite/parse';
import { aseFile, celChunk, layerChunk, paletteChunk, rgbaImage } from './writer';

const bytes = aseFile({
  width: 40,
  height: 30,
  depth: 32,
  frames: [
    { duration: 100, chunks: [paletteChunk([[0, 0, 0, 0], [255, 0, 0]]), layerChunk({ name: 'A' }), layerChunk({ name: 'B' }), celChunk({ layer: 0, kind: 'image', x: 5, y: 6, width: 30, height: 20, data: rgbaImage(30, 20, (x, y) => [x * 8, y * 12, 3, x > 3 && y > 2 ? 255 : 0]) }), celChunk({ layer: 1, kind: 'raw', x: 0, y: 0, width: 4, height: 4, data: rgbaImage(4, 4, () => [9, 9, 9, 255]) })] },
    { duration: 100, chunks: [celChunk({ layer: 0, kind: 'linked', link: 0 }), celChunk({ layer: 1, kind: 'image', x: 2, y: 2, width: 2, height: 2, data: rgbaImage(2, 2, () => [1, 2, 3, 255]) })] },
  ],
});

const drawingsOf = (doc: ReturnType<typeof asepriteDoc>['doc']) => doc.layers.map((l) => l.cels.map((c) => {
  const d = doc.drawings[c.drawingId] as PixelDrawing;
  return { start: c.start, length: c.length, x: d.x ?? 0, y: d.y ?? 0, w: d.width, h: d.height, px: [...d.pixels] };
}));

describe('lazy Aseprite reading', () => {
  it('makes the same drawings as the eager reader', () => {
    expect(drawingsOf(asepriteDoc(parseAseprite(bytes, { lazy: true }), 'a').doc)).toEqual(drawingsOf(asepriteDoc(parseAseprite(bytes), 'a').doc));
  });

  it('keeps no unpacked picture: every read of a cel gives a fresh copy', () => {
    const file = parseAseprite(bytes, { lazy: true });
    const img = file.frames[0].cels[0].image!;
    const a = img.data;
    const b = img.data;
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);
    expect(a.length).toBe(30 * 20 * 4);
  });

  it('a damaged picture is found when it is read, and says so in plain words', () => {
    const bad = new Uint8Array(bytes);
    // Spoil the packed bytes of the first compressed cel (they follow the 20 byte cel header and 4 bytes of size).
    const at = bad.findIndex((_, i) => bad[i] === 0x78 && (bad[i + 1] === 0x9c || bad[i + 1] === 0x01 || bad[i + 1] === 0xda));
    bad[at + 3] ^= 0xff;
    bad[at + 4] ^= 0xff;
    expect(() => parseAseprite(bad)).toThrow(AsepriteProblem);
    const lazy = parseAseprite(bad, { lazy: true });
    expect(() => asepriteDoc(lazy, 'bad')).toThrow(AsepriteProblem);
  });
});
