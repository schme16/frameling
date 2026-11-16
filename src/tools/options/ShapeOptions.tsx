import { useStore } from '../../core/store';
import { typedSize } from '../brushRange';
import { useBrushRange } from './useBrushRange';
import { Choice, Slider, Tip } from '../../canvas/controls';
import type { PlaneChoice } from '../../canvas/perspectivePlane';
import { useViewSettings } from '../../canvas/viewSettings';
import { Wells } from '../../canvas/panels/Wells';
import { setToolSettings, useToolSettings } from '../settings';
import { DrawModeToggle } from './DrawModeToggle';
import { MirrorOptions } from './MirrorOptions';
import { LineStyleOptions } from './LineStyleOptions';

/** "On a plane": where a rectangle or ellipse lies when the perspective guides are showing. Shared with pixel shapes. */
export function PlaneOption({ show = true }: { show?: boolean }) {
  const plane = useToolSettings((s) => s.perspectivePlane);
  const points = useStore((s) => s.doc.perspective?.points.length ?? 0);
  const on = useViewSettings((v) => v.perspective && v.snap) && points > 0 && show;
  if (!on) return null;
  return (
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
  );
}

export function ShapeOptions() {
  const tool = useStore((s) => s.ui.tool);
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const stroke = useToolSettings((s) => s.shapeStroke);
  const radius = useToolSettings((s) => s.cornerRadius);
  const isLine = tool === 'line';
  const range = useBrushRange(false);
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Wells />
      {(isLine || strokeOn) && <Slider label={isLine ? 'Thickness' : 'Outline thickness'} value={stroke} min={range.min} max={range.max} typeMax={range.typedMax} curve format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: typedSize(v) })} />}
      {(isLine || strokeOn) && <LineStyleOptions arrows={isLine} />}
      {tool === 'rect' && <Slider label="Rounded corners" value={radius} min={0} max={200} format={(v) => (v ? `${v}px` : 'Square')} onChange={(v) => setToolSettings({ cornerRadius: v })} />}
      <PlaneOption show={!isLine} />
      <MirrorOptions />
      <Tip>{isLine ? 'Hold Shift for straight and 45 degree lines. Hold Alt to draw from the middle.' : `Hold Shift to keep it ${tool === 'ellipse' ? 'a circle' : 'square'}. Hold Alt to draw from the middle.`}</Tip>
    </div>
  );
}
