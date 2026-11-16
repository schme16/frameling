// Asking about the smooth edge. With Pixel perfect on, a smooth (anti-aliased) edge is either dithered or see-through, and
// that is the one question soft paint already asks once and remembers (src/soft/choices.ts). The pixel brush asks it too,
// the first time smooth edges are wanted with Pixel perfect on, so choosing Smooth never quietly turns out sharp.
import { withChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import { store } from '../core/store';
import { inHarness } from '../pixel/harness';
import { SOFT_EDGE_CHOICE } from '../soft/choices';
import { edgeAnswered } from '../soft/tools';
import { getToolSettings } from '../tools/settings';

/** True when asking would mean something: Pixel perfect is on, the layer does not keep to a palette (that decides for itself), and no answer is remembered. */
export function shouldAskEdge(): boolean {
  if (edgeAnswered() || inHarness() || !getToolSettings().pixelPerfect) return false;
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return !layer || layer.kind !== 'pixel' || !layer.paletteLock;
}

/** Asks which way the smooth edge should go, once. Does nothing when it is already answered or does not matter. */
export function askEdgeOnce(): void {
  if (shouldAskEdge()) withChoice(SOFT_EDGE_CHOICE, () => undefined);
}
