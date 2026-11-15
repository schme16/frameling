import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Shape } from '../../src/core/format';
import { loadFile } from '../../src/io/file';
import { fillRegion, type FillResult } from '../../src/geometry/fill';
import { pointInPaths } from '../../src/geometry/hit';
import { FILL_HINTS } from '../../src/tools/fill';
import { arc, pan, stroke } from './helpers';

const B = { x: 0, y: 0, width: 600, height: 600 };
const at = (shapes: Shape[], x: number, y: number, gap: number, bounds = B, maxPixels?: number): FillResult => fillRegion(shapes, { x, y }, { gap, bounds, maxPixels });

const GAP_14PX = 0.15;
const GAP_33PX = 0.25;
const HANDLE = [430, 450, 470];

describe('where you click must not change whether the fill works', () => {
  it('a thick closed shape fills from the middle and from just inside the rim', () => {
    const ring = [stroke(arc(300, 300, 100, 0, Math.PI * 2 + 0.2), 16)];
    const mid = at(ring, 300, 300, 24);
    expect(mid.kind).toBe('ok');
    // Rim centre is 100 out, the line's inner edge 92: click 2 and 4 document pixels inside that edge.
    for (const d of [90, 88, 84]) {
      const x = 300 + d * Math.SQRT1_2;
      const r = at(ring, x, 300 + d * Math.SQRT1_2, 24);
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok' && mid.kind === 'ok') expect(Math.abs(r.area - mid.area)).toBeLessThan(mid.area * 0.02);
    }
  });

  it('keeps the whole gap setting when the click is in a narrow handle, so the pan fills from there too', () => {
    const s = pan(GAP_14PX);
    const mid = at(s, 300, 300, 24);
    expect(mid.kind).toBe('ok');
    for (const x of HANDLE) {
      const r = at(s, x, 300, 24);
      expect(r.kind).toBe('ok');
      if (r.kind !== 'ok' || mid.kind !== 'ok') continue;
      expect(pointInPaths(r.paths, x, 300)).toBe(true);
      // The same area as from the middle, not a sliver.
      expect(r.area).toBeGreaterThan(mid.area * 0.98);
      expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    }
  });

  it('every gap setting that fills from the middle fills from the handle too', () => {
    const s = pan(GAP_14PX);
    for (const gap of [14, 20, 24, 30, 48]) {
      expect(at(s, 300, 300, gap).kind).toBe('ok');
      for (const x of HANDLE) expect(at(s, x, 300, gap).kind).toBe('ok');
    }
  });
});

describe('a genuinely open shape still refuses, wherever you click', () => {
  it('a 33px break leaks from the middle, and never fills from the handle', () => {
    const s = pan(GAP_33PX);
    expect(at(s, 300, 300, 24).kind).toBe('leak');
    for (const x of HANDLE) expect(['leak', 'cramped']).toContain(at(s, x, 300, 24).kind);
  });

  it('with no gap setting a 14px break leaks from everywhere', () => {
    const s = pan(GAP_14PX);
    expect(at(s, 300, 300, 0).kind).toBe('leak');
    for (const x of HANDLE) expect(at(s, x, 300, 0).kind).toBe('leak');
  });

  it('says cramped, not leak, when the gap had to be dropped to start from the click and the shape then leaked', () => {
    // The break needs 24px of closing; the handle only has room for about 18.
    const s = pan(0.2);
    expect(at(s, 300, 300, 24).kind).toBe('ok');
    for (const x of HANDLE) {
      const r = at(s, x, 300, 24);
      expect(r.kind).toBe('cramped');
      expect(r.stats.wanted).toBeGreaterThan(r.stats.radius);
    }
  });
});

describe('the two failures read differently', () => {
  it('cramped does not tell you to raise the gap setting', () => {
    expect(FILL_HINTS.cramped).not.toMatch(/bigger|larger|raise|increase/i);
    expect(FILL_HINTS.cramped).toMatch(/roomier|more room/i);
    expect(FILL_HINTS.cramped).not.toContain('—');
    expect(FILL_HINTS.leak).toMatch(/gap/i);
    expect(FILL_HINTS.cramped).not.toBe(FILL_HINTS.leak);
  });
});

describe('canvas size', () => {
  // The same pan at 1x, then with the mask budget squeezed so the mask is coarser (as on a huge canvas).
  it('the same pan fills from the middle and the handle at coarser mask scales', () => {
    const s = pan(GAP_14PX);
    for (const maxPixels of [360_000, 90_000, 40_000]) {
      expect(at(s, 300, 300, 24, B, maxPixels).kind).toBe('ok');
      for (const x of HANDLE) expect(at(s, x, 300, 24, B, maxPixels).kind).toBe('ok');
      expect(at(s, 300, 300, 0, B, maxPixels).kind).toBe('leak');
    }
  });
});

describe("the tester's pan (fixture)", () => {
  const { doc } = loadFile(new Uint8Array(readFileSync(new URL('../fixtures/pan-fill-gap.frameling', import.meta.url))));
  const shapes = Object.values(doc.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : []));
  const bounds = { x: 0, y: 0, width: doc.width, height: doc.height };
  const inside: [number, number][] = [[560, 420], [520, 400], [620, 380], [600, 440], [660, 350]];

  it('its outline is made of fills, and a fill counts as a wall: every spot inside fills just the inside, at any gap setting', () => {
    expect(shapes.filter((s) => s.type === 'fill').length).toBeGreaterThan(10);
    for (const gap of [0, 10, 24, 48]) {
      for (const [x, y] of inside) {
        const r = at(shapes, x, y, gap, bounds);
        expect(r.kind).toBe('ok');
        if (r.kind !== 'ok') continue;
        expect(pointInPaths(r.paths, x, y)).toBe(true);
        // The inside of the pan, not the canvas: a small part of a 1280x720 stage, and not the rest of it.
        expect(r.area).toBeGreaterThan(3000);
        expect(r.area).toBeLessThan(doc.width * doc.height * 0.2);
        expect(r.box.x).toBeGreaterThan(400);
        expect(r.box.x + r.box.width).toBeLessThan(800);
        expect(pointInPaths(r.paths, 100, 100)).toBe(false);
        expect(pointInPaths(r.paths, 1000, 600)).toBe(false);
      }
    }
  });

  it('every spot inside gives the same area, so the click does not decide it', () => {
    const areas = inside.map(([x, y]) => {
      const r = at(shapes, x, y, 0, bounds);
      return r.kind === 'ok' ? r.area : 0;
    });
    for (const a of areas) expect(Math.abs(a - areas[0])).toBeLessThan(areas[0] * 0.02);
  });

  it('a click outside the pan still fills the outside, not the inside', () => {
    const r = at(shapes, 100, 100, 0, bounds);
    expect(r.kind).toBe('leak');
  });
});
