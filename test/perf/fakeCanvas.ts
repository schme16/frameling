// A counting stand-in for canvases, so tests can assert how much drawing a code path does (cache hits, bitmap
// builds, canvases allocated) without a browser. Counts are deterministic, unlike timings.
import { vi } from 'vitest';

export interface CanvasCounts {
  /** Canvases created. */
  canvases: number;
  /** Shapes filled or stroked (the work of rasterising vector drawings). */
  fills: number;
  drawImages: number;
  putImages: number;
}

export const counts: CanvasCounts = { canvases: 0, fills: 0, drawImages: 0, putImages: 0 };

export function resetCounts(): void {
  counts.canvases = counts.fills = counts.drawImages = counts.putImages = 0;
}

function fakeCtx(canvas: unknown) {
  const noop = () => {};
  const base: Record<string, unknown> = {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    save: noop,
    restore: noop,
    setTransform: noop,
    getTransform: () => ({}),
    scale: noop,
    translate: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    closePath: noop,
    fill: () => void counts.fills++,
    stroke: () => void counts.fills++,
    drawImage: () => void counts.drawImages++,
    putImageData: () => void counts.putImages++,
  };
  return base;
}

class FakePath2D {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

class FakeOffscreen {
  private ctx: unknown;
  constructor(
    public width: number,
    public height: number,
  ) {
    counts.canvases++;
  }
  getContext() {
    return (this.ctx ??= fakeCtx(this));
  }
}

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

export function installFakeCanvas(): void {
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
  vi.stubGlobal('ImageData', FakeImageData);
  resetCounts();
}

export function removeFakeCanvas(): void {
  vi.unstubAllGlobals();
}

/** A context for painting onto (the engine's main canvas stand-in). */
export function mainCtx(w = 1000, h = 700): CanvasRenderingContext2D {
  const c = new FakeOffscreen(w, h);
  counts.canvases--;
  return c.getContext() as unknown as CanvasRenderingContext2D;
}
