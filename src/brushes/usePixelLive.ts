// The pixel brush in use, for the pickers that share a name with the vector ones (Tip, Stick): null on the vector Brush (and on the plain Brush over a vector layer), the
// Pixel brush's dab and Chalk and charcoal's stick on a pixel brush tool. Re-reads when either changes.
import { findLayer } from '../core/doc';
import { useStore } from '../core/store';
import { brushToolOf, isPixelBrushTool } from '../dab/live';
import { useDab } from '../dab/settings';
import { useDry } from '../dry/settings';
import type { PixelLive } from './pixelTipList';

export function usePixelLive(): PixelLive | null {
  const tool = useStore((s) => brushToolOf(s.ui.tool, (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind));
  const dab = useDab((d) => d);
  const medium = useDry((d) => d.medium);
  return isPixelBrushTool(tool) ? { dab, medium } : null;
}
