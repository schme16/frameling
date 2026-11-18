// A picture tip drawn big enough to see, for the Pixel brush's options.
import { useEffect, useRef } from 'react';
import { stampCells, type PixelStamp } from './stamps';
import './brushes.css';

/** The brush drawn big enough to see, in its own colours (or in the colour picked when it paints in that). */
export function StampPicture({ stamp, color }: { stamp: PixelStamp; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = Math.max(2, Math.floor(48 / Math.max(stamp.w, stamp.h)));
    c.width = stamp.w * k;
    c.height = stamp.h * k;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const cx = Math.floor((stamp.w - 1) / 2);
    const cy = Math.floor((stamp.h - 1) / 2);
    for (const cell of stampCells(stamp)) {
      g.fillStyle = stamp.keep ? `rgb(${cell.rgba[0]} ${cell.rgba[1]} ${cell.rgba[2]} / ${cell.rgba[3] / 255})` : color;
      g.globalAlpha = stamp.soft ? cell.rgba[3] / 255 : 1;
      g.fillRect((cell.x + cx) * k, (cell.y + cy) * k, k, k);
    }
  }, [stamp, color]);
  return <canvas ref={ref} aria-label={`Your brush, ${stamp.w} by ${stamp.h} pixels`} role="img" />;
}
