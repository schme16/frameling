/**
 * Keeping what the file reader does not understand. Two things are never dropped on load:
 *
 * - `ext` bags (see `Ext` in core/format.ts): data a feature or plugin keeps on the document, a layer, a drawing or a
 *   shape. It is copied as plain JSON after a size and depth check and written back unchanged.
 * - Shapes of an unknown type (`VectorDrawing.kept`): held as read, put back where they were on saving.
 */
import type { Ext, KeptShape, VectorDrawing } from '../core/format';

/** Deepest nesting kept inside one feature's data. */
export const EXT_MAX_DEPTH = 24;
/** Most values (objects, lists, strings, numbers) kept for one feature, a guard against a file made to hang the reader. */
export const EXT_MAX_NODES = 1_000_000;
/** Largest one feature's data may be once written as JSON. */
export const EXT_MAX_BYTES = 8 * 1024 * 1024;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A deep copy of plain JSON, or `undefined` when it nests too deeply or holds too much. Skips keys that could poison an object. */
function copyJson(v: unknown, depth: number, budget: { left: number }): unknown {
  if (--budget.left < 0 || depth > EXT_MAX_DEPTH) return undefined;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const item of v) {
      const c = copyJson(item, depth + 1, budget);
      if (c === undefined && item !== undefined) return undefined;
      out.push(c === undefined ? null : c);
    }
    return out;
  }
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(v)) {
      if (BAD_KEYS.has(k)) continue;
      const c = copyJson(item, depth + 1, budget);
      if (c === undefined) {
        if (item === undefined) continue;
        return undefined;
      }
      out[k] = c;
    }
    return out;
  }
  return undefined;
}

/** `{ ext }` for spreading into what the reader builds, or nothing. Each feature's entry is kept or left out as a whole. */
export function readExt(raw: unknown, warnings?: string[]): { ext?: Ext } {
  if (!isPlain(raw)) return {};
  const ext: Ext = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!KEY.test(id)) continue;
    const copy = copyJson(value, 0, { left: EXT_MAX_NODES });
    if (copy === undefined || (copy !== null && typeof copy === 'object' && JSON.stringify(copy).length > EXT_MAX_BYTES)) {
      warnings?.push('Some data kept for a feature was too big or too deep to keep and was left out.');
      continue;
    }
    ext[id] = copy;
  }
  return Object.keys(ext).length ? { ext } : {};
}

/** Gives `shape` a clean `ext` (or none): the stroke, fill and path readers pass every field through, so this is where theirs is checked. */
export function withExt<T extends object>(shape: T, raw: { ext?: unknown }, warnings?: string[]): T {
  const out = { ...shape } as T & { ext?: Ext };
  delete out.ext;
  Object.assign(out, readExt(raw.ext, warnings));
  return out;
}

/** What to do with a shape that is not one of the known types: keep it whole, or nothing when it is not even an object with a type. */
export function keepUnknownShape(raw: unknown, at: number, warnings?: string[]): KeptShape | null {
  if (!isPlain(raw) || typeof raw.type !== 'string' || !raw.type) return null;
  const copy = copyJson(raw, 0, { left: EXT_MAX_NODES });
  if (!isPlain(copy)) {
    warnings?.push('A shape of a kind Frameling does not know was too big to keep and was left out.');
    return null;
  }
  return { at, shape: copy };
}

/** The shapes to write: the known ones with the kept unknown ones put back where they were. */
export function shapesForSave(d: Pick<VectorDrawing, 'shapes' | 'kept'>): unknown[] {
  if (!d.kept?.length) return d.shapes;
  const out: unknown[] = [...d.shapes];
  const order = d.kept.map((k, i) => ({ k, i })).sort((a, b) => a.k.at - b.k.at || a.i - b.i);
  let added = 0;
  for (const { k } of order) {
    out.splice(Math.min(out.length, Math.max(0, k.at) + added), 0, k.shape);
    added++;
  }
  return out;
}
