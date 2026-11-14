// How new pixel text looks (font, size, bold, spacing, line up). Kept in the browser's storage like the other tool options.
import { useSyncExternalStore } from 'react';
import { cleanStyle, DEFAULT_PIXEL_TEXT, type PixelTextStyle } from './font';

const KEY = 'frameling.pixelText';
let state: PixelTextStyle = { ...DEFAULT_PIXEL_TEXT };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') state = cleanStyle(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
} catch {
  // start from the defaults
}

export function getPixelText(): PixelTextStyle {
  return state;
}

export function setPixelText(patch: Partial<PixelTextStyle>): void {
  state = cleanStyle({ ...state, ...patch });
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function onPixelText(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function usePixelText(): PixelTextStyle {
  return useSyncExternalStore(onPixelText, getPixelText);
}
