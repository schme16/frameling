// The colour a brush sample is drawn in so it stands against the panel it sits on. It is read from the panel's own
// colour, never from the theme's name, so it holds in every built-in theme and in one you made yourself. A sample is
// drawn on a canvas, which can't use CSS colours, so the colour is worked out here and handed to the renderer.
import { useSyncExternalStore } from 'react';
import { subscribeTheme } from '../canvas/theme';
import { contrast, ensureContrast, mix, toHex, type RGB } from '../ui/themes/color';

/** A CSS colour as computed by the browser (`rgb()`, `rgba()` or `color(srgb ...)`) as [r, g, b, alpha], or null. */
export function parseCssColour(s: string): [number, number, number, number] | null {
  const t = s.trim().toLowerCase();
  if (t === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = /^(rgba?|color)\(\s*(?:srgb\s+)?([^)]*)\)$/.exec(t);
  if (!m) return null;
  const unit = m[1] === 'color';
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const nums = parts.map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const chan = (i: number) => (unit ? nums[i] * 255 : parts[i].endsWith('%') ? nums[i] * 255 : nums[i]);
  const a = nums.length > 3 ? nums[3] : 1;
  return [chan(0), chan(1), chan(2), Math.min(1, Math.max(0, a))];
}

/** Layers of colour from the front one to the back one, laid over `base`: what you would see. Hex out. */
export function flatten(layers: readonly [number, number, number, number][], base: string): string {
  let out = base;
  for (let i = layers.length - 1; i >= 0; i--) {
    const [r, g, b, a] = layers[i];
    out = mix(toHex([r, g, b] as RGB), out, a);
  }
  return out;
}

/**
 * The ink for a sample: `want` (say the colour you are drawing with) when it stands out against `panel`. When it does
 * not (near black on a near black panel), the panel's own text colour `text` instead, nudged until it reads clearly.
 * Without a `text`, `want` itself is nudged. `min` is the contrast ratio asked of `want`; the fallback gets 4.5.
 */
export function inkAgainst(panel: string, want: string, min = 4.5, text?: string): string {
  if (!text || contrast(want, panel) >= min) return ensureContrast(want, panel, min);
  return ensureContrast(text, panel, 4.5);
}

/** The colour behind an element: its own background, or the nearest ones behind it, flattened. `fallback` when there is none. */
export function surfaceOf(el: Element, fallback: string): string {
  const layers: [number, number, number, number][] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parseCssColour(getComputedStyle(n).backgroundColor);
    if (!c || c[3] <= 0) continue;
    layers.push(c);
    if (c[3] >= 0.99) break;
  }
  return flatten(layers, fallback);
}

/**
 * The ink for a sample sitting on this element, from the colour of the panel behind it. With `want` (the colour you are
 * drawing with) it keeps that while it shows up, and otherwise uses the element's own text colour, which the theme set
 * for this very surface. Without `want` the text colour is the start, nudged if it needs it.
 */
export function inkFor(el: Element, want?: string, min = 4.5, fallbackPanel = '#211e2c'): string {
  const panel = surfaceOf(el, fallbackPanel);
  const c = parseCssColour(getComputedStyle(el).color);
  const text = c ? toHex([c[0], c[1], c[2]]) : undefined;
  return inkAgainst(panel, want ?? text ?? '#000000', min, want ? text : undefined);
}

let themeTick = 0;
let counting = false;
function onTheme(fn: () => void): () => void {
  // The counter goes first, so by the time a component hears about it the number has already moved.
  if (!counting) {
    counting = true;
    subscribeTheme(() => themeTick++);
  }
  return subscribeTheme(fn);
}

/** A number that goes up each time the theme changes. Put it in the deps of whatever draws a sample, so the sample is drawn again in the ink that now suits the panel. */
export const useThemeTick = (): number => useSyncExternalStore(onTheme, () => themeTick);
