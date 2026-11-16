// A soft picture tip (from a brush file): each cell's see-through is how much paint it lays down, in the colour picked.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanDab, DEFAULT_DAB, pictureOf, sameDab, type DabBrush } from '../../src/dab/maths';
import { readPixelStamp, type PixelStamp } from '../../src/brushes/stamps';

// One row of three cells: full, half, and a faint one.
const soft: PixelStamp = { w: 3, h: 1, colours: ['#000000', '#00000080', '#00000020'], cells: [1, 2, 3], keep: false, soft: true };
const plain: PixelStamp = { ...soft, soft: undefined };

describe('soft picture tips', () => {
  it('are read back as soft, and never keep their own colours', () => {
    expect(readPixelStamp(soft)?.soft).toBe(true);
    expect(readPixelStamp({ ...soft, keep: true })).toMatchObject({ soft: true, keep: false });
    expect(readPixelStamp(plain)?.soft).toBeUndefined();
    expect(readPixelStamp({ ...soft, soft: 'yes' })?.soft).toBeUndefined();
  });

  it('make the mask the amount of paint, where a plain picture is all or nothing', () => {
    expect(Array.from(pictureOf(soft).mask).map((v) => Math.round(v * 100) / 100)).toEqual([1, 0.5, 0.13]);
    expect(Array.from(pictureOf({ ...plain }).mask)).toEqual([1, 1, 1]);
  });

  it('survive cleanDab and are told apart from plain pictures', () => {
    const a = cleanDab({ tip: 'picture', picture: soft });
    expect(a.picture?.soft).toBe(true);
    expect(sameDab(a, cleanDab({ tip: 'picture', picture: plain }))).toBe(false);
    expect(sameDab(a, cleanDab(JSON.parse(JSON.stringify(a))))).toBe(true);
  });

  it('paint the shading, in the colour picked', () => {
    const W = 12;
    const H = 5;
    const px = new Uint8ClampedArray(W * H * 4);
    const brush: DabBrush = { ...DEFAULT_DAB, tip: 'picture', picture: soft, size: 3, spacing: 4, aliased: false };
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [200, 30, 30, 255], edge: 'smooth', seed: 1 });
    s.moveTo({ x: 6, y: 2.5 }, 3, 1);
    s.finish();
    const row = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((x) => px[(2 * W + x) * 4 + 3]);
    const painted = row.filter((a) => a > 0);
    // Three cells, the left one solid, the next about half, the last faint, all red.
    expect(painted.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...painted)).toBeGreaterThan(150);
    expect(painted.some((a) => a > 60 && a < 170)).toBe(true);
    expect(painted.some((a) => a > 0 && a < 60)).toBe(true);
    for (let x = 0; x < W; x++) if (px[(2 * W + x) * 4 + 3]) expect([px[(2 * W + x) * 4], px[(2 * W + x) * 4 + 1], px[(2 * W + x) * 4 + 2]]).toEqual([200, 30, 30]);
  });

  it('also paint in sharp pixels, as a dither of the shading', () => {
    const W = 40;
    const H = 12;
    const ramp: PixelStamp = { w: 8, h: 1, colours: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `#000000${(i * 31).toString(16).padStart(2, '0')}`), cells: [1, 2, 3, 4, 5, 6, 7, 8], keep: false, soft: true };
    const px = new Uint8ClampedArray(W * H * 4);
    const brush: DabBrush = { ...DEFAULT_DAB, tip: 'picture', picture: ramp, size: 32, spacing: 4, aliased: true };
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [200, 30, 30, 255], edge: 'crisp', seed: 1 });
    s.moveTo({ x: 20, y: 6 }, 32, 1);
    s.finish();
    for (let i = 0; i < W * H; i++) expect([0, 255]).toContain(px[i * 4 + 3]);
    const cols = (x0: number, x1: number) => { let n = 0; for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4 + 3]) n++; return n; };
    // The dense end of the ramp has more pixels than the faint end.
    expect(cols(20, 36)).toBeGreaterThan(cols(4, 20));
  });
});
