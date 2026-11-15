// The streamer's layout, kept like every other setting (browser storage under `frameling.`, so the settings backup carries it).
import { createStore, readRaw, writeJson } from '../ui/mini';
import { defaultLayout, readLayout, sameLayout, type Layout } from './layout';

export const LAYOUT_KEY = 'frameling.streamboard.v1';

export const layoutStore = createStore<Layout>(readLayout(readRaw<unknown>(LAYOUT_KEY, null)));

/** Keeps a layout (checked first: whatever the board sends is read the way a saved file is). */
export function setLayout(raw: unknown): void {
  const next = readLayout(raw);
  if (sameLayout(next, layoutStore.get())) return;
  layoutStore.set(next);
  writeJson(LAYOUT_KEY, next);
}

/** Puts the buttons back as the board started. */
export function resetLayout(): void {
  setLayout(defaultLayout());
}
