import { describe, expect, it } from 'vitest';
import { buildPalette, encodeGif, gifDelays, indexFrame, sampleFrames } from '../../src/export/gif';
import { parseGif, rgba } from './helpers';

const frame = (w: number, h: number, c: [number, number, number, number]) => rgba(w, h, () => c);

describe('gif', () => {
  it('writes a GIF89a with the right size, frame count, loop and trailer', () => {
    const frames = [frame(8, 6, [255, 0, 0, 255]), frame(8, 6, [0, 255, 0, 255]), frame(8, 6, [0, 0, 255, 255])];
    const bytes = encodeGif(frames, { width: 8, height: 6, fps: 10, loop: true, transparent: false, dither: false });
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
    const g = parseGif(bytes);
    expect(g.width).toBe(8);
    expect(g.height).toBe(6);
    expect(g.frames).toBe(3);
    expect(g.loopCount).toBe(0);
    expect(g.delays).toEqual([100, 100, 100]);
    expect(g.transparentFlags).toEqual([false, false, false]);
    expect(g.trailer).toBe(true);
  });

  it('plays once when loop is off (no loop block at all)', () => {
    const bytes = encodeGif([frame(2, 2, [1, 2, 3, 255]), frame(2, 2, [3, 2, 1, 255])], { width: 2, height: 2, fps: 5, loop: false, transparent: false, dither: false });
    expect(parseGif(bytes).loopCount).toBeNull();
  });

  it('keeps the total length true at awkward frame rates', () => {
    const d = gifDelays(12, 12);
    expect(d.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(gifDelays(3, 100).every((x) => x >= 20)).toBe(true);
  });

  it('marks see-through frames and reserves index 0 for them', () => {
    const w = 4;
    const f = rgba(w, 1, (x) => (x < 2 ? [0, 0, 0, 0] : [200, 10, 10, 255]));
    const bytes = encodeGif([f, f], { width: w, height: 1, fps: 10, loop: true, transparent: true, dither: false });
    expect(parseGif(bytes).transparentFlags).toEqual([true, true]);
    const palette = buildPalette([f], true);
    expect(palette[0]).toEqual([0, 0, 0]);
    expect(palette[1]).toEqual([200, 10, 10]);
    expect([...indexFrame(f, w, 1, palette, { transparent: true, dither: false })]).toEqual([0, 0, 1, 1]);
  });

  it('keeps flat colours exact (pixel art), and quantises busy pictures to 256', () => {
    const flat = rgba(4, 1, (x) => [[10, 20, 30, 255], [250, 240, 230, 255], [1, 2, 3, 255], [9, 9, 9, 255]][x] as [number, number, number, number]);
    expect(buildPalette([flat], false).length).toBe(4);
    const noisy = rgba(64, 64, (x, y) => [x * 4, y * 4, (x * y) & 255, 255]);
    const pal = buildPalette([noisy], false);
    expect(pal.length).toBeLessThanOrEqual(256);
    expect(pal.length).toBeGreaterThan(16);
  });

  it('dithers without changing the size or leaving the palette', () => {
    const grad = rgba(32, 8, (x) => [x * 8, x * 8, x * 8, 255]);
    const palette = [[0, 0, 0], [255, 255, 255]];
    const plain = indexFrame(grad, 32, 8, palette, { transparent: false, dither: false });
    const dithered = indexFrame(grad, 32, 8, palette, { transparent: false, dither: true });
    expect(dithered.length).toBe(plain.length);
    expect(dithered.every((i) => i === 0 || i === 1)).toBe(true);
    expect([...dithered]).not.toEqual([...plain]);
    const bytes = encodeGif([grad], { width: 32, height: 8, fps: 10, loop: true, transparent: false, dither: true });
    expect(parseGif(bytes).frames).toBe(1);
  });

  it('samples frames across the whole animation', () => {
    expect(sampleFrames(5)).toEqual([0, 1, 2, 3, 4]);
    const s = sampleFrames(100, 10);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(99);
    expect(s.length).toBe(10);
  });
});
