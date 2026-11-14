import { Slider, Toggle } from '../../canvas/controls';
import { setChoice, useChoices } from '../../core/choices';
import { HOLD_MS_MAX, HOLD_MS_MIN, TIDY_CHOICE } from '../quickshape';
import { setToolSettings, useToolSettings } from '../settings';

/** Hold to tidy: a switch, and how long to hold when it is on. Shared by the brush and the pencil. */
export function HoldToTidyOptions() {
  const on = (useChoices()[TIDY_CHOICE] ?? 'off') === 'on';
  const ms = useToolSettings((s) => s.quickHoldMs);
  return (
    <>
      <Toggle label="Hold to tidy" checked={on} onChange={(v) => setChoice(TIDY_CHOICE, v ? 'on' : 'off')} hint="Keep the pen still at the end of a line and it becomes a clean line, circle, box or triangle. Undo gives your line back." />
      {on && <Slider label="Hold time" value={ms} min={HOLD_MS_MIN} max={HOLD_MS_MAX} step={50} format={(v) => `${(v / 1000).toFixed(2).replace(/0$/, '')} s`} onChange={(v) => setToolSettings({ quickHoldMs: v })} hint="How long the pen stays still before it tidies. Longer is safer for slow, careful drawing." />}
    </>
  );
}
