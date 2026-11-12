// A tile drawn big and crisp, for the Tileset panel and the tile tools' options.
import { useEffect, useRef } from 'react';
import type { PixelDrawing } from '../core/format';
import { pixelCanvas } from '../core/render';
import { drawTileAt } from './map';

export function TileThumb({ drawing, size, flags = 0, label }: { drawing: PixelDrawing | undefined; size: number; flags?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = drawing?.width ?? 1;
  const h = drawing?.height ?? 1;
  // Whole-number scale so every pixel stays square.
  const scale = Math.max(1, Math.floor(size / Math.max(w, h)));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    if (!drawing) return;
    g.imageSmoothingEnabled = false;
    drawTileAt(g, pixelCanvas(drawing), w === h ? flags : flags & 0xc0000000, 0, 0, w * scale, h * scale);
  }, [drawing, drawing?.pixels, flags, scale, w, h]);
  return <canvas ref={ref} className="tz-thumb" width={w * scale} height={h * scale} aria-label={label} role={label ? 'img' : undefined} />;
}
