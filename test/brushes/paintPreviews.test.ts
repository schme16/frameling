// @vitest-environment jsdom
// The Library's picture of Oil paint, Bristle brush and Dry brush is the line the canvas draws: same tip, same paper tooth.
// (The three once looked identical, but that was the brushes, not the pictures. This keeps the pictures honest anyway.)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawShapeFx } from '../../src/core/render';
import { clearThumbs, PREVIEW_SEED, thumbFor } from '../../src/brushes/thumbs';
import { STARTERS } from '../../src/brushes/starters';
import { toothEffects } from '../../src/tools/vectorStroke';

vi.mock('../../src/core/render', () => ({ drawShape: vi.fn(), drawShapeFx: vi.fn() }));

const preset = (id: string) => STARTERS.find((b) => b.id === `starter:${id}`)!;

beforeEach(() => {
  clearThumbs();
  vi.mocked(drawShapeFx).mockClear();
  HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {} })) as unknown as HTMLCanvasElement['getContext'];
});

describe('paint brush pictures', () => {
  for (const kind of ['dab', 'stroke'] as const) {
    for (const id of ['oil', 'bristle', 'dry-brush']) {
      it(`draws the ${kind} of ${id} with the tip the canvas uses`, () => {
        const b = preset(id).brush;
        thumbFor(b, kind, 120, 40, 1, '#222');
        expect(drawShapeFx).toHaveBeenCalledTimes(1);
        const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { brush: { tip: unknown }; effects?: { kind: string; values: unknown }[] };
        expect(shape.brush.tip).toEqual(b.tip);
        const real = toothEffects(b, PREVIEW_SEED);
        if (real) expect(shape.effects?.[0].values).toEqual(real[0].values);
        else expect(shape.effects).toBeUndefined();
      });
    }
  }

  it('gives the dry brush a paper and the other two none, so the three stay different', () => {
    expect(toothEffects(preset('dry-brush').brush)).toBeTruthy();
    expect(toothEffects(preset('oil').brush)).toBeUndefined();
    expect(toothEffects(preset('bristle').brush)).toBeUndefined();
  });
});
