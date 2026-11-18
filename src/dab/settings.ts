// The pixel brush you are drawing with, kept in the browser's storage so it comes back the way you left it.
import { createStore, readRaw, writeJson } from '../ui/mini';
import { TYPED_MAX } from '../tools/brushRange';
import { cleanDab, DEFAULT_DAB, SIZE_RANGE, type DabBrush } from './maths';
import { isPencilDab } from './pencil';

const KEY = 'frameling.pixelBrush.v1';

/**
 * `cleanDab`, except that a plain hard brush may be as wide as the plain Brush always could be (a pixel layer can be bigger
 * than a brush is allowed to be). Only the pencil draws that wide; any other brush is held to the usual limit.
 */
function clean(raw: unknown, base?: DabBrush): DabBrush {
  const b = cleanDab(raw, base);
  const asked = raw && typeof raw === 'object' ? (raw as { size?: unknown }).size : undefined;
  if (typeof asked !== 'number' || !Number.isFinite(asked) || asked <= SIZE_RANGE.max) return b;
  const wide = { ...b, size: Math.min(TYPED_MAX, Math.round(asked)) };
  return isPencilDab(wide) ? wide : b;
}

const saved = readRaw<unknown>(KEY, null);
/** True when a pixel brush had been saved on this machine before this launch (see pencil.ts, movePencil). */
export const hadSavedDab = (): boolean => saved !== null;

const store = createStore<DabBrush>(clean(saved));

export const getDab = (): DabBrush => store.get();
export const subscribeDab = (fn: () => void): (() => void) => store.subscribe(fn);
export const useDab = <S,>(selector: (b: DabBrush) => S): S => store.use(selector);

/** Changes some of the brush. A picture tip with no picture goes back to round, and every number stays in range. */
export function setDab(patch: Partial<DabBrush>): void {
  store.set((b) => {
    const next = clean({ ...b, ...patch }, b);
    writeJson(KEY, next);
    return next;
  });
}

/** Swaps in a whole brush (a saved one picked from the library). */
export function setWholeDab(brush: DabBrush): void {
  const next = clean(brush);
  store.set(next);
  writeJson(KEY, next);
}

export function resetDab(): void {
  setWholeDab(DEFAULT_DAB);
}
