import { useStore } from '../../core/store';
import { Choice, Slider, Tip } from '../../canvas/controls';
import type { PlaneChoice } from '../../canvas/perspectivePlane';
import { useViewSettings } from '../../canvas/viewSettings';
import { Wells } from '../../canvas/panels/Wells';
import { setToolSettings, useToolSettings } from '../settings';
import { DrawModeToggle } from './DrawModeToggle';

export function ShapeOptions() {
  const tool = useStore((s) => s.ui.tool);
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const stroke = useToolSettings((s) => s.shapeStroke);
  const radius = useToolSettings((s) => s.cornerRadius);
  const isLine = tool === 'line';
  const plane = useToolSettings((s) => s.perspectivePlane);
  const points = useStore((s) => s.doc.perspective?.points.length ?? 0);
  const onPlane = useViewSettings((v) => v.perspective && v.snap) && points > 0 && !isLine;
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Wells />
      {(isLine || strokeOn) && <Slider label={isLine ? 'Thickness' : 'Outline thickness'} value={stroke} min={1} max={60} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: v })} />}
      {tool === 'rect' && <Slider label="Rounded corners" value={radius} min={0} max={200} format={(v) => (v ? `${v}px` : 'Square')} onChange={(v) => setToolSettings({ cornerRadius: v })} />}
      {onPlane && (
        <Choice<PlaneChoice>
          label="On a plane"
          value={plane}
          options={[
            { value: 'auto', label: 'Auto', title: 'Follows the perspective guides and picks the plane that fits where you drag' },
            { value: 'flat', label: 'Flat', title: 'A plain shape, ignoring the perspective guides' },
            { value: 'floor', label: 'Floor', title: points > 1 ? 'Lying flat, edges running to both vanishing points' : 'Lying flat, one pair of edges running to the vanishing point' },
            ...(points > 1
              ? [
                  { value: 'left' as const, label: 'Left wall', title: 'Upright, edges running to the left vanishing point' },
                  { value: 'right' as const, label: 'Right wall', title: 'Upright, edges running to the right vanishing point' },
                ]
              : [{ value: 'wall' as const, label: 'Wall', title: 'Upright, edges running to the vanishing point' }]),
          ]}
          onChange={(v) => setToolSettings({ perspectivePlane: v })}
        />
      )}
      <Tip>{isLine ? 'Hold Shift for straight and 45 degree lines. Hold Alt to draw from the middle.' : `Hold Shift to keep it ${tool === 'ellipse' ? 'a circle' : 'square'}. Hold Alt to draw from the middle.`}</Tip>
    </div>
  );
}
