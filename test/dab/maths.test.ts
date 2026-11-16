// The dab maths: the tip's edge, the spacing between dabs, scatter and jitter, turning with the line, and a brush read back safely.
import { describe, expect, it } from 'vitest';
import { falloff } from '../../src/soft/maths';
import { cleanDab, DabPath, DEFAULT_DAB, makeRng, MIN_STEP, mirrorDabs, samplerFor, sameDab, snapAxis, stepFor, type DabBrush } from '../../src/dab/maths';

const brush = (p: Partial<DabBrush> = {}): DabBrush => ({ ...DEFAULT_DAB, ...p });
const PIC = { w: 3, h: 2, colours: ['#ff0000', '#00ff0080'], cells: [1, 0, 2, 0, 1, 1], keep: true };

describe('the tip of a dab', () => {
  it('has the same fall from solid to nothing as the soft brush for a round tip', () => {
    for (const hardness of [0, 0.3, 0.8, 1]) {
      const s = samplerFor(brush({ hardness }), 20, 0, false);
      for (let d = 0; d < 12; d += 0.37) expect(s.cov(d, 0)).toBeCloseTo(falloff(d, 10, hardness, 0.75), 9);
    }
  });

  it('is a plain disc when crisp and hard: every pixel centre inside is in, outside is out', () => {
    const s = samplerFor(brush(), 5, 0, true);
    expect(s.cov(0, 0)).toBe(1);
    expect(s.cov(2.4, 0)).toBe(1);
    expect(s.cov(2.6, 0)).toBe(0);
    expect(s.cov(2, 2)).toBe(0);
  });

  it('is a square, with corners, when asked', () => {
    const s = samplerFor(brush({ tip: 'square' }), 5, 0, true);
    expect(s.cov(2, 2)).toBe(1);
    expect(s.cov(2.6, 0)).toBe(0);
  });

  it('turns with the angle and flattens with roundness', () => {
    const flat = brush({ tip: 'square', roundness: 0.2 });
    const along = samplerFor(flat, 10, 0, true);
    expect(along.cov(4, 0)).toBe(1);
    expect(along.cov(0, 4)).toBe(0);
    const turned = samplerFor(flat, 10, Math.PI / 2, true);
    expect(turned.cov(0, 4)).toBe(1);
    expect(turned.cov(4, 0)).toBe(0);
  });

  it('keeps a smooth edge at least about a pixel wide, even when hard', () => {
    const s = samplerFor(brush({ hardness: 1 }), 20, 0, false);
    const edge = [9.3, 9.6, 9.9].map((d) => s.cov(d, 0));
    expect(edge[0]).toBeGreaterThan(edge[1]);
    expect(edge[1]).toBeGreaterThan(edge[2]);
    expect(edge[0]).toBeLessThan(1);
  });

  it('puts a picture on the pixels it was drawn on when it is not scaled or turned', () => {
    const b = brush({ tip: 'picture', picture: PIC });
    const s = samplerFor(b, 3, 0, true);
    // The picture is 3 across and 2 down, centred on the dab: cell (0,0) is painted, (1,0) is clear, (2,0) is painted.
    expect(s.cov(-1, -0.5)).toBe(1);
    expect(s.cov(0, -0.5)).toBe(0);
    expect(s.cov(1, -0.5)).toBe(1);
    expect(Array.from(s.cell)).toEqual([0, 255, 0, 128]);
    expect(s.cov(-1, 0.5)).toBe(0);
    expect(s.cov(5, 0)).toBe(0);
  });

  it('scales a picture to the size asked, by its longer side', () => {
    const b = brush({ tip: 'picture', picture: PIC });
    const s = samplerFor(b, 6, 0, true);
    expect(s.reach).toBeGreaterThan(3);
    expect(s.cov(-2.5, -1)).toBe(1);
    expect(s.cov(-0.5, -1)).toBe(0);
  });
});

describe('spacing', () => {
  it('is a share of the size, and never under half a pixel', () => {
    expect(stepFor(20, 0.25)).toBe(5);
    expect(stepFor(20, 1)).toBe(20);
    expect(stepFor(1, 0.25)).toBe(MIN_STEP);
  });

  it('puts dabs the same distance apart however the pointer moves', () => {
    const p = new DabPath(brush({ spacing: 0.5 }), makeRng(1));
    const first = p.to({ x: 0, y: 0 }, 10, 1);
    expect(first).toHaveLength(1);
    // Two moves that add up to 30 pixels in a line: dabs at 5, 10, ... 30, whichever way it is split.
    const a = [...p.to({ x: 7, y: 0 }, 10, 1), ...p.to({ x: 30, y: 0 }, 10, 1)];
    expect(a.map((d) => Math.round(d.x))).toEqual([5, 10, 15, 20, 25, 30]);
  });
});

describe('scatter and jitter', () => {
  const run = (b: DabBrush, seed: number) => {
    const p = new DabPath(b, makeRng(seed));
    return [...p.to({ x: 0, y: 0 }, 10, 1), ...p.to({ x: 100, y: 0 }, 10, 1)];
  };

  it('leaves dabs exactly on the line with none', () => {
    for (const d of run(brush({ spacing: 1 }), 3)) {
      expect(d.y).toBeCloseTo(0, 9);
      expect(d.size).toBe(10);
    }
  });

  it('moves dabs off the line by no more than scatter times the size, and the same way for the same seed', () => {
    const b = brush({ spacing: 1, scatter: 0.5 });
    const a = run(b, 5);
    expect(a.some((d) => Math.abs(d.y) > 0.5)).toBe(true);
    for (const d of a) expect(Math.hypot(d.x - Math.round(d.x / 10) * 10, d.y)).toBeLessThanOrEqual(5.0001);
    expect(run(b, 5)).toEqual(a);
    expect(run(b, 6)).not.toEqual(a);
  });

  it('makes dabs smaller by up to the size jitter, never bigger', () => {
    const a = run(brush({ spacing: 1, sizeJitter: 0.6 }), 9);
    expect(a.every((d) => d.size <= 10 && d.size >= 4 - 1e-9)).toBe(true);
    expect(new Set(a.map((d) => d.size)).size).toBeGreaterThan(3);
  });

  it('turns dabs by up to the angle jitter', () => {
    const a = run(brush({ spacing: 1, angleJitter: 0.25 }), 2);
    expect(a.every((d) => Math.abs(d.angle) <= Math.PI * 0.25 + 1e-9)).toBe(true);
    expect(a.some((d) => Math.abs(d.angle) > 0.05)).toBe(true);
  });
});

