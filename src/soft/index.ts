// Soft paint: Airbrush, Soft brush, Soft eraser, Highlighter and Smudge for pixel layers. Loaded after the pixel tools.
import { findLayer } from '../core/doc';
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { getToolSettings } from '../tools/settings';
import { inHarness } from '../pixel/harness';
import { getDab } from '../dab/settings';
import './help';
import './tools';
import { SOFT_EDGE_CHOICE } from './choices';
import { edgeAnswered, SOFT_SPECS } from './tools';

// The first time a soft tool is picked with Pixel perfect on (and the layer has no locked palette to decide for it),
// ask how the soft edge (or charcoal's grain) should be made. Never in the screenshot harness, and never mid-stroke.
let lastTool = '';
store().subscribe(() => {
  const { ui, doc } = store().get();
  if (ui.tool === lastTool) return;
  lastTool = ui.tool;
  if (!SOFT_SPECS.some((s) => s.kind === ui.tool) && ui.tool !== 'charcoal' && !(ui.tool === 'pixel-brush' && !getDab().aliased)) return;
  if (edgeAnswered() || inHarness() || !getToolSettings().pixelPerfect) return;
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer || layer.kind !== 'pixel' || layer.paletteLock) return;
  withChoice(SOFT_EDGE_CHOICE, () => undefined);
});
