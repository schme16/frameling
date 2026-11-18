// The colour the Colours panel is working on: the marker being edited on a gradient, else a picked shape's plain colour,
// else the box in front (the stroke when that box is "none", so the picker has somewhere to start).
import { useStore } from '../../core/store';
import { activeColor } from '../../tools/wells';
import { stopColor, useGradientWells, usePaintView } from '../../tools/gradient-wells';

export function usePaintColour(): string {
  const plain = useStore((s) => activeColor(s.ui) ?? s.ui.color);
  const well = useStore((s) => s.ui.activeWell);
  const view = usePaintView(well);
  // Re-read when the gradient changes, so the colour follows the marker being edited.
  useGradientWells((s) => s.stop[well]);
  return stopColor(well) ?? (view.from === 'colour' ? view.color : plain);
}
