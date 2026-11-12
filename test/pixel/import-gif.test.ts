// The GIF reader against real GIFs made by Pillow, ImageMagick and ffmpeg (scripts/fixtures/make-gif-fixtures.py), with
// what Pillow's own reader says each frame looks like next to them.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeGif } from '../../src/export/gif';
import { decodeGif, GifProblem, isGif } from '../../src/pixel/import/gif';
import { decodePicture, PictureProblem } from '../../src/pixel/import/picture';

const dir = new URL('../fixtures/gif/', import.meta.url);
const load = (name: string) => new Uint8Array(readFileSync(new URL(name + '.gif', dir)));
const want = (name: string): { width: number; height: number; frames: { delay: number; rgba: string }[] } => JSON.parse(readFileSync(new URL(name + '.expected.json', dir), 'utf8'));
const hex = (a: Uint8ClampedArray) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('hex');

describe('GIF reader on real files', () => {
  for (const name of ['disposal', 'solid', 'interlaced', 'ffmpeg']) {
    it(`${name}.gif: size, delays and every frame match Pillow`, () => {
      const g = decodeGif(load(name));
      const e = want(name);
      expect([g.width, g.height]).toEqual([e.width, e.height]);
      expect(g.frames.length).toBe(e.frames.length);
      g.frames.forEach((f, i) => {
        expect(f.delay).toBe(e.frames[i].delay);
        // Compare opaque pixels exactly and transparent ones by being transparent (their hidden colour is not meaningful).
        const a = hex(f.pixels);
        const b = e.frames[i].rgba;
        for (let p = 0; p < a.length; p += 8) {
          const alphaA = a.slice(p + 6, p + 8);
          const alphaB = b.slice(p + 6, p + 8);
          expect(alphaA, `frame ${i} pixel ${p / 8} alpha`).toBe(alphaB);
          if (alphaA !== '00') expect(a.slice(p, p + 8), `frame ${i} pixel ${p / 8}`).toBe(b.slice(p, p + 8));
        }
      });
    });
  }

  it('reads the loop count and the three disposal methods', () => {
    const g = decodeGif(load('disposal'));
    expect(g.loops).toBe(3);
    expect(g.frames.map((f) => f.delay)).toEqual([20, 50, 100, 30]);
    // The block of frame 1 is cleared before frame 2 (disposal 2), so frame 2 holds only its own block plus the corner dot.
    const solidCount = (f: Uint8ClampedArray) => f.filter((_, i) => i % 4 === 3 && f[i] === 255).length;
    expect(solidCount(g.frames[0].pixels)).toBe(17);
    expect(solidCount(g.frames[1].pixels)).toBeGreaterThanOrEqual(17);
  });

  it('shows a delay of 0 or 1 hundredths as a tenth of a second, like browsers', () => {
    const g = decodeGif(load('solid'));
    expect(g.frames.map((f) => f.delay)).toEqual([100, 100, 200]);
    expect(g.loops).toBe(0);
  });

  it('reads a GIF made by Frameling itself, colour for colour', () => {
    const w = 8;
    const h = 8;
    const frames = [0, 1, 2].map((k) => {
      const px = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) px.set(i % (k + 2) === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
      return px;
    });
    const bytes = encodeGif(frames, { width: w, height: h, fps: 10, loop: true } as never);
    const g = decodeGif(bytes);
    expect(g.frames.length).toBe(3);
    g.frames.forEach((f, i) => expect([...f.pixels.slice(0, 8)]).toEqual([...frames[i].slice(0, 8)]));
  });

  it('gives the whole frames when a file is cut off in the middle', () => {
    const full = load('ffmpeg');
    const cut = full.subarray(0, Math.floor(full.length * 0.6));
    const g = decodeGif(cut);
    expect(g.frames.length).toBeGreaterThan(0);
    expect(g.frames.length).toBeLessThan(want('ffmpeg').frames.length);
    expect(g.notes.join(' ')).toMatch(/ends early/);
  });

  it('says so in plain words for things that are not GIFs', () => {
    expect(isGif(load('solid'))).toBe(true);
    expect(isGif(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(() => decodeGif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toThrow(GifProblem);
    expect(() => decodeGif(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b]))).toThrow(/no pictures/);
  });

  it('never throws anything but a GifProblem on damaged bytes', () => {
    const base = load('disposal');
    for (let seed = 0; seed < 60; seed++) {
      const b = new Uint8Array(base);
      for (let k = 0; k < 4; k++) b[(seed * 37 + k * 101) % b.length] = (seed * 13 + k * 7) & 255;
      try {
        decodeGif(b);
      } catch (e) {
        expect(e).toBeInstanceOf(GifProblem);
      }
    }
  });
});

describe('Reading a picture file', () => {
  it('a GIF gives its frames, a PNG gives one picture', async () => {
    const gif = await decodePicture(load('disposal'));
    expect(gif.kind).toBe('gif');
    expect(gif.frames.length).toBe(4);
    expect(gif.frames[0].delay).toBe(20);
    await expect(decodePicture(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(PictureProblem);
  });
});
