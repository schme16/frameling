// The pen section of a drawing tool's options: what pressure and tilt change, and the stabilizer. The stabilizer is
// for everyone (it steadies a mouse too); the pressure and tilt switches show once a pen has been used.
import { Choice, Slider, Toggle } from '../canvas/controls';
import { penStore, setToolPen, type PenTool } from './settings';
import './tablet.css';

export interface PenOptionsProps {
  tool: PenTool;
  /** Which things pressure can change for this tool on this layer. */
  size?: boolean;
  opacity?: boolean;
  flow?: boolean;
}

export function PenOptions({ tool, size, opacity, flow }: PenOptionsProps) {
  const t = penStore.use((s) => s.tools[tool]);
  const seen = penStore.use((s) => s.seen);
  return (
    <div className="tb-options">
      <Slider
        label="Stabilizer"
        value={t.stabilizer}
        min={0}
        max={100}
        format={(v) => (v ? `${v}%` : 'Off')}
        onChange={(v) => setToolPen(tool, { stabilizer: v })}
        hint="Steadies a shaky hand. More makes smoother lines that lag a little behind your pen."
      />
      {t.stabilizer > 0 && (
        <Choice
          label="Stabilizer style"
          value={t.stabMode}
          options={[
            { value: 'string', label: 'Pull string', title: 'The brush trails behind your pen on a rope. Small wobbles never reach the line.' },
            { value: 'average', label: 'Average', title: 'The brush sits at the average of your last few moves.' },
          ]}
          onChange={(v) => setToolPen(tool, { stabMode: v })}
        />
      )}
      {seen && size && <Toggle label="Pressure changes size" checked={t.size} onChange={(v) => setToolPen(tool, { size: v })} hint={t.size ? 'Press harder for a bigger mark. Set how pressure feels in Preferences, Pen and tablet.' : undefined} />}
      {seen && opacity && <Toggle label="Pressure changes strength" checked={t.opacity} onChange={(v) => setToolPen(tool, { opacity: v })} hint={t.opacity ? 'A light touch makes a fainter line. It applies to the whole line.' : undefined} />}
      {seen && flow && <Toggle label="Pressure changes how much" checked={t.flow} onChange={(v) => setToolPen(tool, { flow: v })} hint={t.flow ? 'Press harder to spray more.' : undefined} />}
      {seen && <Toggle label="Leaning changes size" checked={t.tilt} onChange={(v) => setToolPen(tool, { tilt: v })} hint={t.tilt ? 'Lean the pen over for a bigger mark, like shading with the side of a pencil.' : undefined} />}
    </div>
  );
}
