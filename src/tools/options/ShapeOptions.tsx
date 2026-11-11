import { useStore } from '../../core/store';
import { ActionButton, Choice, Slider, Tip } from '../../canvas/controls';
import { setToolSettings, useToolSettings } from '../settings';

export function ShapeOptions() {
  const tool = useStore((s) => s.ui.tool);
  const color = useStore((s) => s.ui.color);
  const mode = useToolSettings((s) => s.shapeMode);
  const stroke = useToolSettings((s) => s.shapeStroke);
  const fill = useToolSettings((s) => s.shapeFill);
  const radius = useToolSettings((s) => s.cornerRadius);
  const isLine = tool === 'line';
  return (
    <div className="cv-options">
      {!isLine && (
        <Choice
          label="Draw"
          value={mode}
          options={[
            { value: 'outline', label: 'Outline', title: 'Just the edge' },
            { value: 'fill', label: 'Filled', title: 'Solid, no edge' },
            { value: 'both', label: 'Both', title: 'Solid with an edge' },
          ]}
          onChange={(v) => setToolSettings({ shapeMode: v })}
        />
      )}
      {(isLine || mode !== 'fill') && <Slider label={isLine ? 'Thickness' : 'Outline thickness'} value={stroke} min={1} max={60} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: v })} />}
      {!isLine && mode === 'both' && (
        <div className="cv-field">
          <div className="cv-field-head">
            <span className="cv-field-label">Fill colour</span>
          </div>
          <div className="cv-row">
            <input className="cv-color-input" type="color" value={(fill ?? color).slice(0, 7)} aria-label="Fill colour" onChange={(e) => setToolSettings({ shapeFill: e.target.value })} />
            <ActionButton onClick={() => setToolSettings({ shapeFill: null })} disabled={fill === null} title="Fill with the same colour as the outline">
              Same as outline
            </ActionButton>
          </div>
        </div>
      )}
      {tool === 'rect' && <Slider label="Rounded corners" value={radius} min={0} max={200} format={(v) => (v ? `${v}px` : 'Square')} onChange={(v) => setToolSettings({ cornerRadius: v })} />}
      <Tip>{isLine ? 'Hold Shift for straight and 45 degree lines. Hold Alt to draw from the middle.' : `Hold Shift to keep it ${tool === 'ellipse' ? 'a circle' : 'square'}. Hold Alt to draw from the middle.`}</Tip>
    </div>
  );
}
