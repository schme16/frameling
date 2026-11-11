import { Slider, Tip } from '../../canvas/controls';
import { setToolSettings, useToolSettings } from '../settings';
import { useActiveLayerKind } from './BrushOptions';

export function EraserOptions() {
  const kind = useActiveLayerKind();
  const size = useToolSettings((s) => s.eraserSize);
  const pixels = useToolSettings((s) => s.eraserPixelSize);
  if (kind === 'pixel') {
    return (
      <div className="cv-options">
        <Slider label="Size" value={pixels} min={1} max={24} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setToolSettings({ eraserPixelSize: v })} />
        <Tip>Rubs out pixels as you drag.</Tip>
      </div>
    );
  }
  return (
    <div className="cv-options">
      <Slider label="Reach" value={size} min={2} max={120} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ eraserSize: v })} />
      <Tip>This erases whole lines. Anything the circle touches disappears, so one swipe removes a stroke or a shape. Undo brings it back.</Tip>
    </div>
  );
}
