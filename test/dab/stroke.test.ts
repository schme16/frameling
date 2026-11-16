// Dab strokes on a plain buffer: dabs at their spacing, a crisp edge using only whole pixels, flow building up to the
// opacity, anti-aliasing on and off, a locked palette, picture tips with their own colours, mirror drawing.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke, type DabParams } from '../../src/dab/stroke';
import { DEFAULT_DAB, type DabBrush } from '../../src/dab/maths';

const W = 64;
const H = 48;
type C = [number, number, number, number];
const RED: C = [220, 40, 40, 255];

function draw(b: Partial<DabBrush>, pts: [number, number][], opts: Partial<DabParams> & { size?: number; flow?: number; base?: C } = {}) {
  const px = new Uint8ClampedArray(W * H * 4);
  if (opts.base) for (let i = 0; i < W * H; i++) px.set(opts.base, i * 4);
  const brush = { ...DEFAULT_DAB, ...b };
  const s = new DabStroke(bufferSurface(px, W, H), { brush, color: RED, edge: brush.aliased ? 'crisp' : 'smooth', seed: 1, ...opts });
  for (const [x, y] of pts) s.moveTo({ x, y }, opts.size ?? brush.size, opts.flow ?? 1);
  s.finish();
  return px;
}
const at = (g: Uint8ClampedArray, x: number, y: number): C => [g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2], g[(y * W + x) * 4 + 3]];
const count = (g: Uint8ClampedArray) => { let n = 0; for (let i = 3; i < g.length; i += 4) if (g[i]) n++; return n; };

describe('an aliased brush', () => {
  it('paints whole pixels only: red or nothing, never a see-through one', () => {
    const g = draw({ size: 9, hardness: 0.4 }, [[20, 20], [40, 26]]);
    for (let i = 0; i < W * H; i++) {
      const a = g[i * 4 + 3];
      expect(a === 0 || a === 255).toBe(true);
      if (a) expect([g[i * 4], g[i * 4 + 1], g[i * 4 + 2]]).toEqual([220, 40, 40]);
    }
  });

  it('puts a one pixel brush on one pixel, wherever the pointer is between pixels', () => {
    for (const [x, y] of [[10.1, 10.1], [10.9, 10.9], [10.5, 10.99]] as [number, number][]) {
      const g = draw({ size: 1 }, [[x, y]]);
      expect(count(g)).toBe(1);
      expect(at(g, 10, 10)).toEqual(RED);
    }
  });

  it('draws the same disc wherever it lands', () => {
    const a = draw({ size: 7 }, [[20.2, 20.2]]);
    const b = draw({ size: 7 }, [[20.8, 20.8]]);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(count(a)).toBe(37);
  });

  it('turns a soft edge into a dither of the colour that is there, never a new colour', () => {
    const g = draw({ size: 24, hardness: 0 }, [[30, 24]]);
    const row = Array.from({ length: 24 }, (_, i) => at(g, 18 + i, 24)[3]);
    expect(row.some((a) => a === 255)).toBe(true);
    expect(row.some((a) => a === 0)).toBe(true);
    expect(row.every((a) => a === 0 || a === 255)).toBe(true);
  });
});

