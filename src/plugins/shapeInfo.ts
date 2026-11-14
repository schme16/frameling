// What a plugin shape part says about itself, apart from the code that draws and refits plugin shapes (shapes.ts, with the
// draw list reader). The Properties section only needs to recognise a plugin shape, so it reads this and the drawing
// code stays out of the first download.
import type { Shape } from '../core/format';

/** The `ext` key a plugin's shapes keep their data under. */
export const extKeyOf = (pluginId: string): string => `plugin.${pluginId}`;

export interface PluginShapeInfo {
  kind: string;
  /** Names the whole shape (all the parts that make it up). */
  inst: string;
  part: number;
  /** What the plugin draws it from (on the first part only). */
  props?: Record<string, unknown>;
  /** Where the plugin's own coordinates sit on the stage when it was last drawn (first part only). See `refit`. */
  m?: number[];
  /** A few anchor points as they were then (first part only), to find out how the person has moved, scaled or turned the parts since. */
  ref?: Ref;
  /** True when this is a stand-in (the plugin drew nothing). */
  placeholder?: true;
}

/** Up to three anchor points of the drawn parts, `[index among all anchors, x, y]`, and how many anchors there were. */
export interface Ref {
  n: number;
  pts: [number, number, number][];
}

/** What a plugin shape part says about itself, if it is one of this plugin's. */
export function infoOf(s: Shape, pluginId: string): PluginShapeInfo | null {
  const v = s.ext?.[extKeyOf(pluginId)];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return typeof o.kind === 'string' && typeof o.inst === 'string' ? (o as unknown as PluginShapeInfo) : null;
}
