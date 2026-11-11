import { Slider, Tip } from '../../canvas/controls';
import { useStore } from '../../core/store';
import { BrushPreview } from './BrushOptions';
import { pencilBrush } from '../pencil';
import { setToolSettings, useToolSettings } from '../settings';

export function PencilOptions() {
  const size = useToolSettings((s) => s.pencilSize);
  const color = useStore((s) => s.ui.color);
  return (
    <div className="cv-options">
      <BrushPreview brush={{ ...pencilBrush(), size }} color={color} />
      <Slider label="Thickness" value={size} min={1} max={16} step={0.5} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ pencilSize: v })} />
      <Tip>The pencil keeps an even, thin line. For lines that swell with pressure, use the brush.</Tip>
    </div>
  );
}
