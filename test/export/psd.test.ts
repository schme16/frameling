import { describe, expect, it } from 'vitest';
import { initializeCanvas, readPsd } from 'ag-psd';
import { blendKey, packBits, writePsd, type PsdLayer } from '../../src/export/psd';
import type { RawImage } from '../../src/io/png';

function img(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): RawImage {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) pixels.set(fill(x, y), (y * w + x) * 4);
  return { width: w, height: h, pixels };
}

function unpack(b: Uint8Array, n: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (out.length < n) {
    const c = b[i++];
    if (c < 128) for (let k = 0; k <= c; k++) out.push(b[i++]);
    else {
      const v = b[i++];
      for (let k = 0; k < 257 - c; k++) out.push(v);
    }
  }
  return out;
}

// The reader only needs ImageData-like objects here (no real canvas in tests).
initializeCanvas(
  () => {
    throw new Error('no canvas in tests');
  },
  (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData,
);

describe('PSD writer', () => {
  it('packs rows so they unpack to the same bytes', () => {
    for (const row of [[1, 1, 1, 1, 2, 3, 4, 4, 4], [], [5], Array.from({ length: 300 }, (_, i) => (i < 200 ? 7 : i % 5))]) {
      const r = Uint8Array.from(row);
      expect(unpack(packBits(r), r.length)).toEqual(row);
    }
  });

  it('maps every blend mode to a Photoshop key', () => {
    expect(blendKey('multiply')).toBe('mul ');
    expect(blendKey('add')).toBe('lddg');
    expect(blendKey('pass')).toBe('pass');
    expect(blendKey(undefined)).toBe('norm');
  });

  it('writes layers, groups, clipping and masks that a PSD reader understands', () => {
    const W = 20;
    const H = 10;
    const red = img(W, H, (x, y) => (x >= 2 && x < 8 && y >= 1 && y < 5 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const blue = img(W, H, (x) => (x >= 10 ? [0, 0, 255, 128] : [0, 0, 0, 0]));
    const empty = img(W, H, () => [0, 0, 0, 0]);
    const mask = new Uint8Array(W * H).fill(255);
    mask.fill(0, 0, W * 2);
    const layers: PsdLayer[] = [
      { name: 'Back', image: red, opacity: 1, blend: 'normal' },
      { name: '', group: 'end', opacity: 1, blend: 'pass' },
      { name: 'Glass ✨', image: blue, opacity: 0.5, blend: 'screen' },
      { name: 'Shade', image: red, opacity: 1, blend: 'multiply', clipping: true, hidden: true },
      { name: 'Empty', image: empty, opacity: 1, blend: 'normal' },
      { name: 'Folder', group: 'open', opacity: 0.8, blend: 'pass', mask },
    ];
    const merged = img(W, H, (x) => [x * 10, 0, 0, 255]);
    const bytes = writePsd(W, H, layers, merged);
    const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { useImageData: true });
    expect(psd.width).toBe(W);
    expect(psd.height).toBe(H);
    const kids = psd.children!;
    expect(kids.map((k) => k.name)).toEqual(['Back', 'Folder']);
    const back = kids[0];
    expect([back.left, back.top, back.right, back.bottom]).toEqual([2, 1, 8, 5]);
    expect(back.imageData!.data[0]).toBe(255);
    const folder = kids[1];
    expect(folder.opacity).toBeCloseTo(0.8, 2);
    expect(folder.blendMode).toBe('pass through');
    expect(folder.mask).toBeTruthy();
    expect(folder.children!.map((k) => k.name)).toEqual(['Glass ✨', 'Shade', 'Empty']);
    const [glass, shade] = folder.children!;
    expect(glass.blendMode).toBe('screen');
    expect(glass.opacity).toBeCloseTo(0.5, 2);
    expect(glass.imageData!.data[3]).toBe(128);
    expect(shade.clipping).toBe(true);
    expect(shade.hidden).toBe(true);
    expect(shade.blendMode).toBe('multiply');
    expect(psd.imageData!.data[4 * 3]).toBe(30);
  });
});
