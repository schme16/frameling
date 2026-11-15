import type { vi as Vi } from 'vitest';

/** Just enough of a canvas for the session's own live preview, so its dirty rectangle is cleared on every flush as in the app. */
export function stubCanvas(vi: typeof Vi): void {
  class FakeContext {
    putImageData(): void {}
    drawImage(): void {}
  }
  class FakeCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext(): FakeContext {
      return new FakeContext();
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
}