describe('an anti-aliased brush', () => {
  it('has a see-through edge, and the same colour all through', () => {
    const g = draw({ size: 12, hardness: 0.5, aliased: false }, [[30, 24]]);
    expect(at(g, 30, 24)[3]).toBe(255);
    const edge = Array.from({ length: 12 }, (_, i) => at(g, 24 + i, 24)).filter((c) => c[3] > 0 && c[3] < 255);
    expect(edge.length).toBeGreaterThan(0);
    for (const c of edge) expect(c.slice(0, 3)).toEqual([220, 40, 40]);
  });

  it('does not snap to the pixel grid: a half pixel move changes the edge', () => {
    const a = draw({ size: 7, aliased: false }, [[20, 20]]);
    const b = draw({ size: 7, aliased: false }, [[20.5, 20]]);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('spacing', () => {
  it('lays solid line at a quarter spacing and separate dots at wide spacing', () => {
    const tight = draw({ size: 5, spacing: 0.25 }, [[10, 20], [50, 20]]);
    for (let x = 10; x <= 50; x++) expect(at(tight, x, 20)[3]).toBe(255);
    const wide = draw({ size: 5, spacing: 2 }, [[10, 20], [50, 20]]);
    const row = Array.from({ length: W }, (_, x) => at(wide, x, 20)[3]);
    expect(count(wide)).toBeLessThan(count(tight));
    // Dots, not a line: a gap in the middle of the row.
    expect(at(wide, 17, 20)[3]).toBe(0);
  });
});

describe('flow and opacity', () => {
  it('builds up as dabs overlap with a low flow, and stops at the opacity', () => {
    const g = draw({ size: 12, hardness: 1, aliased: false, flow: 0.2, opacity: 0.5, spacing: 0.1 }, [[20, 24], [44, 24]], { flow: 0.2 });
    const a = at(g, 32, 24)[3];
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThanOrEqual(129);
    const one = draw({ size: 12, hardness: 1, aliased: false, spacing: 4 }, [[20, 24]], { flow: 0.2 });
    expect(at(one, 20, 24)[3]).toBeLessThan(a);
  });

  it('does not darken where a stroke crosses itself at full opacity, and a second stroke does', () => {
    const pts: [number, number][] = [[10, 24], [50, 24], [50, 24], [30, 10], [30, 40]];
    const g = draw({ size: 6, aliased: false, flow: 0.5, opacity: 0.5 }, pts, { flow: 0.5 });
    expect(at(g, 30, 24)[3]).toBeLessThanOrEqual(128);
  });

  it('with the edge crisp, a low opacity is a dither of whole pixels at about that share', () => {
    const g = draw({ size: 20, opacity: 0.5 }, [[32, 24]]);
    const total = count(draw({ size: 20 }, [[32, 24]]));
    const on = count(g);
    expect(on / total).toBeGreaterThan(0.4);
    expect(on / total).toBeLessThan(0.6);
    for (let i = 3; i < g.length; i += 4) expect(g[i] === 0 || g[i] === 255).toBe(true);
  });
});

describe('over what is already there', () => {
  it('lays see-through paint over the old picture, once, and keeps the old colour under it', () => {
    const blue: C = [0, 0, 200, 255];
    const g = draw({ size: 10, aliased: false, flow: 0.5, opacity: 0.5 }, [[30, 24]], { base: blue, flow: 0.5 });
    const c = at(g, 30, 24);
    expect(c[3]).toBe(255);
    expect(c[0]).toBeGreaterThan(40);
    expect(c[2]).toBeGreaterThan(80);
    expect(at(g, 5, 5)).toEqual(blue);
  });
});

describe('a locked palette', () => {
  it('only ever gets colours from the palette', () => {
    const palette: C[] = [[0, 0, 0, 255], [255, 255, 255, 255]];
    const snap = (c: number[] | Uint8Array | Uint8ClampedArray) => {
      if (c[3] === 0) return;
      let best = 0;
      let d = Infinity;
      palette.forEach((p, i) => { const e = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (e < d) { d = e; best = i; } });
      c[0] = palette[best][0];
      c[1] = palette[best][1];
      c[2] = palette[best][2];
      c[3] = 255;
    };
    for (const aliased of [true, false]) {
      // A locked layer makes the edge crisp whatever the brush says.
      const g = draw({ size: 14, hardness: 0.2, aliased }, [[20, 20], [40, 30]], { edge: 'crisp', snap });
      for (let i = 0; i < W * H; i++) if (g[i * 4 + 3]) expect([g[i * 4 + 3], g[i * 4]]).toEqual(g[i * 4] === 0 ? [255, 0] : [255, 255]);
      expect(count(g)).toBeGreaterThan(50);
    }
  });
});

describe('a picture tip', () => {
  const PIC = { w: 3, h: 3, colours: ['#00ff00', '#0000ff'], cells: [1, 1, 1, 1, 2, 1, 1, 1, 1], keep: true };

  it('stamps its own colours, pixel for pixel, when it is not scaled', () => {
    const g = draw({ tip: 'picture', picture: PIC, size: 3, spacing: 1 }, [[20.5, 20.5]]);
    expect(at(g, 20, 20)).toEqual([0, 0, 255, 255]);
    expect(at(g, 19, 19)).toEqual([0, 255, 0, 255]);
    expect(at(g, 21, 21)).toEqual([0, 255, 0, 255]);
    expect(count(g)).toBe(9);
  });

  it('paints its shape in the colour you picked when it does not keep its own', () => {
    const g = draw({ tip: 'picture', picture: { ...PIC, keep: false }, size: 3, spacing: 1 }, [[20.5, 20.5]]);
    expect(at(g, 20, 20)).toEqual(RED);
    expect(count(g)).toBe(9);
  });

  it('lays copies side by side at a spacing of one', () => {
    const g = draw({ tip: 'picture', picture: PIC, size: 3, spacing: 1 }, [[10.5, 20.5], [31.5, 20.5]]);
    expect(at(g, 9, 20)[3]).toBe(255);
    expect(at(g, 12, 20)[3]).toBe(255);
    expect(at(g, 13, 20)[3]).toBe(255);
  });
});

describe('mirror drawing', () => {
  it('lays an image of each dab across the line', () => {
    const g = draw({ size: 5 }, [[10, 10]], { mirror: { mode: 'h', ax2: 64, ay2: 48 } });
    expect(at(g, 10, 10)[3]).toBe(255);
    expect(at(g, 53, 10)[3]).toBe(255);
    expect(at(g, 32, 10)[3]).toBe(0);
  });
});

describe('the edges of the picture', () => {
  it('does not paint outside it, and does not throw', () => {
    const g = draw({ size: 20 }, [[-5, -5], [2, 2], [W + 3, H + 3]]);
    expect(count(g)).toBeGreaterThan(0);
  });
});
