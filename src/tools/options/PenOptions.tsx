import { useStore } from '../../core/store';
import { Slider, Tip } from '../../canvas/controls';
import { Wells } from '../../canvas/panels/Wells';
import { setToolSettings, useToolSettings } from '../settings';
import { PixelOutlineOptions, useLayerKind } from '../../pixel/ToolOptions';
import { DrawModeToggle } from './DrawModeToggle';
import { MirrorOptions } from './MirrorOptions';
import { LineStyleOptions } from './LineStyleOptions';
import { typedSize } from '../brushRange';
import { useBrushRange } from './useBrushRange';

export function PenOptions() {
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const stroke = useToolSettings((s) => s.shapeStroke);
  const pixel = useLayerKind() === 'pixel';
  const range = useBrushRange(false);
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Wells />
      {pixel ? <PixelOutlineOptions /> : strokeOn && <Slider label="Line thickness" value={stroke} min={range.min} max={range.max} typeMax={range.typedMax} curve format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: typedSize(v) })} />}
      {!pixel && <LineStyleOptions />}
      {!pixel && <MirrorOptions />}
      <Tip>Click for a corner, drag for a curve. Click the first point to close the shape, or press Enter to finish a line. Backspace takes back a point.</Tip>
    </div>
  );
}
