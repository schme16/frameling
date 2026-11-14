// The one option the Magnetic lasso has: how strongly it clings. Shared by the pixel and vector tool options.
import { Slider } from '../canvas/controls';
import { clingReach, setSelectSettings, useSelectSettings } from './settings';

const words = (v: number): string => (v <= 3 ? 'Light' : v <= 7 ? 'Medium' : 'Strong');

export function ClingSlider() {
  const cling = useSelectSettings((s) => s.cling);
  return (
    <Slider
      label="How strongly it clings"
      value={cling}
      min={1}
      max={10}
      format={(v) => `${words(v)} (${clingReach(v)} px)`}
      onChange={(v) => setSelectSettings({ cling: Math.round(v) })}
      hint="How far from an edge it still reaches for it. Light only catches an edge right under the pointer; Strong grabs one from further off, so a rough trace still lands on the outline (snap distance)."
    />
  );
}
