import { Tip, Toggle } from '../../canvas/controls';
import { setToolSettings, useToolSettings } from '../settings';

export function EyedropperOptions() {
  const only = useToolSettings((s) => s.pickActiveLayerOnly);
  return (
    <div className="cv-options">
      <Toggle label="Only the layer I'm on" checked={only} onChange={(v) => setToolSettings({ pickActiveLayerOnly: v })} hint="Off picks whatever you see on the page. Hold Alt to switch it for one click." />
      <Tip>Click to pick up a colour. Drag to keep looking.</Tip>
    </div>
  );
}
