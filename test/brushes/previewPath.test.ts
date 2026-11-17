// @vitest-environment jsdom
// A brush's picture goes down the same road as a real line: through the shape's own effects, so chalk and charcoal
// show their paper tooth in the picker exactly as they do on the page.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawShapeFx } from '../../src/core/render';
import { clearThumbs, PREVIEW_SEED, thumbFor } from '../../src/brushes/thumbs';
import { STARTERS } from '../../src/brushes/starters';
import { toothEffects } from '../../src/tools/vectorStroke';

vi.mock('../../src/core/render', () => ({ drawShape: vi.fn(), drawShapeFx: vi.fn() }));

const chalky = STARTERS.filter((b) => b.group === 'Chalk and charcoal');

beforeEach(() => {
  clearThumbs();
  vi.mocked(drawShapeFx).mockClear();
  HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {} })) as unknown as HTMLCanvasElement['getContext'];
});

describe('chalk and charcoal pictures', () => {
  it('has all seven brushes in the folder, each on paper tooth', () => {
    expect(chalky.map((b) => b.id.replace('starter:', '')).sort()).toEqual(['chalk', 'charcoal', 'compressed-charcoal', 'crayon', 'oil-pastel', 'soft-pastel', 'vine-charcoal']);
    for (const b of chalky) expect(toothEffects(b.brush, 1), b.id).toBeTruthy();
  });

  for (const kind of ['dab', 'stroke'] as const) {
    it(`draws the ${kind} of every one with the paper tooth the real line carries`, () => {
      for (const b of chalky) {
        vi.mocked(drawShapeFx).mockClear();
        thumbFor(b.brush, kind, 120, 40, 1, '#222');
        expect(drawShapeFx, b.id).toHaveBeenCalledTimes(1);
        const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { effects?: { kind: string; values: Record<string, unknown> }[] };
        const real = toothEffects(b.brush, PREVIEW_SEED)!;
        expect(shape.effects?.[0].kind, b.id).toBe('tooth');
        expect(shape.effects?.[0].values, b.id).toEqual(real[0].values);
      }
    });
  }

  it('keeps the paper the same on every draw, so a picture never flickers', () => {
    const b = chalky[0].brush;
    thumbFor(b, 'stroke', 120, 40, 1, '#222');
    clearThumbs();
    thumbFor(b, 'stroke', 120, 40, 1, '#222');
    const calls = vi.mocked(drawShapeFx).mock.calls.map((c) => (c[1] as { effects: { values: unknown }[] }).effects[0].values);
    expect(calls[0]).toEqual(calls[1]);
  });
});

describe('bristle pictures', () => {
  const bristly = STARTERS.filter((b) => b.brush.tip?.kind === 'bristle');

  it('has bristle brushes in the Paint and Bristles folders, oil paint and hog bristle among them', () => {
    const ids = bristly.map((b) => b.id.replace('starter:', ''));
    for (const id of ['oil', 'bristle', 'hog', 'dry-bristle', 'fan', 'rake']) expect(ids).toContain(id);
  });

  it('draws the round thumbnail of every one as a short stroke across the box, not a small lined square', () => {
    for (const b of bristly) {
      vi.mocked(drawShapeFx).mockClear();
      thumbFor(b.brush, 'dab', 44, 30, 1, '#222');
      const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { points: { x: number; y: number }[] };
      const xs = shape.points.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs), b.id).toBeGreaterThan(44 * 0.7);
    }
  });

  it('leaves the dab of a tip that is not bristles as it was', () => {
    const round = STARTERS.find((b) => b.id === 'starter:chalk')!;
    vi.mocked(drawShapeFx).mockClear();
    thumbFor(round.brush, 'dab', 44, 30, 1, '#222');
    const xs = (vi.mocked(drawShapeFx).mock.calls[0][1] as { points: { x: number }[] }).points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(44 * 0.7);
  });
});

describe('no picture skips the effects', () => {
  it('no brush picture calls drawShape on a built stroke', () => {
    for (const f of ['src/brushes/thumbs.ts', 'src/tools/options/BrushOptions.tsx', 'src/brushes/TipOptions.tsx', 'src/brushes/BrushPickerPanel.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/drawShape\(\s*g\s*,\s*buildStroke/);
    }
  });
});
