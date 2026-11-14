import { Choice, Slider, Tip } from '../../canvas/controls';
import { PenOptions } from '../../tablet/PenOptions';
import { useStore } from '../../core/store';
import { BrushPreview } from './BrushOptions';
import { pencilBrush } from '../pencil';
import { DrawModeToggle } from './DrawModeToggle';
import { setToolSettings, useToolSettings } from '../settings';
import { MirrorOptions } from './MirrorOptions';
import { HoldToTidyOptions } from './HoldToTidyOptions';

export function PencilOptions() {
  const size = useToolSettings((s) => s.pencilSize);
  const color = useStore((s) => s.ui.color);
  const clean = useToolSettings((s) => s.pencilClean);
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Choice<'hand' | 'clean'>
        label="Line"
        value={clean ? 'clean' : 'hand'}
        options={[
          { value: 'hand', label: 'Hand-drawn', title: 'Follows every wobble of your hand, like a real pencil' },
          { value: 'clean', label: 'Clean line', title: 'Smoothed into a few even curves you can reshape with Edit points (A), a centre-line stroke' },
        ]}
        onChange={(v) => setToolSettings({ pencilClean: v === 'clean' })}
      />
      {!clean && <BrushPreview brush={{ ...pencilBrush(), size }} color={color} />}
      <Slider label="Thickness" value={size} min={1} max={clean ? 40 : 16} step={0.5} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ pencilSize: v })} />
      <Tip>{clean ? 'Clean lines come out smooth and even. Bend them later with Edit points (A).' : 'The pencil keeps an even, thin line. For lines that swell with pressure, use the brush.'}</Tip>
      {!clean && <HoldToTidyOptions />}
      <MirrorOptions />
      <PenOptions tool="pencil" size opacity />
    </div>
  );
}
