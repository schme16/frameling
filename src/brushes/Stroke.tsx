// A sample stroke drawn with a brush's own settings, so its size, pressure and pointy ends show. It fills the box it
// sits in, and is only drawn once it has scrolled near the screen, so a long list of brushes costs nothing until seen.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrushSettings } from '../core/format';
import { drawShape } from '../core/render';
import { buildStroke } from '../tools/vectorStroke';

/** The points of the sample: one slow wave with a swell in the middle, as wide as the box. */
export function samplePoints(w: number, h: number): { x: number; y: number; p: number }[] {
  const pad = Math.min(14, w * 0.06);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pts.push({ x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2, p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
  }
  return pts;
}

/** The size the sample is drawn at: the brush's own, scaled down to fit the row and capped so a fat brush stays inside. */
export const sampleSize = (size: number, h: number): number => Math.max(1.2, Math.min(size * 0.6, h * 0.66));

export function Stroke({ brush, h }: { brush: BrushSettings; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  const [w, setW] = useState(0);
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
  }, [seen]);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !seen) return;
    setW(Math.round(c.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setW(Math.round(c.clientWidth)));
    watch.observe(c);
    return () => watch.disconnect();
  }, [seen]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    drawShape(g, buildStroke(samplePoints(w, h), { ...brush, size: sampleSize(brush.size, h), taperStart: brush.taperStart * 0.5, taperEnd: brush.taperEnd * 0.5 }, getComputedStyle(c).color));
  }, [brush, w, h]);
  return <canvas ref={ref} className="pk-stroke" style={{ height: h }} aria-hidden="true" />;
}
