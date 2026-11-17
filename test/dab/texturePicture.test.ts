// Grain and dual tips made from a picture: the greys, the tiles, what is saved and read back, and strokes that use them.
import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/dry/paper';
import { cleanDab, DEFAULT_DAB, sameDab } from '../../src/dab/maths';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanDual, cleanGrain, dualTile, grainTile, sameDual, sameGrain, DEFAULT_DUAL, DEFAULT_GRAIN } from '../../src/dab/texture';
import { cleanPicture, decodeBytes, dualPictureScale, dualTileFromPicture, encodeBytes, evenOut, grainTileFromPicture, pictureFromPixels, repeatInto, sideFor, type TexturePicture } from '../../src/dab/texturePicture';

/** An RGBA picture from a function of x and y that gives a grey (0 to 255). */
function pic(w: number, h: number, f: (x: number, y: number) => number, alpha = 255): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set([f(x, y), f(x, y), f(x, y), alpha], (y * w + x) * 4);
  return a;
}
const made = (w: number, h: number, f: (x: number, y: number) => number): TexturePicture => {
  const r = pictureFromPixels(w, h, pic(w, h, f));
  if (!r.ok) throw new Error('flat');
  return r.picture;
};
const checker = (x: number, y: number): number => ((x >> 2) + (y >> 2)) % 2 === 0 ? 255 : 0;

describe('a picture boiled down to a texture', () => {
  it('picks the nearest power of two from 8 to 64', () => {
    expect([1, 5, 8, 11, 12, 30, 45, 64, 100, 4000].map(sideFor)).toEqual([8, 8, 8, 8, 16, 32, 32, 64, 64, 64]);
  });

  it('keeps a small picture as it is and averages a big one', () => {
    const small = made(16, 16, (x) => (x < 8 ? 0 : 200));
    const bytes = decodeBytes(small.data, 256)!;
    expect(small.side).toBe(16);
    expect(bytes[0]).toBe(0);
    expect(bytes[15]).toBe(200);
    const big = made(400, 400, (x) => (x < 200 ? 0 : 200));
    expect(big.side).toBe(64);
    expect(decodeBytes(big.data, 4096)![63]).toBe(200);
  });

  it('counts see-through as white paper, so a dark shape on a clear page is dark where the shape is', () => {
    const a = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 128; i++) a.set([0, 0, 0, 255], i * 4);
    const r = pictureFromPixels(16, 16, a);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const b = decodeBytes(r.picture.data, 256)!;
      expect(b[0]).toBe(0);
      expect(b[255]).toBe(255);
    }
  });

  it('turns a flat or empty picture down, since it would make no texture', () => {
    expect(pictureFromPixels(32, 32, pic(32, 32, () => 120))).toEqual({ ok: false, why: 'flat' });
    expect(pictureFromPixels(0, 0, new Uint8ClampedArray(0))).toEqual({ ok: false, why: 'empty' });
    expect(pictureFromPixels(10, 10, new Uint8ClampedArray(12))).toEqual({ ok: false, why: 'empty' });
  });
});

describe('a saved texture picture', () => {
  it('round trips through base 64', () => {
    const b = Uint8Array.from({ length: 4096 }, (_, i) => i % 251);
    expect(decodeBytes(encodeBytes(b), 4096)).toEqual(b);
  });

  it('is read back only when it is exactly right', () => {
    const good = made(32, 32, checker);
    expect(cleanPicture(good)).toEqual(good);
    expect(cleanPicture({ ...good, side: 33 })).toBeNull();
    expect(cleanPicture({ ...good, side: 64 })).toBeNull();
    expect(cleanPicture({ ...good, data: good.data.slice(4) })).toBeNull();
    expect(cleanPicture({ ...good, data: '!'.repeat(good.data.length) })).toBeNull();
    expect(cleanPicture({ side: 64, data: 'A'.repeat(1_000_000) })).toBeNull();
    expect(cleanPicture({ side: 1e9, data: 'AAAA' })).toBeNull();
    expect(cleanPicture(null)).toBeNull();
    expect(cleanPicture('x')).toBeNull();
    expect(cleanPicture([])).toBeNull();
  });

  it('never decodes more than the side says, however long the string claims to be', () => {
    expect(decodeBytes('A'.repeat(8), 4096)).toBeNull();
    expect(decodeBytes(`${'A'.repeat(5462)}==`, 4096)).not.toBeNull();
    expect(decodeBytes('AAA=', 3)).toBeNull();
  });
});

