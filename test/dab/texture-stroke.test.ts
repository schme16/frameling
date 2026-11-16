// Strokes with the new pieces on a plain buffer: grain, a dual brush, dynamics, colour and wet mode, and the rule that a
// locked palette never gets a colour it did not have, whatever is switched on.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke, type DabParams } from '../../src/dab/stroke';
import { DEFAULT_DAB, type DabBrush, type Sense } from '../../src/dab/maths';
import type { DynRoute } from '../../src/dab/dynamics';

const W = 96;
const H = 48;
type C = [number, number, number, number];
const RED: C = [220, 40, 40, 255];
const route = (from: DynRoute['from'], to: DynRoute['to'], amount = 1, invert = false): DynRoute => ({ from, to, amount, invert });
const line = (n = 40) => Array.from({ length: n }, (_, i) => ({ x: 8 + (i / (n - 1)) * 80, y: 24 }));

function draw(b: Partial<DabBrush>, o: Partial<DabParams> & { sense?: (i: number, n: number) => Sense; base?: C; size?: number } = {}) {
  const px = new Uint8ClampedArray(W * H * 4);
  if (o.base) for (let i = 0; i < W * H; i++) px.set(o.base, i * 4);
  const brush = { ...DEFAULT_DAB, ...b };
  const s = new DabStroke(bufferSurface(px, W, H), { brush, color: RED, edge: brush.aliased ? 'crisp' : 'smooth', seed: 1, ...o });
  const pts = line();
  pts.forEach((p, i) => s.moveTo(p, o.size ?? brush.size, brush.flow, o.sense?.(i, pts.length)));
  s.finish();
  return px;
}
const at = (g: Uint8ClampedArray, x: number, y: number): C => [g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2], g[(y * W + x) * 4 + 3]];
const count = (g: Uint8ClampedArray) => { let n = 0; for (let i = 3; i < g.length; i += 4) if (g[i]) n++; return n; };
const heightAt = (g: Uint8ClampedArray, x: number) => { let n = 0; for (let y = 0; y < H; y++) if (g[(y * W + x) * 4 + 3]) n++; return n; };

