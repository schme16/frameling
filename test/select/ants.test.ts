// The selected pixels always show as selected: a crawling dashed edge (marching ants) drawn over the stage,
// whichever tool is picked. It went missing once when the Select tools were split up, so this guards it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../src/core/store';
import '../../src/core/commands';
import '../../src/tools';
import { getStageOverlays } from '../../src/canvas/controller';
import { fullMask, rectMask } from '../../src/select/mask';
import { setPixelSelection } from '../../src/select/pixel-state';
import { pixelStore } from '../tools/helpers';

// Node has no Path2D, which the overlay needs to hold the edge path.
class FakePath {
  readonly lines: number[] = [];
  moveTo(x: number, y: number): void {
    this.lines.push(x, y);
  }
  lineTo(x: number, y: number): void {
    this.lines.push(x, y);
  }
}
if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') (globalThis as { Path2D?: unknown }).Path2D = FakePath;

/** A canvas context that only remembers what was asked of it. */
function fakeContext() {
  const strokes: unknown[] = [];
  return {
    strokes,
    gx: {
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn((p: unknown) => void strokes.push(p)),
      lineWidth: 0,
      lineDashOffset: 0,
      strokeStyle: '',
    } as unknown as CanvasRenderingContext2D,
  };
}

const drawAll = (gx: CanvasRenderingContext2D) => {
  for (const fn of getStageOverlays()) fn(gx, 1, []);
};

beforeEach(() => {
  pixelStore();
  setPixelSelection(null);
});

describe('the selected pixels show as selected', () => {
  it('draws a dashed edge over the stage when something is selected', () => {
    const a = fakeContext();
    drawAll(a.gx);
    expect(a.strokes.length).toBe(0);
    setPixelSelection(rectMask(8, 8, 1, 1, 4, 4));
    const b = fakeContext();
    drawAll(b.gx);
    // Twice round the same path: white dashes, then black ones between them.
    expect(b.strokes.length).toBe(2);
    expect(b.strokes[0]).toBe(b.strokes[1]);
  });

  it('keeps drawing it when everything is selected', () => {
    setPixelSelection(fullMask(8, 8));
    const c = fakeContext();
    drawAll(c.gx);
    expect(c.strokes.length).toBe(2);
  });
});