describe('the grain tile from a picture', () => {
  it('spreads the greys evenly, the way the papers are, and keeps their order', () => {
    const v = Uint8Array.from({ length: 64 }, (_, i) => 100 + (i % 8));
    const e = evenOut(v);
    expect(e[0]).toBeLessThan(e[7]);
    expect(Math.min(...e)).toBeLessThan(40);
    expect(Math.max(...e)).toBeGreaterThan(215);
    // Equal greys stay equal.
    expect(e[0]).toBe(e[8]);
  });

  it('repeats across the tile without a seam', () => {
    const t = grainTileFromPicture(made(32, 32, (x, y) => x * 8 + y), false);
    expect(t.length).toBe(TILE * TILE);
    for (const [x, y] of [[0, 0], [5, 9], [31, 31]]) {
      expect(t[y * TILE + x]).toBe(t[y * TILE + x + 32]);
      expect(t[y * TILE + x]).toBe(t[(y + 224) * TILE + x]);
      expect(t[y * TILE + x]).toBe(t[(y + 32) * TILE + x + 64]);
    }
  });

  it('turns light and dark round with invert', () => {
    const p = made(16, 16, (x) => x * 16);
    const a = grainTileFromPicture(p, false);
    const b = grainTileFromPicture(p, true);
    expect(a[0]).toBeLessThan(a[15]);
    expect(b[0]).toBeGreaterThan(b[15]);
  });

  it('is made once and kept', () => {
    const p = made(16, 16, checker);
    expect(grainTileFromPicture(p, false)).toBe(grainTileFromPicture(p, false));
  });

  it('is what a grain with a picture catches on, and a grain without one still uses its paper', () => {
    const p = made(16, 16, checker);
    expect(grainTile({ ...DEFAULT_GRAIN, picture: p }, 'rough')).toBe(grainTileFromPicture(p, false));
    expect(grainTile({ ...DEFAULT_GRAIN, paper: 'laid' }, 'rough')).not.toBe(grainTile({ ...DEFAULT_GRAIN }, 'rough'));
  });
});

describe('the dual tile from a picture', () => {
  const half = made(16, 16, (x) => (x < 8 ? 0 : 255));
  const share = (t: Uint8Array): number => t.reduce((n, v) => n + (v ? 1 : 0), 0) / t.length;

  it('lets paint through where the picture is dark, as much of it as the density says', () => {
    expect(share(dualTileFromPicture(half, 0.5, false, false, 1))).toBeCloseTo(0.5, 2);
    const ramp = made(64, 64, (x, y) => (x + y * 2) % 256);
    expect(share(dualTileFromPicture(ramp, 0.25, false, false, 1))).toBeGreaterThan(0.2);
    expect(share(dualTileFromPicture(ramp, 0.25, false, false, 1))).toBeLessThan(0.35);
    expect(share(dualTileFromPicture(ramp, 1, false, false, 1))).toBe(1);
  });

  it('counts only the marks on a mostly plain picture, never its background', () => {
    // A white page with one dark square a fifth of the way across: asking for half of it gives the square, not the page.
    const marks = made(16, 16, (x, y) => (x < 4 && y < 4 ? 0 : 255));
    expect(share(dualTileFromPicture(marks, 0.5, false, false, 1))).toBeCloseTo(1 / 16, 2);
    expect(share(dualTileFromPicture(marks, 1, false, false, 1))).toBe(1);
    expect(share(dualTileFromPicture(marks, 0.5, false, true, 1))).toBeCloseTo(15 / 16, 2);
  });

  it('swaps with invert, and turns into holes with cut', () => {
    const a = dualTileFromPicture(half, 0.5, false, false, 1);
    const inv = dualTileFromPicture(half, 0.5, true, false, 1);
    const cut = dualTileFromPicture(half, 0.5, false, true, 1);
    expect(a[0]).toBe(255);
    expect(a[15]).toBe(0);
    expect(inv[0]).toBe(0);
    expect(inv[15]).toBe(255);
    expect(cut[0]).toBe(0);
    expect(cut[15]).toBe(255);
  });

  it('makes each picture pixel a block, only as far as it fits the tile', () => {
    expect([1, 2, 3, 4, 8, 16].map((w) => dualPictureScale(64, w))).toEqual([1, 2, 2, 4, 4, 4]);
    expect([1, 8].map((w) => dualPictureScale(8, w))).toEqual([1, 8]);
    expect(dualPictureScale(16, undefined)).toBe(1);
    const t = dualTileFromPicture(half, 0.5, false, false, 2);
    expect(t[15]).toBe(255);
    expect(t[16]).toBe(0);
    expect(t[31]).toBe(0);
    expect(t[32]).toBe(255);
  });

  it('is what a dual tip with a picture paints through, and a dual without one still makes dots', () => {
    expect(dualTile({ ...DEFAULT_DUAL, picture: half })).toBe(dualTileFromPicture(half, DEFAULT_DUAL.density, false, false, undefined));
    expect(share(dualTile(DEFAULT_DUAL))).toBeGreaterThan(0.2);
  });

  it('repeats a square across the tile', () => {
    const t = repeatInto(Uint8Array.from([1, 2, 3, 4]), 2, 1);
    expect([t[0], t[1], t[2], t[TILE], t[TILE + 1]]).toEqual([1, 2, 1, 3, 4]);
  });
});

