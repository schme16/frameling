// With ?debug, the renderer for scripts/e2e/effects.cjs, which checks compositing pixels in a real browser canvas.
import { renderFrameToCanvas } from '../core/render';
import { setAddStyle } from './EffectsPanel';
import { toggleFolderCollapsed } from './rows';

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingEffects: unknown }).__framelingEffects = {
    /** RGBA bytes of a frame rendered at 1:1. */
    pixels(doc: Parameters<typeof renderFrameToCanvas>[0], frame = 0) {
      const c = renderFrameToCanvas(doc, frame, 1);
      return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
    },
    setAddStyle,
    toggleFolderCollapsed,
  };
}
