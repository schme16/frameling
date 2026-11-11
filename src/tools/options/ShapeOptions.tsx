import { useStore } from '../../core/store';
import { Slider, Tip } from '../../canvas/controls';
import { Wells } from '../../canvas/panels/Wells';
import { setToolSettings, useToolSettings } from '../settings';
import { DrawModeToggle } from './DrawModeToggle';

export function ShapeOptions() {
  const tool = useStore((s) => s.ui.tool);
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const stroke = useToolSettings((s) => s.shapeStroke);
  const radius = useToolSettings((s) => s.cornerRadius);
  const isLine = tool === 'line';
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Wells />
      {(isLine || strokeOn) && <Slider label={isLine ? 'Thickness' : 'Outline thickness'} value={stroke} min={1} max={60} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: v })} />}
      {tool === 'rect' && <Slider label="Rounded corners" value={radius} min={0} max={200} format={(v) => (v ? `${v}px` : 'Square')} onChange={(v) => setToolSettings({ cornerRadius: v })} />}
      <Tip>{isLine ? 'Hold Shift for straight and 45 degree lines. Hold Alt to draw from the middle.' : `Hold Shift to keep it ${tool === 'ellipse' ? 'a circle' : 'square'}. Hold Alt to draw from the middle.`}</Tip>
    </div>
  );
}