describe('a brush with a grain', () => {
  it('leaves gaps the paper shows through at low flow, and fewer of them with more paint', () => {
    const plain = draw({ size: 9, flow: 0.4 });
    const light = draw({ size: 9, flow: 0.4, spacing: 1, grain: { paper: 'rough', depth: 1, scale: 1, moving: false } });
    const heavy = draw({ size: 9, flow: 1, spacing: 1, grain: { paper: 'rough', depth: 1, scale: 1, moving: false } }, {});
    expect(count(light)).toBeLessThan(count(plain));
    expect(count(heavy)).toBeGreaterThan(count(light));
  });

  it('is fixed to the page: the same stroke twice lays paint on the same pixels', () => {
    const b = { size: 7, flow: 0.5, grain: { paper: 'laid' as const, depth: 1, scale: 1, moving: false } };
    expect(Array.from(draw(b))).toEqual(Array.from(draw(b)));
  });

  it('finds the paper in a new place for each dab when it moves', () => {
    const fixed = draw({ size: 9, flow: 0.5, grain: { paper: 'medium', depth: 1, scale: 1, moving: false } });
    const moving = draw({ size: 9, flow: 0.5, grain: { paper: 'medium', depth: 1, scale: 1, moving: true } });
    expect(Array.from(fixed)).not.toEqual(Array.from(moving));
    // Moving grain gets filled in by overlapping dabs, so it covers more than fixed grain does.
    expect(count(moving)).toBeGreaterThan(count(fixed));
  });

  it('makes no difference at depth 0', () => {
    const a = draw({ size: 9 });
    const b = draw({ size: 9, grain: { paper: 'rough', depth: 0, scale: 1, moving: false } });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('stays whole pixels with sharp edges: red or nothing', () => {
    const g = draw({ size: 11, flow: 0.6, grain: { paper: 'fine', depth: 0.7, scale: 2, moving: false } });
    for (let i = 0; i < W * H; i++) expect([0, 255]).toContain(g[i * 4 + 3]);
  });
});

describe('a brush with a dual tip', () => {
  it('paints only where the dots are, so it covers less than the plain brush', () => {
    const plain = draw({ size: 13 });
    const dots = draw({ size: 13, dual: { tip: 'round', size: 2, density: 0.3, cut: false } });
    expect(count(dots)).toBeLessThan(count(plain) * 0.6);
    expect(count(dots)).toBeGreaterThan(count(plain) * 0.1);
  });

  it('with a cut, paints everywhere the dots are not: the two together are the plain stroke', () => {
    const d = { tip: 'round' as const, size: 2, density: 0.3 };
    const plain = draw({ size: 13 });
    const on = draw({ size: 13, dual: { ...d, cut: false } });
    const off = draw({ size: 13, dual: { ...d, cut: true } });
    for (let i = 0; i < W * H; i++) expect((on[i * 4 + 3] ? 1 : 0) + (off[i * 4 + 3] ? 1 : 0)).toBe(plain[i * 4 + 3] ? 1 : 0);
  });

  it('gives each stroke its own scatter of dots', () => {
    const b = { size: 13, dual: { tip: 'round' as const, size: 2, density: 0.3, cut: false } };
    const a = draw(b, { seed: 1 });
    const c = draw(b, { seed: 2 });
    expect(Array.from(a)).not.toEqual(Array.from(c));
    expect(Array.from(a)).toEqual(Array.from(draw(b, { seed: 1 })));
  });
});

describe('dynamics in a stroke', () => {
  it('draws a line thicker where the pen pressed harder', () => {
    const g = draw({ size: 12, dynamics: [route('pressure', 'size', 1)] }, { sense: (i, n) => ({ pressure: i / (n - 1) }) });
    expect(heightAt(g, 80)).toBeGreaterThan(heightAt(g, 14) + 4);
  });

  it('is a plain even line for a mouse, which has no pressure', () => {
    const g = draw({ size: 12, dynamics: [route('pressure', 'size', 1)] });
    expect(heightAt(g, 80)).toBe(heightAt(g, 30));
  });

  it('tapers to a point with a fade', () => {
    const g = draw({ size: 12, dynamics: [route('fade', 'size', 1)], fadeLength: 70 });
    expect(heightAt(g, 12)).toBeGreaterThan(heightAt(g, 70) + 3);
  });

  it('is see-through where the pen pressed lightly, with flow driven by pressure', () => {
    const g = draw({ size: 9, aliased: false, dynamics: [route('pressure', 'flow', 0.9)] }, { sense: (i, n) => ({ pressure: i / (n - 1) }), edge: 'smooth' });
    expect(at(g, 80, 24)[3]).toBeGreaterThan(at(g, 14, 24)[3]);
  });
});

describe('colour in a stroke', () => {
  it('turns the hue along the line with a route to hue', () => {
    const g = draw({ size: 9, aliased: false, dynamics: [route('pressure', 'hue', 0.5)] }, { sense: (i, n) => ({ pressure: i / (n - 1) }), edge: 'smooth' });
    expect(at(g, 14, 24).slice(0, 3)).not.toEqual(at(g, 80, 24).slice(0, 3));
  });

  it('goes toward the back colour with a route to mix', () => {
    const BLUE: C = [0, 0, 255, 255];
    const g = draw({ size: 9, dynamics: [route('pressure', 'mix', 1)] }, { back: BLUE, sense: (i, n) => ({ pressure: i / (n - 1) }) });
    const start = at(g, 12, 24);
    const end = at(g, 86, 24);
    expect(start[0]).toBeGreaterThan(end[0]);
    expect(end[2]).toBeGreaterThan(start[2]);
  });

  it('carries colour from what it passes over in wet mode', () => {
    // A blue block under the middle of the line: a wet brush leaves the red tinted blue after it, a dry one does not.
    const px = () => {
      const g = new Uint8ClampedArray(W * H * 4);
      for (let y = 10; y < 38; y++) for (let x = 30; x < 50; x++) g.set([0, 0, 255, 255], (y * W + x) * 4);
      return g;
    };
    const run = (wet: number) => {
      const g = px();
      const s = new DabStroke(bufferSurface(g, W, H), { brush: { ...DEFAULT_DAB, size: 7, wet }, color: RED, edge: 'crisp', seed: 1 });
      for (const p of line()) s.moveTo(p, 7, 1);
      s.finish();
      return g;
    };
    const dry = run(0);
    const wet = run(1);
    expect(at(dry, 70, 24)).toEqual(RED);
    expect(at(wet, 70, 24)[2]).toBeGreaterThan(at(wet, 12, 24)[2]);
    expect(at(wet, 12, 24)).toEqual(RED);
  });
});

describe('a locked palette with everything switched on', () => {
  const palette: C[] = [[0, 0, 0, 255], [255, 255, 255, 255], [220, 40, 40, 255]];
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

  it('only ever gets colours from the palette, even with hue swings, mixing, wet colour, grain and a dual tip', () => {
    for (const aliased of [true, false]) {
      const g = draw(
        {
          size: 12,
          aliased,
          wet: 0.8,
          flow: 0.7,
          dynamics: [route('random', 'hue', 1), route('random', 'lightness', 1), route('speed', 'mix', 1), route('pressure', 'size', 0.5)],
          grain: { paper: 'medium', depth: 0.6, scale: 1, moving: false },
          dual: { tip: 'round', size: 2, density: 0.6, cut: false },
        },
        { edge: 'crisp', snap, back: [255, 255, 255, 255], base: [0, 0, 0, 255], sense: (i, n) => ({ pressure: i / (n - 1), speed: 0.5 }) },
      );
      let painted = 0;
      for (let i = 0; i < W * H; i++) {
        const c: C = [g[i * 4], g[i * 4 + 1], g[i * 4 + 2], g[i * 4 + 3]];
        expect(palette.some((p) => p.every((v, k) => v === c[k]))).toBe(true);
        if (c[0] !== 0 || c[1] !== 0 || c[2] !== 0) painted++;
      }
      expect(painted).toBeGreaterThan(30);
    }
  });
});
