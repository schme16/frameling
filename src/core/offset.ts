/**
 * A key's offset: its drawing moved a little without being redrawn (a breathe, a head bob). Pure functions, no DOM.
 *
 * Every renderer and export already draws a "posed group" (a drawing with a matrix, which is how a part rides a bone),
 * so an offset is shown by wrapping the drawing in one. The wrapper is cached per drawing and offset, so the same
 * offset on the same drawing is the same object: the canvas's bitmap cache and the effect cache key on that.
 */
import type { Cel, CelOffset, Doc, Drawing, Layer, VectorDrawing } from './format';
import { OFFSET_FORMAT_VERSION, FORMAT_VERSION } from './format';

/** How far a key can be moved, in document pixels. Far past any stage, so a typo can't fling a part into space. */
export const OFFSET_LIMIT = 16384;

export const NO_OFFSET: CelOffset = { x: 0, y: 0 };

/** True when the offset moves anything. */
export const isMoved = (o: CelOffset | undefined): o is CelOffset => !!o && (o.x !== 0 || o.y !== 0);

const round = (n: number) => Math.round(n * 1000) / 1000;

/** An offset as it is kept: numbers within the limit, rounded to a thousandth. Undefined when it does not move anything. */
export function cleanOffset(v: unknown): CelOffset | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { x, y } = v as { x?: unknown; y?: unknown };
  const fix = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? round(Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, n))) : 0);
  const o = { x: fix(x), y: fix(y) };
  return o.x || o.y ? o : undefined;
}

/** Two offsets added together (either can be missing). Undefined when the sum does not move anything. */
export function addOffsets(a: CelOffset | undefined, b: CelOffset | undefined): CelOffset | undefined {
  return cleanOffset({ x: (a?.x ?? 0) + (b?.x ?? 0), y: (a?.y ?? 0) + (b?.y ?? 0) });
}

/** The offset part way from `a` to `b` (0 is `a`, 1 is `b`), missing meaning none. */
export function mixOffsets(a: CelOffset | undefined, b: CelOffset | undefined, t: number): CelOffset | undefined {
  return cleanOffset({ x: (a?.x ?? 0) + ((b?.x ?? 0) - (a?.x ?? 0)) * t, y: (a?.y ?? 0) + ((b?.y ?? 0) - (a?.y ?? 0)) * t });
}

/** The offset to keep on a pixel layer: whole art pixels, so the art stays on its grid. */
export function snapOffset(o: CelOffset | undefined, pixelSize: number): CelOffset | undefined {
  if (!o || pixelSize <= 1) return cleanOffset(o);
  return cleanOffset({ x: Math.round(o.x / pixelSize) * pixelSize, y: Math.round(o.y / pixelSize) * pixelSize });
}

/** A layer whose keys can carry an offset: drawn art (not a camera, a tilemap or a skeleton). */
export function canOffset(layer: Layer): boolean {
  return (layer.kind === 'vector' && !layer.rig) || layer.kind === 'pixel';
}

// ---------------------------------------------------------------- showing it

const wraps = new WeakMap<Drawing, Map<string, VectorDrawing>>();

/**
 * `d` moved by `off`, as a drawing holding one posed group. The same drawing, offset and pixel size give back the same
 * object. A drawing with no real offset comes back as it is.
 */
export function offsetDrawing(d: Drawing, off: CelOffset | undefined, pixelSize: number): Drawing {
  if (!isMoved(off) || d.kind === 'tilemap' || d.kind === 'camera') return d;
  let byKey = wraps.get(d);
  if (!byKey) wraps.set(d, (byKey = new Map()));
  const key = `${off.x},${off.y},${pixelSize}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const id = `${d.id}~off${key}`;
  const group = {
    id,
    type: 'instance' as const,
    symbolId: '',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
    opacity: 1,
    play: 'single' as const,
    firstFrame: 0,
    posed: { matrix: [1, 0, 0, 1, off.x, off.y] as [number, number, number, number, number, number], layers: [{ drawing: d, opacity: 1, pixelSize }] },
  };
  const out: VectorDrawing = { id, kind: 'vector', shapes: [group] };
  byKey.set(key, out);
  // A held drawing nudged all over a long animation can make many; keep the newest.
  if (byKey.size > 400) byKey.delete(byKey.keys().next().value!);
  return out;
}

/** The matrix for an offset, as a canvas transform, or undefined when it does not move anything. */
export function offsetMatrix(off: CelOffset | undefined): [number, number, number, number, number, number] | undefined {
  return isMoved(off) ? [1, 0, 0, 1, off.x, off.y] : undefined;
}

// ---------------------------------------------------------------- saving

/** Every cel in the pieces of a document that carry keys (layers, symbols, artboards and what variations change), skipping drawings. */
function anyOffset(v: unknown, depth: number): boolean {
  if (typeof v !== 'object' || v === null || depth > 24 || ArrayBuffer.isView(v)) return false;
  if (Array.isArray(v)) return v.some((x) => anyOffset(x, depth + 1));
  const o = v as Record<string, unknown>;
  if ('offset' in o && isMoved(cleanOffset(o.offset))) return true;
  for (const k of Object.keys(o)) if (k !== 'drawings' && k !== 'pixels' && anyOffset(o[k], depth + 1)) return true;
  return false;
}

/** True when any key in the document (stage, symbols, artboards, variations) has an offset. */
export function usesCelOffsets(doc: Doc): boolean {
  return anyOffset(doc.layers, 0) || anyOffset(doc.symbols, 0) || anyOffset(doc.artboards, 0);
}

/** The version a document is saved as: the usual one, or the next when it uses a key's offset. */
export function versionFor(doc: Doc): number {
  return usesCelOffsets(doc) ? OFFSET_FORMAT_VERSION : FORMAT_VERSION;
}

/** The offset a cel has, if any. */
export const offsetOf = (cel: Cel | undefined): CelOffset | undefined => (cel && isMoved(cel.offset) ? cel.offset : undefined);
