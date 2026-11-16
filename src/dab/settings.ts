// The pixel brush you are drawing with, kept in the browser's storage so it comes back the way you left it.
import { createStore, readRaw, writeJson } from '../ui/mini';
import { cleanDab, DEFAULT_DAB, type DabBrush } from './maths';

const KEY = 'frameling.pixelBrush.v1';

const store = createStore<DabBrush>(cleanDab(readRaw<unknown>(KEY, null)));

export const getDab = (): DabBrush => store.get();
export const subscribeDab = (fn: () => void): (() => void) => store.subscribe(fn);
export const useDab = <S,>(selector: (b: DabBrush) => S): S => store.use(selector);

/** Changes some of the brush. A picture tip with no picture goes back to round, and every number stays in range. */
export function setDab(patch: Partial<DabBrush>): void {
  store.set((b) => {
    const next = cleanDab({ ...b, ...patch }, b);
    writeJson(KEY, next);
    return next;
  });
}

/** Swaps in a whole brush (a saved one picked from the library). */
export function setWholeDab(brush: DabBrush): void {
  const next = cleanDab(brush);
  store.set(next);
  writeJson(KEY, next);
}

export function resetDab(): void {
  setWholeDab(DEFAULT_DAB);
}
