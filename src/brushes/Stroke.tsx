// The sample pictures in the brush picker, drawn with a brush's own settings (see thumbs.ts): a long stroke that fills
// the box it sits in, and a short dab of the real tip. Each is only drawn once it has scrolled near the screen, so a
// long list of brushes costs nothing until seen.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { BrushSettings } from '../core/format';
import { inkFor, useThemeTick } from './ink';
import { useDry } from '../dry/settings';
import type { PaperKind } from '../dry/paper';
import { paperOf, thumbFor, type ThumbKind } from './thumbs';

export { dabPoints, dabSize, sampleSize, samplePoints } from './thumbs';

/** True once the element has come near the screen (always true where the browser cannot tell). */
export function useSeen(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || seen) return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          watch.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    watch.observe(c);
    return () => watch.disconnect();
  }, [ref, seen]);
  return seen;
}

/** Copies the picture for this brush into the canvas. */
function paint(c: HTMLCanvasElement, brush: BrushSettings, kind: ThumbKind, w: number, h: number, paper?: PaperKind): void {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  if (!g) return;
  const pic = thumbFor(brush, kind, w, h, dpr, inkFor(c), paper);
  if (pic) g.drawImage(pic, 0, 0);
}

/** A sample stroke drawn with a brush's own settings, so its size, pressure, pointy ends and tip show. */
/** `paper` draws a line that catches on paper on that paper instead of the sheet's. */
export function Stroke({ brush, h, on, paper }: { brush: BrushSettings; h: number; on?: boolean; paper?: PaperKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(ref);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !seen) return;
    setW(Math.round(c.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setW(Math.round(c.clientWidth)));
    watch.observe(c);
    return () => watch.disconnect();
  }, [seen]);
  const theme = useThemeTick();
  const sheet = useDry((s) => s.paper);
  const onPaper = paperOf(brush, paper) ? (paper ?? sheet) : '';
  useEffect(() => {
    const c = ref.current;
    if (c && w) paint(c, brush, 'stroke', w, h, paper);
  }, [brush, w, h, theme, on, onPaper]);
  return <canvas ref={ref} className="pk-stroke" style={{ height: h }} aria-hidden="true" />;
}

/** The brush's real tip as a short dab in a small fixed box. Chalk shows its grain, a stamp its shapes. */
export function TipThumb({ brush, w, h, on }: { brush: BrushSettings; w: number; h: number; on?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(ref);
  const theme = useThemeTick();
  const sheet = useDry((s) => s.paper);
  const onPaper = paperOf(brush) ? sheet : '';
  useEffect(() => {
    const c = ref.current;
    if (c && seen) paint(c, brush, 'dab', w, h);
  }, [brush, w, h, seen, theme, on, onPaper]);
  return <canvas ref={ref} className="pk-thumb" width={w} height={h} style={{ width: w, height: h }} aria-hidden="true" />;
}
