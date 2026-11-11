declare module 'gifenc' {
  export type Palette = number[][];

  export interface FrameOptions {
    palette?: Palette | null;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** Milliseconds (stored in hundredths of a second). */
    delay?: number;
    /** -1 once, 0 forever, n times. */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface Encoder {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): Palette;

  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array;
  export function nearestColorIndex(palette: Palette, pixel: number[]): number;
}
