// The pictures on a review page: every frame drawn once, frames that look the same sharing one picture, and sized so
// the page stays a file you can send in a message. Page side (it needs a canvas); the choosing of sizes is pure.
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';

/** The most picture data a review page should hold, before it is written as text. A bigger drawing is made smaller. */
export const REVIEW_BUDGET = 3_500_000;
/** The longest side a review picture is drawn at, in pixels. Bigger than the screen needs; smaller than the drawing can be. */
export const REVIEW_LONG_SIDE = 960;

export interface Rung {
  /** The longest side, in pixels. */
  long: number;
  type: 'image/png' | 'image/webp';
  quality?: number;
}

/** True when every layer is a pixel layer (so the pictures keep hard edges instead of being smoothed). */
export const isPixelDrawing = (doc: Pick<Doc, 'layers'>): boolean => doc.layers.length > 0 && doc.layers.every((l) => l.kind === 'pixel');

/**
 * The sizes to try, best first: sharp lossless pictures; then lossy ones when that is too heavy; then smaller and
 * smaller. A pixel drawing is only ever drawn at its own size, never smoothed, never shrunk past it.
 */
export function ladder(doc: Pick<Doc, 'width' | 'height' | 'layers'>): Rung[] {
  const side = Math.max(1, doc.width, doc.height);
  if (isPixelDrawing(doc)) return [{ long: side, type: 'image/png' }];
  const best = Math.min(REVIEW_LONG_SIDE, side * 2);
  return [
    { long: best, type: 'image/png' },
    { long: best, type: 'image/webp', quality: 0.86 },
    { long: Math.round(best * 0.75), type: 'image/webp', quality: 0.8 },
    { long: Math.round(best * 0.55), type: 'image/webp', quality: 0.75 },
    { long: Math.round(best * 0.4), type: 'image/webp', quality: 0.7 },
  ];
}

export interface ReviewPictures {
  /** Each picture as a data address. */
  images: string[];
  /** For each frame, which picture it shows. */
  frames: number[];
  /** Picture bytes before they were written as text. */
  bytes: number;
  pixelated: boolean;
  /** Even the smallest size was over the budget. */
  tooBig: boolean;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Draws every frame of the drawing for a review page. `onProgress` gets the frame number as it goes. */
export async function renderReviewPictures(doc: Doc, onProgress?: (done: number, of: number) => void): Promise<ReviewPictures> {
  const steps = ladder(doc);
  let last: ReviewPictures | null = null;
  for (let r = 0; r < steps.length; r++) {
    const rung = steps[r];
    const scale = rung.long / Math.max(1, doc.width, doc.height);
    const w = Math.max(1, Math.round(doc.width * scale));
    const h = Math.max(1, Math.round(doc.height * scale));
    const images: string[] = [];
    const seen = new Map<string, number>();
    const frames: number[] = [];
    let bytes = 0;
    let over = false;
    for (let f = 0; f < doc.length; f++) {
      const c = renderFrameToCanvas(doc, f, scale);
      const out = new OffscreenCanvas(w, h);
      const g = out.getContext('2d')!;
      if (doc.background) {
        g.fillStyle = doc.background;
        g.fillRect(0, 0, w, h);
      }
      g.drawImage(c, 0, 0, w, h);
      const blob = await out.convertToBlob(rung.quality ? { type: rung.type, quality: rung.quality } : { type: rung.type });
      const url = `data:${blob.type || rung.type};base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`;
      let at = seen.get(url);
      if (at === undefined) {
        at = images.length;
        images.push(url);
        seen.set(url, at);
        bytes += blob.size;
        if (bytes > REVIEW_BUDGET && r < steps.length - 1) {
          over = true;
          break;
        }
      }
      frames.push(at);
      onProgress?.(f + 1, doc.length);
      if (f % 4 === 3) await tick();
    }
    if (over) continue;
    last = { images, frames, bytes, pixelated: isPixelDrawing(doc), tooBig: bytes > REVIEW_BUDGET };
    break;
  }
  return last!;
}