describe('saving and reading a brush with a texture picture', () => {
  const p = made(32, 32, checker);

  it('keeps a grain picture, with invert only when it is on', () => {
    const g = cleanGrain({ depth: 0.7, scale: 2, moving: false, picture: p, invert: true });
    expect(g?.picture).toEqual(p);
    expect(g?.invert).toBe(true);
    expect('invert' in (cleanGrain({ depth: 0.7, picture: p }) ?? {})).toBe(false);
    expect(cleanGrain({ depth: 0.7, picture: { side: 8, data: 'nope' } })?.picture).toBeUndefined();
  });

  it('keeps a dual picture with a scale that fits', () => {
    const d = cleanDual({ tip: 'round', size: 3, density: 0.5, cut: false, picture: p, scale: 100 });
    expect(d?.picture).toEqual(p);
    expect(d?.scale).toBe(8);
    expect(cleanDual({ density: 0.5, picture: undefined })).not.toHaveProperty('picture');
  });

  it('is left as it was for brushes saved before (no picture, nothing new)', () => {
    expect(cleanGrain({ paper: 'rough', depth: 1, scale: 1, moving: false })).toEqual({ paper: 'rough', depth: 1, scale: 1, moving: false });
    expect(cleanDual({ tip: 'square', size: 4, density: 0.3, cut: true })).toEqual({ tip: 'square', size: 4, density: 0.3, cut: true });
  });

  it('tells a brush with one picture from a brush with another', () => {
    const q = made(32, 32, (x) => x * 8);
    expect(sameGrain({ ...DEFAULT_GRAIN, picture: p }, { ...DEFAULT_GRAIN, picture: q })).toBe(false);
    expect(sameGrain({ ...DEFAULT_GRAIN, picture: p }, { ...DEFAULT_GRAIN, picture: p })).toBe(true);
    expect(sameGrain({ ...DEFAULT_GRAIN, picture: p }, DEFAULT_GRAIN)).toBe(false);
    expect(sameDual({ ...DEFAULT_DUAL, picture: p }, { ...DEFAULT_DUAL, picture: p, invert: true })).toBe(false);
  });

  it('goes through a whole brush and out the other side as JSON', () => {
    const b = cleanDab({ ...DEFAULT_DAB, grain: { depth: 0.9, scale: 1, moving: false, picture: p }, dual: { tip: 'round', size: 3, density: 0.4, cut: false, picture: p } });
    const back = cleanDab(JSON.parse(JSON.stringify(b)));
    expect(sameDab(b, back)).toBe(true);
    expect(back.grain?.picture).toEqual(p);
    expect(back.dual?.picture).toEqual(p);
  });
});

describe('strokes with a picture for grain or dots', () => {
  const W = 96;
  const H = 40;
  const draw = (patch: Partial<typeof DEFAULT_DAB>) => {
    const px = new Uint8ClampedArray(W * H * 4);
    const brush = { ...DEFAULT_DAB, size: 9, flow: 0.5, spacing: 1, ...patch };
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [220, 40, 40, 255], edge: 'crisp', seed: 1 });
    for (let i = 0; i < 40; i++) s.moveTo({ x: 8 + (i / 39) * 80, y: 20 }, brush.size, brush.flow);
    s.finish();
    return px;
  };
  const count = (g: Uint8ClampedArray) => g.reduce((n, v, i) => n + (i % 4 === 3 && v ? 1 : 0), 0);

  /** The paint in each column of the page, in a stroke across the middle. */
  const columns = (g: Uint8ClampedArray): number[] => Array.from({ length: W }, (_, x) => { let n = 0; for (let y = 0; y < H; y++) if (g[(y * W + x) * 4 + 3]) n++; return n; });

  it('a grain picture catches light paint on its light stripes and skips its dark ones, and always the same way', () => {
    // Four pixels of white, four of black, across.
    const p = made(16, 16, (x) => (x % 8 < 4 ? 255 : 0));
    const grain = { depth: 1, scale: 1, moving: false, picture: p };
    const a = draw({ grain });
    const c = columns(a);
    const dark = c.filter((_, x) => x % 8 >= 4 && x > 12 && x < 84).reduce((n, v) => n + v, 0);
    const light = c.filter((_, x) => x % 8 < 4 && x > 12 && x < 84).reduce((n, v) => n + v, 0);
    expect(light).toBeGreaterThan(dark * 3);
    expect(Array.from(draw({ grain }))).toEqual(Array.from(a));
    // Turned round, it catches on the dark stripes.
    const c2 = columns(draw({ grain: { ...grain, invert: true } }));
    expect(c2.filter((_, x) => x % 8 >= 4 && x > 12 && x < 84).reduce((n, v) => n + v, 0)).toBeGreaterThan(c2.filter((_, x) => x % 8 < 4 && x > 12 && x < 84).reduce((n, v) => n + v, 0) * 3);
  });

  it('a dual picture only paints where its dark parts are', () => {
    const p = made(16, 16, (x) => (x < 8 ? 0 : 255));
    const some = draw({ flow: 1, dual: { tip: 'round', size: 3, density: 0.5, cut: false, picture: p } });
    const all = draw({ flow: 1 });
    expect(count(some)).toBeLessThan(count(all));
    expect(count(some)).toBeGreaterThan(count(all) * 0.3);
  });
});
