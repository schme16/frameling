// A soft tip from a brush file: saved packed, read back beside the old list of numbers, and a smaller copy for small dabs.
import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanDab, DEFAULT_DAB, levelFor, pictureOf, samplerFor, sameDab, type DabBrush } from '../../src/dab/maths';
import { encodeBytes } from '../../src/dab/texturePicture';
import { MAX_SOFT_STAMP, packCells, readPixelStamp, SoftCells, unpackCells, type PixelStamp } from '../../src/brushes/stamps';

/** A soft tip of speckles: 32 shades like a tip from a file, from a fixed seed. */
function speckled(side: number): PixelStamp {
  let a = 12345;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const colours = Array.from({ length: 31 }, (_, i) => `#000000${((i + 1) * 8).toString(16).padStart(2, '0')}`);
  const cells = Array.from({ length: side * side }, () => (rnd() < 0.15 ? 1 + Math.floor(rnd() * 31) : 0));
  return { w: side, h: side, colours, cells, keep: false, soft: true };
}

describe('a soft tip saved packed', () => {
  it('comes back cell for cell from its packed form', () => {
    const st = speckled(100);
    const read = readPixelStamp(st)!;
    const saved = JSON.parse(JSON.stringify(read));
    expect(typeof saved.cells).toBe('string');
    expect(saved.cells.startsWith('z1:')).toBe(true);
    const back = readPixelStamp(saved)!;
    expect(Array.from(back.cells)).toEqual(st.cells);
    expect(back).toMatchObject({ w: 100, h: 100, soft: true, keep: false });
  });

  it('is far smaller than the list of numbers it replaces', () => {
    const st = speckled(200);
    const old = JSON.stringify(st).length;
    const packed = JSON.stringify(readPixelStamp(st)).length;
    expect(packed).toBeLessThan(old / 2);
  });

  it('still opens the old list of numbers, and draws the same', () => {
    const st = speckled(64);
    const old = readPixelStamp(JSON.parse(JSON.stringify(st)))!;
    const fresh = readPixelStamp(JSON.parse(JSON.stringify(readPixelStamp(st))))!;
    expect(Array.from(old.cells)).toEqual(Array.from(fresh.cells));
    const a = pictureOf(old);
    const b = pictureOf(fresh);
    expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
    // And a stroke with each is pixel for pixel the same.
    const draw = (picture: PixelStamp): Uint8ClampedArray => {
      const W = 120;
      const H = 80;
      const px = new Uint8ClampedArray(W * H * 4);
      const brush: DabBrush = { ...DEFAULT_DAB, tip: 'picture', picture, size: 50, spacing: 0.3, angleJitter: 1, scatter: 0.2, aliased: false };
      const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [10, 20, 30, 255], edge: 'smooth', seed: 5 });
      for (let x = 20; x <= 100; x += 4) s.moveTo({ x, y: 40 }, 50, 1);
      s.finish();
      return px;
    };
    expect(draw(old)).toEqual(draw(fresh));
  });

  it('is read back through cleanDab and told apart from another tip', () => {
    const a = cleanDab({ tip: 'picture', picture: speckled(40) });
    const b = cleanDab(JSON.parse(JSON.stringify(a)));
    expect(sameDab(a, b)).toBe(true);
    expect(sameDab(a, cleanDab({ tip: 'picture', picture: speckled(41) }))).toBe(false);
  });

  it('reads a stamp it already read as the same object, so what is built from it is kept', () => {
    const once = readPixelStamp(speckled(30))!;
    expect(readPixelStamp(once)).toBe(once);
    expect(pictureOf(once)).toBe(pictureOf(readPixelStamp(once)!));
  });

  it('refuses a packed list that is the wrong length, not base 64, or squeezes to more than it says', () => {
    const st = readPixelStamp(speckled(20))!;
    const good = JSON.parse(JSON.stringify(st));
    expect(readPixelStamp(good)).not.toBeNull();
    expect(readPixelStamp({ ...good, w: 19 })).toBeNull();
    expect(readPixelStamp({ ...good, cells: 'z1:!!!!' })).toBeNull();
    expect(readPixelStamp({ ...good, cells: 'z2:' + good.cells.slice(3) })).toBeNull();
    expect(readPixelStamp({ ...good, cells: good.cells.slice(0, -8) })).toBeNull();
    // A tip that is not soft keeps its plain list: a packed one is not accepted for it.
    expect(readPixelStamp({ ...good, soft: undefined })).toBeNull();
    // A squeezed run of a few million zeros has to stop at the size it claims.
    const bomb = 'z1:' + encodeBytes(deflateSync(new Uint8Array(5_000_000)));
    expect(readPixelStamp({ ...good, cells: bomb })).toBeNull();
    expect(unpackCells(bomb, 400)).toBeNull();
  });

  it('only packs cells that fit a byte, and leaves the rest as a plain list', () => {
    expect(packCells([0, 1, 2])).toBeInstanceOf(SoftCells);
    expect(packCells([0, 1, 300])).not.toBeInstanceOf(SoftCells);
    expect(JSON.stringify(packCells([0, 1, 300]))).toBe('[0,1,300]');
  });

  it('holds a tip up to the new limit', () => {
    expect(MAX_SOFT_STAMP).toBe(256);
    const big = speckled(MAX_SOFT_STAMP);
    const saved = JSON.parse(JSON.stringify(readPixelStamp(big)));
    expect(readPixelStamp(saved)?.w).toBe(MAX_SOFT_STAMP);
    expect(readPixelStamp({ ...big, w: MAX_SOFT_STAMP + 1, cells: new Array((MAX_SOFT_STAMP + 1) * MAX_SOFT_STAMP).fill(1) })).toBeNull();
  });
});

