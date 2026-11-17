// A paper scaled smoothly instead of in whole pixel blocks: the scaling itself, how a saved grain reads back, and strokes.
import { describe, expect, it } from 'vitest';
import { paperTile, TILE } from '../../src/dry/paper';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { DEFAULT_DAB, type DabBrush } from '../../src/dab/maths';
import { cleanGrain, grainIsSmooth, grainTile, sameGrain, SMOOTH_GRAIN_SCALE, tileSide, type Grain } from '../../src/dab/texture';
import { scaled, scaleTile } from '../../src/dab/texturePicture';

const wave = (): Uint8Array => {
  // One full smooth wave across the tile each way, so the tile repeats without a seam.
  const t = new Uint8Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t[y * TILE + x] = Math.round(127.5 + 127.5 * Math.sin((2 * Math.PI * x) / TILE) * Math.cos((2 * Math.PI * y) / TILE));
  return t;
};

describe('reading a saved grain', () => {
  it('rounds a scale to whole pixels unless it is smooth, so old brushes read as they always did', () => {
    expect(cleanGrain({ depth: 1, scale: 2.6, moving: false })).toEqual({ depth: 1, scale: 3, moving: false });
    expect(cleanGrain({ depth: 1, scale: 2.6, moving: false, smooth: false })?.scale).toBe(3);
    expect(cleanGrain({ depth: 1, scale: 0.4, moving: false })?.scale).toBe(1);
    expect(cleanGrain({ depth: 1, scale: 3, moving: false })).not.toHaveProperty('smooth');
  });

  it('keeps a fraction when smooth, within its own range', () => {
    expect(cleanGrain({ depth: 1, scale: 1.55, moving: false, smooth: true })).toMatchObject({ scale: 1.55, smooth: true });
    expect(cleanGrain({ depth: 1, scale: 0.01, moving: false, smooth: true })?.scale).toBe(SMOOTH_GRAIN_SCALE.min);
    expect(cleanGrain({ depth: 1, scale: 99, moving: false, smooth: true })?.scale).toBe(SMOOTH_GRAIN_SCALE.max);
    expect(cleanGrain({ depth: 1, scale: 'big', moving: false, smooth: true })?.scale).toBe(1);
  });

  it('counts smooth in whether two grains are the same', () => {
    const a: Grain = { depth: 1, scale: 3, moving: false };
    expect(sameGrain(a, { ...a })).toBe(true);
    expect(sameGrain(a, { ...a, smooth: true })).toBe(false);
  });

  it('a brush saved smooth reads back through cleanDab as it went in', async () => {
    const { cleanDab } = await import('../../src/dab/maths');
    const b = cleanDab({ ...DEFAULT_DAB, grain: { paper: 'rough', depth: 0.6, scale: 2.5, moving: false, smooth: true } });
    expect(b.grain).toMatchObject({ scale: 2.5, smooth: true });
  });
});

describe('scaling a tile', () => {
  it('is the same tile at scale 1', () => {
    const t = wave();
    expect(scaleTile('wave', t, 1)).toBe(t);
  });

  it('is 256 times the scale across, and repeats without a seam', () => {
    const t = wave();
    for (const s of [0.5, 1.5, 2, 3]) {
      const n = Math.round(TILE * s);
      const out = scaled(t, n);
      expect(out.length).toBe(n * n);
      // Neighbouring pixels in the middle of a wave differ by a little, and so do the two sides of the seam.
      let worst = 0;
      for (let y = 0; y < n; y += 7) for (let x = 0; x < n; x++) worst = Math.max(worst, Math.abs(out[y * n + x] - out[y * n + ((x + 1) % n)]));
      expect(worst).toBeLessThan(s >= 1 ? 8 : 20);
    }
  });

  it('is soft where whole pixel blocks are sharp', () => {
    const t = paperTile('rough');
    const out = scaled(t, TILE * 3);
    // Blocks: three equal pixels in a row. Smooth: almost never.
    let flat = 0;
    let n = 0;
    for (let y = 0; y < TILE * 3; y += 5) for (let x = 0; x < TILE * 3 - 2; x++) (n++, out[y * TILE * 3 + x] === out[y * TILE * 3 + x + 1] && out[y * TILE * 3 + x + 1] === out[y * TILE * 3 + x + 2] && flat++);
    expect(flat / n).toBeLessThan(0.15);
  });

  it('keeps a flat paper flat and the average grey about where it was', () => {
    const flat = new Uint8Array(TILE * TILE).fill(90);
    expect(new Set(scaled(flat, 384)).size).toBe(1);
    const t = paperTile('medium');
    const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length;
    for (const n of [128, 384, 768]) expect(Math.abs(mean(scaled(t, n)) - mean(t))).toBeLessThan(2);
  });

  it('shrinks by averaging, so a fine checkerboard goes grey', () => {
    const t = new Uint8Array(TILE * TILE);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t[y * TILE + x] = (x + y) % 2 ? 255 : 0;
    const out = scaled(t, 128);
    for (let i = 0; i < out.length; i += 97) expect(Math.abs(out[i] - 127.5)).toBeLessThan(40);
  });

  it('is made once and kept', () => {
    const t = paperTile('fine');
    expect(scaleTile('fine-test', t, 1.5)).toBe(scaleTile('fine-test', t, 1.5));
    expect(scaleTile('fine-test', t, 1.5).length).toBe(384 * 384);
  });

  it('spreads the greys evenly again unless told not to', () => {
    const t = paperTile('rough');
    const spread = (a: Uint8Array) => {
      const h = new Uint32Array(8);
      for (const v of a) h[v >> 5]++;
      return Math.max(...h) / Math.min(...h);
    };
    expect(spread(scaleTile('even-test', t, 3, true))).toBeLessThan(spread(scaleTile('as-is-test', t, 3, false)));
  });
});

