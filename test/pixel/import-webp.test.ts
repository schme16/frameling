// The pure-JS animated WebP reader (no decoder): the frames, rectangles, delays and flags it finds in real files from
// Pillow (scripts/fixtures/make-apng-fixtures.py), the small still files it cuts out, and how frames are laid over each other.
// The pixels themselves come from the browser's still WebP decoder: `scripts/e2e/webp-import.cjs` checks that in a real
// Chromium with ImageDecoder switched off.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demuxWebp, disposeWebpFrame, drawWebpFrame, WebpProblem } from '../../src/pixel/import/webp';

const dir = new URL('../fixtures/apng/', import.meta.url);
const load = (name: string) => new Uint8Array(readFileSync(new URL(name, dir)));
const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

describe('demuxing an animated WebP', () => {
  it('reads the canvas, the play count and every frame of a lossless file', () => {
    const a = demuxWebp(load('blocks.webp'));
    expect([a.width, a.height, a.loops]).toEqual([20, 14, 0]);
    expect(a.frames.map((f) => f.delay)).toEqual([100, 200, 100, 300]);
    for (const f of a.frames) {
      expect(f.x % 2).toBe(0);
      expect(f.y % 2).toBe(0);
      expect(f.x + f.width).toBeLessThanOrEqual(20);
      expect(f.y + f.height).toBeLessThanOrEqual(14);
    }
  });

  it('reads a lossy file with see-through frames', () => {
    const a = demuxWebp(load('lossy.webp'));
    expect([a.width, a.height, a.loops]).toEqual([40, 28, 3]);
    expect(a.frames.map((f) => f.delay)).toEqual([80, 120, 80, 200]);
  });

  it('cuts each frame out as a whole still WebP of its own size', () => {
    for (const name of ['blocks.webp', 'lossy.webp']) {
      for (const f of demuxWebp(load(name)).frames) {
        const b = f.file;
        expect(text(b, 0)).toBe('RIFF');
        expect(text(b, 8)).toBe('WEBP');
        expect(new DataView(b.buffer, b.byteOffset).getUint32(4, true)).toBe(b.length - 8);
        expect(text(b, 12)).toBe('VP8X');
        const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
        const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
        expect([w, h]).toEqual([f.width, f.height]);
        // The picture chunk (and the alpha chunk of a lossy one) comes next.
        expect(['VP8L', 'ALPH', 'VP8 ']).toContain(text(b, 30));
      }
    }
    // Lossy frames carry an alpha chunk, so the still says it has alpha.
    expect(demuxWebp(load('lossy.webp')).frames[0].file[20] & 0x10).toBe(0x10);
  });

  it('says in plain words when it is not an animated WebP', () => {
    expect(() => demuxWebp(new Uint8Array(64))).toThrow(WebpProblem);
    const b = load('blocks.webp');
    expect(() => demuxWebp(b.subarray(0, b.length - 20))).toThrow(WebpProblem);
    // The animation flag off: a still picture.
    const still = new Uint8Array(b);
    still[20] &= ~0x02;
    expect(() => demuxWebp(still)).toThrow(/not animated/);
  });
});

describe('laying frames over each other', () => {
  const rect = (x: number, y: number, width: number, height: number, blend = true, disposeToBackground = false) => ({ x, y, width, height, blend, disposeToBackground });
  const solid = (n: number, c: number[]) => new Uint8ClampedArray(Array.from({ length: n }, () => c).flat());

  it('a frame that replaces writes its see-through pixels too, one that blends keeps what shows through', () => {
    const canvas = new Uint8ClampedArray(4 * 4 * 4);
    drawWebpFrame(canvas, 4, rect(0, 0, 4, 4), solid(16, [255, 0, 0, 255]));
    drawWebpFrame(canvas, 4, rect(1, 1, 2, 2, true), solid(4, [0, 0, 0, 0]));
    expect([...canvas.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    drawWebpFrame(canvas, 4, rect(1, 1, 2, 2, false), solid(4, [0, 0, 0, 0]));
    expect([...canvas.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)]).toEqual([0, 0, 0, 0]);
  });

  it('blends half-see-through colour over what is there, without premultiplying', () => {
    const canvas = solid(1, [0, 0, 255, 255]);
    drawWebpFrame(canvas, 1, rect(0, 0, 1, 1), new Uint8ClampedArray([255, 0, 0, 128]));
    expect(canvas[3]).toBe(255);
    expect(canvas[0]).toBeGreaterThan(120);
    expect(canvas[0]).toBeLessThan(135);
    expect(canvas[2]).toBeGreaterThan(120);
    expect(canvas[2]).toBeLessThan(135);
  });

  it('clears the frame rectangle only when the frame says so', () => {
    const canvas = solid(16, [9, 9, 9, 255]);
    disposeWebpFrame(canvas, 4, rect(1, 1, 2, 2, true, false));
    expect(canvas[(1 * 4 + 1) * 4 + 3]).toBe(255);
    disposeWebpFrame(canvas, 4, rect(1, 1, 2, 2, true, true));
    expect([...canvas.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect([...canvas.slice(0, 4)]).toEqual([9, 9, 9, 255]);
    expect([...canvas.slice((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect(canvas[(3 * 4 + 3) * 4 + 3]).toBe(255);
  });
});