describe('a smaller copy of a tip for small dabs', () => {
  const big = readPixelStamp(speckled(128))!;
  const pic = pictureOf(big);

  it('is made once with the tip: the tip, then halved, then halved again', () => {
    expect(pic.levels.map((l) => l.w)).toEqual([128, 64, 32]);
    expect(pictureOf(big)).toBe(pic);
    // Halving takes the average, so the paint in the tip is the same, a share of it in each cell.
    const sum = (m: Float32Array) => m.reduce((s, v) => s + v, 0);
    expect(sum(pic.levels[1].mask) * 4).toBeCloseTo(sum(pic.levels[0].mask), 3);
    expect(sum(pic.levels[2].mask) * 16).toBeCloseTo(sum(pic.levels[0].mask), 3);
  });

  it('picks the copy by how many pixels a cell is drawn to', () => {
    expect(levelFor(pic, 1)).toBe(0);
    expect(levelFor(pic, 0.5)).toBe(0);
    expect(levelFor(pic, 0.49)).toBe(1);
    expect(levelFor(pic, 0.25)).toBe(1);
    expect(levelFor(pic, 0.24)).toBe(2);
    expect(levelFor(pic, 0.01)).toBe(2);
  });

  it('is not made for a tip drawn by hand or pixel art, so those are sampled as they are', () => {
    const hand = pictureOf(readPixelStamp(speckled(32))!);
    expect(hand.levels).toHaveLength(1);
    expect(levelFor(hand, 0.01)).toBe(0);
  });

  it('stops a small dab shimmering: its paint changes smoothly as the dab moves', () => {
    const brush: DabBrush = { ...DEFAULT_DAB, tip: 'picture', picture: big, size: 24, aliased: false };
    // The total paint one dab lays as it slides a quarter pixel at a time: the lone four cell sample jumps about, the averaged copy does not.
    const total = (b: DabBrush, dx: number): number => {
      const sm = samplerFor(b, 24, 0, false);
      let t = 0;
      for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) t += sm.cov(x + dx, y);
      return t;
    };
    const wobble = (b: DabBrush): number => {
      const v = Array.from({ length: 12 }, (_, i) => total(b, i * 0.25));
      const mean = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.max(...v.map((x) => Math.abs(x - mean))) / mean;
    };
    // Without the copies (a tip kept at one level) the wobble is what it was.
    const flat = { ...big, w: big.w };
    const without: DabBrush = { ...brush, picture: flat };
    const level0 = pictureOf(flat);
    level0.levels.length = 1;
    expect(wobble(brush)).toBeLessThan(wobble(without));
  });

  it('draws a normal size dab exactly as before', () => {
    const sm = samplerFor({ ...DEFAULT_DAB, tip: 'picture', picture: big, size: 128, aliased: false }, 128, 0, false);
    // A dab at the tip's own size reads the saved cells: a spot on a painted cell gives that cell's paint.
    let hit = 0;
    for (let i = 0; i < big.cells.length && !hit; i++) if (big.cells[i] > 0) hit = i + 1;
    const i = hit - 1;
    const x = (i % 128) - 64 + 0.5;
    const y = Math.floor(i / 128) - 64 + 0.5;
    expect(sm.cov(x, y)).toBeGreaterThan(0);
  });
});