describe('turning with the line', () => {
  it('points the tip along the way you draw, on top of its own angle', () => {
    const p = new DabPath(brush({ follow: true, spacing: 1, angle: 90 }), makeRng(1));
    const a = [...p.to({ x: 0, y: 0 }, 10, 1), ...p.to({ x: 0, y: 40 }, 10, 1)];
    // Heading down is a quarter turn; plus the tip's own quarter turn.
    expect(a.length).toBeGreaterThan(2);
    for (const d of a) expect(d.angle).toBeCloseTo(Math.PI, 5);
  });

  it('holds the first dab until the line has a direction, and gives it the same heading', () => {
    const p = new DabPath(brush({ follow: true, spacing: 1 }), makeRng(1));
    expect(p.to({ x: 0, y: 0 }, 10, 1)).toHaveLength(0);
    const a = p.to({ x: 12, y: 0 }, 10, 1);
    expect(a).toHaveLength(2);
    expect(a[0].x).toBe(0);
    expect(a[0].angle).toBeCloseTo(0, 9);
  });

  it('still lays a click that never moved, at the tip\'s own angle', () => {
    const p = new DabPath(brush({ follow: true, angle: 30 }), makeRng(1));
    p.to({ x: 4, y: 4 }, 10, 1);
    const a = p.end();
    expect(a).toHaveLength(1);
    expect(a[0].angle).toBeCloseTo((30 * Math.PI) / 180, 9);
    expect(p.end()).toHaveLength(0);
  });

  it('lays the first dab at once when it does not turn', () => {
    const p = new DabPath(brush({ follow: false }), makeRng(1));
    expect(p.to({ x: 3, y: 3 }, 10, 1)).toHaveLength(1);
  });
});

describe('putting dabs on whole pixels', () => {
  it('centres an odd width on a pixel and an even one on a corner', () => {
    expect(snapAxis(3.9, 5)).toBe(3.5);
    expect(snapAxis(3.9, 4)).toBe(4);
    expect(snapAxis(3.4, 4)).toBe(3);
    expect(snapAxis(-0.2, 1)).toBe(-0.5);
  });
});

describe('mirror drawing', () => {
  it('gives a dab an image across each line, turned the mirror way', () => {
    const d = { x: 10, y: 6, size: 8, angle: 0.5, flow: 1 };
    const h = mirrorDabs('h', 64, 64, d);
    expect(h).toHaveLength(2);
    expect(h[1].x).toBe(54);
    expect(h[1].y).toBe(6);
    expect(h[1].angle).toBeCloseTo(Math.PI - 0.5, 9);
    expect(mirrorDabs('both', 64, 64, d)).toHaveLength(4);
    expect(mirrorDabs('off', 64, 64, d)).toEqual([d]);
  });
});

describe('reading a saved brush', () => {
  it('fills in a whole brush from nothing, and keeps it in range', () => {
    expect(cleanDab(null)).toEqual(DEFAULT_DAB);
    const c = cleanDab({ size: 9999, hardness: -3, angle: 725, roundness: 0, spacing: 50, scatter: 9, flow: 0, opacity: 7, tip: 'banana', aliased: 'yes' });
    expect(c.size).toBe(300);
    expect(c.hardness).toBe(0);
    expect(c.angle).toBe(5);
    expect(c.roundness).toBe(0.05);
    expect(c.spacing).toBe(4);
    expect(c.scatter).toBe(2);
    expect(c.flow).toBe(0.05);
    expect(c.opacity).toBe(1);
    expect(c.tip).toBe('round');
    expect(c.aliased).toBe(true);
  });

  it('asks for a round tip when a picture tip has no picture, and keeps a good picture', () => {
    expect(cleanDab({ tip: 'picture' }).tip).toBe('round');
    expect(cleanDab({ tip: 'picture', picture: { w: 1, h: 1, colours: ['#000000'], cells: [9], keep: false } }).tip).toBe('round');
    const ok = cleanDab({ tip: 'picture', picture: PIC });
    expect(ok.tip).toBe('picture');
    expect(ok.picture?.w).toBe(3);
  });

  it('fills the fields an older save does not have, from the brush given', () => {
    const base = brush({ size: 12, aliased: false });
    const c = cleanDab({ size: 20 }, base);
    expect(c.size).toBe(20);
    expect(c.aliased).toBe(false);
  });

  it('knows the same brush from a changed one', () => {
    expect(sameDab(brush(), brush({ size: 6.0000001 }))).toBe(true);
    expect(sameDab(brush(), brush({ spacing: 0.5 }))).toBe(false);
    expect(sameDab(brush({ tip: 'picture', picture: PIC }), brush({ tip: 'picture', picture: { ...PIC } }))).toBe(true);
    expect(sameDab(brush({ tip: 'picture', picture: PIC }), brush())).toBe(false);
    // A picture left behind on a round tip changes nothing.
    expect(sameDab(brush({ picture: PIC }), brush())).toBe(true);
  });
});
