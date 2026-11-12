/**
 * Does this browser's canvas really apply `ctx.filter`? Chromium and Electron do; Safari has no such property (or
 * ignores it), so blur, shadow, glow and colour adjust would silently do nothing there. We test by drawing a dot with
 * `blur(2px)` and reading it back, once, and remember the answer. Tests can force either answer.
 */

export type FilterOverride = 'native' | 'fallback' | null;

let override: FilterOverride = null;
let cached: boolean | null = null;

/** Test hook: force the native path or the JS fallback (null goes back to detecting). */
export function setFilterOverride(mode: FilterOverride): void {
  override = mode;
}

/** Forget the detected answer (for tests). */
export function resetFilterDetection(): void {
  cached = null;
}

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function probe(): boolean {
  const make = (): { c: OffscreenCanvas | HTMLCanvasElement; g: AnyCtx } => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(9, 9) : Object.assign(document.createElement('canvas'), { width: 9, height: 9 });
    return { c, g: c.getContext('2d') as AnyCtx };
  };
  const src = make();
  src.g.fillStyle = '#000';
  src.g.fillRect(4, 4, 1, 1);
  const dst = make();
  if (!('filter' in dst.g)) return false;
  dst.g.filter = 'blur(2px)';
  dst.g.drawImage(src.c as CanvasImageSource, 0, 0);
  dst.g.filter = 'none';
  const d = dst.g.getImageData(0, 0, 9, 9).data;
  const alpha = (x: number, y: number) => d[(y * 9 + x) * 4 + 3];
  // Blurred: the dot has spread (centre no longer solid, neighbours have some ink).
  return alpha(4, 4) < 200 && alpha(6, 4) > 0;
}

/** True when the canvas filter works here (cached). `g` is only used for the quick old check when probing isn't possible. */
export function nativeFilterWorks(g: AnyCtx): boolean {
  if (override) return override === 'native';
  if (cached !== null) return cached;
  try {
    return (cached = probe());
  } catch {
    // No canvas to read back from (a test stand-in): trust the property, and don't remember it.
    return 'filter' in g;
  }
}

/** True when the JS fallback can run on this canvas (it needs pixel read and write). */
export function canFallback(g: AnyCtx): boolean {
  return typeof g.getImageData === 'function' && typeof g.createImageData === 'function' && typeof g.putImageData === 'function';
}
