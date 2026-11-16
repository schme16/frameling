import { findLayer } from '../../core/doc';
import { useStore } from '../../core/store';
import { brushRange, type BrushRange } from '../brushRange';

/** The slider range for the canvas open now: art pixels when the layer being drawn on is a pixel layer. */
export function useBrushRange(pixel: boolean): BrushRange {
  const w = useStore((s) => s.doc.width);
  const h = useStore((s) => s.doc.height);
  const ps = useStore((s) => {
    if (!pixel) return 1;
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l.pixelSize : 1;
  });
  return brushRange(w, h, ps);
}
