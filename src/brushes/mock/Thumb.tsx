// A small sample stroke drawn with a brush, in the text colour of where it sits, so a list or grid shows what each brush does.
import { useEffect, useRef } from 'react';
import type { BrushSettings } from '../../core/format';
import { drawShape } from '../../core/render';
import { buildStroke } from '../../tools/vectorStroke';

export function Thumb({ brush, w = 88, h = 26 }: { brush: BrushSettings; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      pts.push({ x: 6 + t * (w - 12), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.22, p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
    }
    const size = Math.min(brush.size * 0.5, h * 0.55);
    drawShape(g, buildStroke(pts, { ...brush, size: Math.max(1.2, size), taperStart: brush.taperStart * 0.3, taperEnd: brush.taperEnd * 0.3 }, getComputedStyle(c).color));
  }, [brush, w, h]);
  return <canvas ref={ref} className="mk-thumb" style={{ width: w, height: h }} aria-hidden="true" />;
}
