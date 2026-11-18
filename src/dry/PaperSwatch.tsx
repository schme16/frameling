// A picture of a paper's grain: a light stroke of ink caught on the paper's tooth, so Smooth reads as a gentle even
// speckle and Rough as big bumps. Drawn from the paper's own tile (paper.ts), once for each size, ink and sharpness.
import { useEffect, useRef } from 'react';
import { inkFor, useThemeTick } from '../brushes/ink';
import { paperTile, TILE, type PaperKind } from './paper';

const cache = new Map<string, HTMLCanvasElement>();

/** How much ink sits on a point of the paper at this height (0 low, 1 high): only the upper bumps catch it. */
export const catchOf = (height: number): number => Math.max(0, Math.min(1, (height - 0.5) / 0.4));

function pictureOf(kind: PaperKind, w: number, h: number, dpr: number, ink: string): HTMLCanvasElement | null {
  const key = `${kind}|${w}|${h}|${dpr}|${ink}`;
  const have = cache.get(key);
  if (have) return have;
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  if (!g) return null;
  const tile = paperTile(kind);
  // No picture where there is no canvas to draw on (a test's stand-in).
  if (typeof g.createImageData !== 'function') return null;
  const img = g.createImageData(c.width, c.height);
  if (!img?.data) return null;
  const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(ink);
  const [r, gr, b] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(catchOf(tile[(y % TILE) * TILE + (x % TILE)] / 255) * 235);
    }
  }
  g.putImageData(img, 0, 0);
  if (cache.size > 40) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
  return c;
}

export function PaperSwatch({ kind, w, h }: { kind: PaperKind; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeTick();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    const pic = pictureOf(kind, w, h, dpr, inkFor(c));
    if (g && pic && typeof g.drawImage === 'function') g.drawImage(pic, 0, 0);
  }, [kind, w, h, theme]);
  return <canvas ref={ref} className="pp-swatch" style={{ width: w, height: h }} aria-hidden="true" />;
}
