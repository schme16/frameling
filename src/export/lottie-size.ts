/**
 * Where the bytes of a Lottie file go: embedded pictures, keyframes, and the rest of the shapes and layers.
 * Pure: Lottie JSON in, numbers out. Used by the size check (scripts/e2e/vector-check.cjs) and the export note.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface LottieSizes {
  /** The whole file as written. */
  total: number;
  /** Pictures baked from effects (layers named "Baked"). */
  baked: number;
  /** Pictures from pixel and tile layers. */
  pixels: number;
  /** Animated values (keyframe lists), shapes and everything else. */
  keyframes: number;
  shapes: number;
  other: number;
  /** How many pictures, and how many frames show a baked picture. */
  pictures: number;
}

const len = (v: unknown) => JSON.stringify(v).length;

/** Splits a Lottie file's size into pictures (baked or from pixel layers), keyframes, shape layers and the rest. */
export function lottieSizes(data: Json): LottieSizes {
  const total = len(data);
  const bakedIds = new Set<string>();
  const layerLists: Json[][] = [data.layers ?? [], ...(data.assets ?? []).map((a: Json) => a.layers ?? [])];
  for (const ls of layerLists) for (const l of ls) if (l.ty === 2 && l.nm === 'Baked') bakedIds.add(l.refId);
  let baked = 0;
  let pixels = 0;
  let pictures = 0;
  for (const a of data.assets ?? []) {
    if (typeof a.p !== 'string') continue;
    pictures++;
    if (bakedIds.has(a.id)) baked += a.p.length;
    else pixels += a.p.length;
  }
  let keyframes = 0;
  let shapeLayers = 0;
  let shapeKeys = 0;
  for (const ls of layerLists)
    for (const l of ls) {
      const k = keyBytes(l);
      keyframes += k;
      if (l.ty === 4) {
        shapeLayers += len(l);
        shapeKeys += k;
      }
    }
  const shapes = Math.max(0, shapeLayers - shapeKeys);
  const other = Math.max(0, total - baked - pixels - keyframes - shapes);
  return { total, baked, pixels, keyframes, shapes, other, pictures };
}

/** Bytes of the animated values (keyframe lists) inside `v`. */
function keyBytes(v: Json): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + keyBytes(x), 0);
  if (!v || typeof v !== 'object') return 0;
  if (v.a === 1 && Array.isArray(v.k)) return len(v);
  return Object.keys(v).reduce((n, k) => n + keyBytes(v[k]), 0);
}