describe('which grains are smooth', () => {
  const g: Grain = { paper: 'rough', depth: 1, scale: 3, moving: false, smooth: true };
  it('needs smooth on, a size other than the finest and a brush that is not a pixel brush', () => {
    expect(grainIsSmooth(g)).toBe(true);
    expect(grainIsSmooth({ ...g, smooth: undefined })).toBe(false);
    expect(grainIsSmooth({ ...g, scale: 1 })).toBe(false);
    expect(grainIsSmooth(g, true)).toBe(false);
  });

  it('hands back the plain tile for blocks and a scaled one for smooth', () => {
    expect(grainTile({ ...g, smooth: undefined })).toBe(paperTile('rough'));
    expect(grainTile(g, undefined, true)).toBe(paperTile('rough'));
    const t = grainTile(g);
    expect(tileSide(t)).toBe(TILE * 3);
  });
});

describe('strokes with a smooth paper', () => {
  const W = 200;
  const H = 80;
  function draw(b: Partial<DabBrush>) {
    const px = new Uint8ClampedArray(W * H * 4);
    const brush = { ...DEFAULT_DAB, size: 24, hardness: 0.5, flow: 0.5, spacing: 0.1, aliased: false, ...b };
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [20, 20, 20, 255], edge: 'smooth', seed: 2 });
    for (let i = 0; i < 30; i++) s.moveTo({ x: 20 + i * 5.3, y: 40 + 10 * Math.sin(i / 4) }, brush.size, 1, { pressure: 0.7, speed: 0.1 });
    s.finish();
    return px;
  }
  const grain = (o: Partial<Grain>): Grain => ({ paper: 'rough', depth: 1, scale: 3, moving: false, ...o });
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

  it('draws the same as before when smooth is off, and at the finest size', () => {
    expect(same(draw({ grain: grain({}) }), draw({ grain: grain({ smooth: false }) }))).toBe(true);
    expect(same(draw({ grain: grain({ scale: 1 }) }), draw({ grain: grain({ scale: 1, smooth: true }) }))).toBe(true);
  });

  it('leaves a pixel (aliased) brush in sharp blocks', () => {
    expect(same(draw({ aliased: true, grain: grain({}) }), draw({ aliased: true, grain: grain({ smooth: true }) }))).toBe(true);
  });

  it('is different from blocks, and the same every time', () => {
    const blocks = draw({ grain: grain({}) });
    const smooth = draw({ grain: grain({ smooth: true }) });
    expect(same(blocks, smooth)).toBe(false);
    expect(same(smooth, draw({ grain: grain({ smooth: true }) }))).toBe(true);
  });

  it('puts paint down with a fraction of a size, a shrunk paper and a paper that moves', () => {
    for (const g of [grain({ scale: 1.5, smooth: true }), grain({ scale: 0.5, smooth: true }), grain({ scale: 2.25, smooth: true, moving: true, thin: true })]) {
      const px = draw({ grain: g });
      let painted = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]) painted++;
      expect(painted).toBeGreaterThan(200);
    }
  });
});
