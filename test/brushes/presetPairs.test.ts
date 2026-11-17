// The brushes that pair across the two sides (card pixel-brush-parity, piece 3): the same name in the same group, a pixel
// brush that draws the width its vector brother draws at every pen pressure, and stamps taken from the vector outlines.
import { describe, expect, it } from 'vitest';
import { PIXEL_STARTERS, STARTERS } from '../../src/brushes/model';
import { stampPicture } from '../../src/brushes/pixelStarters';
import { routeFor } from '../../src/dab/dynamics';
import { BRUSH_PAIRS } from './parityGaps';

const vec = (id: string) => STARTERS.find((s) => s.id === id)!;
const pix = (id: string) => PIXEL_STARTERS.find((s) => s.id === id)!;
/** The width of a vector line as a share of its size, at a pen pressure (src/geometry/tipShapes.ts widthAt). */
const vectorWidth = (thinning: number, p: number) => 1 + thinning * (2 * p - 1);

describe('brushes that pair across the two sides', () => {
  const newPairs = BRUSH_PAIRS.filter(([, , how]) => how === 'same').filter(([v]) => !['starter:pencil'].includes(v));
  it('have the same name and the same group on both sides, for the ones made to match', () => {
    const made = ['mechanical', 'colour-pencil', 'sketch-pencil', 'gel', 'ballpoint', 'brush-pen', 'dip-pen', 'fine-marker', 'block-marker', 'brush-marker', 'tapered', 'round-brush', 'dry-brush', 'charcoal', 'oil-pastel', 'leaves', 'falling-leaves', 'paw-prints', 'dashed-line', 'broad', 'round-nib', 'pressure-pencil', 'pressure-spray', 'speckle', 'sprinkle', 'slash'];
    for (const m of made) {
      const pair = newPairs.find(([v]) => v === `starter:${m}`);
      expect(pair, `${m} is paired`).toBeTruthy();
      const [v, p] = pair!;
      expect(pix(p).name).toBe(vec(v).name);
      expect(pix(p).group).toBe(vec(v).group);
    }
  });
  it('draw the same width at every pressure when the vector brush thins with pressure', () => {
    // A dab is a whole number of pixels, so the pixel brush is the vector one to within that rounding: the same share of it at every pressure.
    for (const [v, p, size] of [
      ['starter:gel', 'starter:px-gel', 3.5],
      ['starter:brush-pen', 'starter:px-brush-pen', 12],
      ['starter:dip-pen', 'starter:px-dip-pen', 9],
      ['starter:tapered', 'starter:px-tapered', 14],
      ['starter:round-nib', 'starter:px-round-nib', 8],
    ] as const) {
      const t = vec(v).brush.thinning;
      const dab = (pix(p).pixel as unknown as { dab: { size: number; dynamics: never[] } }).dab;
      const route = routeFor(dab.dynamics, 'size')!;
      const share = (press: number) => (dab.size * (1 - route.amount + route.amount * press)) / (size * vectorWidth(t, press));
      expect(share(1), `${p} overall`).toBeGreaterThan(0.85);
      expect(share(1), `${p} overall`).toBeLessThan(1.15);
      for (const press of [0, 0.25, 0.5, 0.75]) expect(share(press), `${p} at ${press}`).toBeCloseTo(share(1), 1);
    }
  });
  it('leave the pen page out of a brush that has no thinning, with a pressure route that does nothing', () => {
    for (const id of ['starter:px-fine-marker', 'starter:px-block-marker', 'starter:px-leaves', 'starter:px-paw-prints', 'starter:px-broad-nib']) {
      const dab = (pix(id).pixel as unknown as { dab: { dynamics: { from: string; to: string; amount: number }[] } }).dab;
      expect(dab.dynamics.filter((r) => r.from === 'pressure' && (r.to === 'size' || r.to === 'flow')).every((r) => r.amount === 0)).toBe(true);
      expect(dab.dynamics.some((r) => r.to === 'size')).toBe(true);
    }
  });
});

describe('a stamp as a picture tip', () => {
  it('is the vector outline on a 32 by 32 square, soft, and the same every time', () => {
    const a = stampPicture('leaf');
    const b = stampPicture('leaf');
    expect(a).toEqual(b);
    expect([a.w, a.h, a.soft]).toEqual([32, 32, true]);
    const painted = a.cells.filter((c) => c > 0).length;
    expect(painted).toBeGreaterThan(40);
    expect(painted).toBeLessThan(32 * 32 * 0.8);
  });
  it('keeps a dash thin and a paw in five pieces', () => {
    const dash = stampPicture('dash');
    const rows = new Set<number>();
    dash.cells.forEach((c, i) => c > 0 && rows.add(Math.floor(i / 32)));
    expect(rows.size).toBeLessThan(16);
    expect(stampPicture('paw').cells.filter((c) => c > 0).length).toBeGreaterThan(20);
  });
});
