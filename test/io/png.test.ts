import { describe, expect, it } from 'vitest';
import { crc32, decodePng, encodePng, makeChunk, PNG_SIGNATURE, readChunks, unfilter } from '../../src/io/png';
import { zlibSync } from 'fflate';

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

  /** A hand-made PNG: header fields, extra chunks and raw (already filtered, filter 0) rows. */
  function make(w: number, h: number, depth: number, ctype: number, rows: number[][], extra: [string, number[]][] = []): Uint8Array {
    const head = new Uint8Array(13);
    new DataView(head.buffer).setUint32(0, w);
    new DataView(head.buffer).setUint32(4, h);
    head[8] = depth;
    head[9] = ctype;
    const raw = new Uint8Array(rows.flatMap((r) => [0, ...r]));
    const parts = [PNG_SIGNATURE, makeChunk('IHDR', head), ...extra.map(([t, d]) => makeChunk(t, new Uint8Array(d))), makeChunk('IDAT', zlibSync(raw)), makeChunk('IEND', new Uint8Array(0))];
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    return all;
  }

  it('reads pixel art kinds: 4 bit palette with transparency, 1 bit grey, 16 bit colour, a transparent colour', () => {
    // 4 bit palette, 3 pixels in a row (indexes 0, 1, 2), the second colour half see-through.
    const pal = decodePng(make(3, 1, 4, 3, [[0x01, 0x20]], [['PLTE', [10, 20, 30, 40, 50, 60, 70, 80, 90]], ['tRNS', [255, 128]]]));
    expect([...pal.pixels]).toEqual([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255]);
    // 1 bit grey: 1 0 1 reads as white black white.
    expect([...decodePng(make(3, 1, 1, 0, [[0b10100000]])).pixels]).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    // 16 bit RGB: the top byte of each sample is kept.
    expect([...decodePng(make(1, 1, 16, 2, [[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]])).pixels]).toEqual([0x12, 0x56, 0x9a, 255]);
    // 8 bit RGB with a transparent colour.
    const key = decodePng(make(2, 1, 8, 2, [[1, 2, 3, 4, 5, 6]], [['tRNS', [0, 1, 0, 2, 0, 3]]]));
    expect([...key.pixels]).toEqual([1, 2, 3, 0, 4, 5, 6, 255]);
  });
});

describe('unfilter (the fast row filter undoing)', () => {
  // The plain version, one byte at a time, as the decoder first had it.
  function reference(raw: Uint8Array, from: number, stride: number, bpp: number, h: number): Uint8Array {
    const rows = new Uint8Array(stride * h);
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let y = 0; y < h; y++) {
      const f = raw[from + y * (stride + 1)];
      const src = from + y * (stride + 1) + 1;
      const dst = y * stride;
      const prev = dst - stride;
      for (let i = 0; i < stride; i++) {
        const x = raw[src + i];
        const a = i >= bpp ? rows[dst + i - bpp] : 0;
        const b = y > 0 ? rows[prev + i] : 0;
        const c = y > 0 && i >= bpp ? rows[prev + i - bpp] : 0;
        const v = f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c);
        rows[dst + i] = v & 255;
      }
    }
    return rows;
  }

  it('gives the same rows as the byte-by-byte version for every filter, pixel size and width', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 255;
    for (const bpp of [1, 2, 3, 4, 6, 8]) {
      for (const stride of [1, 2, 3, 4, 5, 8, 13, 64]) {
        for (let trial = 0; trial < 6; trial++) {
          const h = 7;
          const offset = trial % 3;
          const raw = new Uint8Array(offset + (stride + 1) * h);
          for (let i = 0; i < raw.length; i++) raw[i] = rnd();
          for (let y = 0; y < h; y++) raw[offset + y * (stride + 1)] = (y + trial) % 5;
          expect(unfilter(raw, offset, stride, bpp, h)).toEqual(reference(raw, offset, stride, bpp, h));
        }
      }
    }
  });

  it('still refuses a filter type that does not exist', () => {
    const raw = new Uint8Array([9, 1, 2, 3, 4]);
    expect(() => unfilter(raw, 0, 4, 4, 1)).toThrow(/damaged/);
  });
});
