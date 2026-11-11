import { describe, expect, it } from 'vitest';
import { crc32, decodePng, encodePng, makeChunk, PNG_SIGNATURE, readChunks } from '../../src/io/png';

function noise(w: number, h: number, seed = 1): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < a.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    a[i] = s >>> 24;
  }
  return a;
}

describe('png', () => {
  it('has the standard crc', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a valid PNG: signature, chunks in order, crc checked', () => {
    const bytes = encodePng({ width: 3, height: 2, pixels: noise(3, 2) });
    expect([...bytes.subarray(0, 8)]).toEqual([...PNG_SIGNATURE]);
    const chunks = readChunks(bytes);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks[0].data.length).toBe(13);
  });

  it('round trips random pixels exactly, with every row filter in play', () => {
    for (const [w, h] of [[1, 1], [7, 5], [64, 33]] as const) {
      const pixels = noise(w, h, w * 31 + h);
      const back = decodePng(encodePng({ width: w, height: h, pixels }));
      expect(back.width).toBe(w);
      expect(back.height).toBe(h);
      expect(back.pixels).toEqual(pixels);
    }
  });

  it('round trips flat and gradient pictures (where the filters differ) and unfiltered output', () => {
    const w = 40;
    const h = 20;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels.set([x * 6, y * 12, (x + y) * 3, 255], (y * w + x) * 4);
    expect(decodePng(encodePng({ width: w, height: h, pixels })).pixels).toEqual(pixels);
    expect(decodePng(encodePng({ width: w, height: h, pixels }, { filter: 'none' })).pixels).toEqual(pixels);
  });

  it('keeps fully transparent pixels and alpha', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 128, 10, 20, 30, 255, 1, 2, 3, 4]);
    expect(decodePng(encodePng({ width: 2, height: 2, pixels })).pixels).toEqual(pixels);
  });

  it('refuses things that are not PNGs, cut short or damaged', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow();
    const good = encodePng({ width: 4, height: 4, pixels: noise(4, 4) });
    expect(() => decodePng(good.subarray(0, good.length - 20))).toThrow();
    const bad = good.slice();
    bad[bad.length - 20] ^= 0xff;
    expect(() => decodePng(bad)).toThrow();
  });

  it('reads an RGB picture made elsewhere', () => {
    // 2x1 RGB image, filter 0, built from chunks by hand.
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 2);
    new DataView(ihdr.buffer).setUint32(4, 1);
    ihdr[8] = 8;
    ihdr[9] = 2;
    // zlib of [0, 255,0,0, 0,0,255] made with fflate keeps this test honest without a binary blob.
    return import('fflate').then(({ zlibSync }) => {
      const idat = zlibSync(new Uint8Array([0, 255, 0, 0, 0, 0, 255]));
      const parts = [PNG_SIGNATURE, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', new Uint8Array(0))];
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.length;
      }
      expect([...decodePng(all).pixels]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    });
  });
});
