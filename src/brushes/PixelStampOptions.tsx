// The pixel brush made from a selection, in the brush options on a pixel layer: what it looks like, which colours it
// paints with, and a way back to the square or round brush.
import { useEffect, useRef } from 'react';
import { ActionButton, Toggle } from '../canvas/controls';
import { useToolSettings } from '../tools/settings';
import { hasColours, readPixelStamp, stampCells, type PixelStamp } from './stamps';
import { clearPixelStamp, makeBrushFromSelection, setPixelStampKeep } from './tips';
import './brushes.css';

/** The brush drawn big enough to see, in its own colours (or in the colour picked when it paints in that). */
function StampPicture({ stamp, color }: { stamp: PixelStamp; color: string }) {
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
      g.fillRect((cell.x + cx) * k, (cell.y + cy) * k, k, k);
    }
  }, [stamp, color]);
  return <canvas ref={ref} aria-label={`Your brush, ${stamp.w} by ${stamp.h} pixels`} role="img" />;
}

export function PixelStampOptions() {
  const stamp = readPixelStamp(useToolSettings((s) => s.pixelStamp));
  return (
    <div className="tp-row" data-testid="pixel-stamp">
      {stamp && (
        <>
          <div className="tp-pixel">
            <StampPicture stamp={stamp} color="currentColor" />
            <span>
              Your brush, {stamp.w} by {stamp.h}
            </span>
          </div>
          {hasColours(stamp) && <Toggle label="Its own colours" checked={stamp.keep} onChange={setPixelStampKeep} hint="On: it stamps the picture as it was. Off: only its shape counts, painted in the colour you picked." />}
          <ActionButton onClick={clearPixelStamp} title="Go back to the square or round brush">
            Back to the usual brush
          </ActionButton>
        </>
      )}
      <ActionButton onClick={() => void makeBrushFromSelection()} title="Turn the pixels you have selected into a brush (up to 32 by 32)">
        Brush from selection
      </ActionButton>
    </div>
  );
}
