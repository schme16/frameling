// Size maths for turning shapes into pixels: how many page pixels one art pixel covers, and what grid that makes.
// Pure, no browser, so the dialog and the tests share it.
import type { Doc } from '../core/format';

/** The biggest block an art pixel can be, in page pixels. */
export const MAX_PIXEL_SIZE = 64;

/** A pixel size as a whole number from 1 up to the biggest allowed (anything else is made to fit). */
export function clampPixelSize(n: unknown, fallback = 1): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(1, Math.min(MAX_PIXEL_SIZE, v));
}

/** The art grid a page makes at a pixel size (the same rounding as a pixel layer uses). */
export function gridOf(docW: number, docH: number, pixelSize: number): { width: number; height: number } {
  const ps = clampPixelSize(pixelSize);
  return { width: Math.max(1, Math.ceil(docW / ps)), height: Math.max(1, Math.ceil(docH / ps)) };
}

/** The pixel size that gives about `across` pixels along the page's width. */
export function sizeForAcross(docW: number, across: number): number {
  if (!(across >= 1)) return 1;
  return clampPixelSize(docW / across);
}

/** The ready-made sizes in the dialog: only ones that leave a grid worth having (at least 8 pixels each way). */
export function sizeChoices(docW: number, docH: number): number[] {
  const out: number[] = [];
  for (const ps of [1, 2, 4, 8, 16, 32]) {
    const g = gridOf(docW, docH, ps);
    if (ps === 1 || (g.width >= 8 && g.height >= 8)) out.push(ps);
  }
  return out;
}

/** The pixel size to start on: the one the drawing's pixel layers already use, else the page's own pixels. */
export function usualPixelSize(doc: Pick<Doc, 'layers'>): number {
  const count = new Map<number, number>();
  for (const l of doc.layers) if (l.kind === 'pixel') count.set(l.pixelSize, (count.get(l.pixelSize) ?? 0) + 1);
  let best = 1;
  let n = 0;
  for (const [ps, c] of count) if (c > n || (c === n && ps > best)) [best, n] = [ps, c];
  return clampPixelSize(best);
}

/** True when the drawing is pixel art: it has pixel layers and no plain vector ones (the same test the exports use for crisp edges). */
export function isPixelArtDoc(doc: Pick<Doc, 'layers'>): boolean {
  const real = doc.layers.filter((l) => l.kind !== 'camera');
  return real.length > 0 && real.every((l) => l.kind !== 'vector');
}

/** Hard or smooth edges when turning shapes into pixels, from what the drawing is: chunky pixels and pixel art docs want hard. */
export function edgesForPixels(doc: Pick<Doc, 'layers'>, pixelSize: number, pref: 'follow' | 'hard' | 'smooth'): 'hard' | 'smooth' {
  if (pref !== 'follow') return pref;
  const pixelly = doc.layers.some((l) => l.kind === 'pixel');
  return pixelSize >= 2 || pixelly ? 'hard' : 'smooth';
}

/** Bytes one grid takes as pixels (four a pixel), for the "this will use" warning. */
export function gridBytes(gw: number, gh: number, drawings: number): number {
  return gw * gh * 4 * drawings;
}

/** A size in plain words ("24 MB"). */
export function bytesWords(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
