// Helpers for reading shapes back from a file, checked: missing or wrong values take sensible defaults. The kinds that
// are not the drawing basics (text, particles) read themselves, in their own folders, through core/shapeKinds.ts.
import type { Transform2D } from '../core/format';

export const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const clamp = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, num(v, d)));
export const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

/** A shape's `origin` from a file: kept when it is a non-empty string, otherwise left out. */
export const readOrigin = (s: any): { origin?: string } => (typeof s?.origin === 'string' && s.origin ? { origin: s.origin.slice(0, 200) } : {});

export function readTransform(t: unknown): Transform2D {
  const o = isObj(t) ? t : {};
  return { x: num(o.x, 0), y: num(o.y, 0), scaleX: num(o.scaleX, 1), scaleY: num(o.scaleY, 1), rotation: num(o.rotation, 0), skew: num(o.skew, 0) };
}
