// The pixel brush: dabs along a line with a tip, spacing and scatter, and the pixel side of the brush library. Loaded after soft paint and charcoal.
import { store } from '../core/store';
import './help';
import './tools';
import './commands';
import './debug';
import { askEdgeOnce } from './edge';
import { PIXEL_BRUSH_TOOL } from './live';
import { getDab, subscribeDab } from './settings';

// Smooth edges wanted (from the options, a command or a saved brush) while on the pixel brush: with Pixel perfect on, ask
// once whether they should be dithered or see-through. Also when the tool is picked with a smooth brush already set.
let wasSmooth = !getDab().aliased;
subscribeDab(() => {
  const smooth = !getDab().aliased;
  const turnedOn = smooth && !wasSmooth;
  wasSmooth = smooth;
  if (turnedOn && store().get().ui.tool === PIXEL_BRUSH_TOOL) askEdgeOnce();
});
