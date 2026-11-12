// With ?debug, the renderer for scripts/e2e/effects.cjs, which checks compositing pixels in a real browser canvas.
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import { gpuStats, setPixelBlendGpu } from './pixelBlendGL';
import { setAddStyle } from './EffectsPanel';
import { toggleFolderCollapsed } from './rows';

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingEffects: unknown }).__framelingEffects = {
    /** RGBA bytes of a frame rendered at 1:1. */
    pixels(doc: Parameters<typeof renderFrameToCanvas>[0], frame = 0) {
      const c = renderFrameToCanvas(doc, frame, 1);
      return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
    },
    /** Loads the document into the editor and reads its canvas at document pixels [x, y] (RGBA), after it paints. */
    async editorPixels(doc: Parameters<typeof renderFrameToCanvas>[0], frame: number, points: [number, number][]) {
      store().load(doc);
      store().setUi({ frame });
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 300));
      const canvas = document.querySelector('canvas.cv-layer') as HTMLCanvasElement;
      const stage = (document.querySelector('.cv-stage') as HTMLElement).getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const k = canvas.width / box.width;
      const g = canvas.getContext('2d')!;
      return points.map(([x, y]) => {
        const cx = Math.floor((stage.left - box.left + ((x + 0.5) * stage.width) / doc.width) * k);
        const cy = Math.floor((stage.top - box.top + ((y + 0.5) * stage.height) / doc.height) * k);
        return Array.from(g.getImageData(cx, cy, 1, 1).data);
      });
    },
    /** Turns the GPU path of Linear dodge, Subtract and Divide on or off (the CPU path is the fallback), and counts GPU blits. */
    setPixelBlendGpu,
    gpuBlits: () => gpuStats.blits,
    /** Milliseconds per frame rendering `doc` at `scale` `n` times (the last pixel is read so the GPU has finished). */
    renderMs(doc: Parameters<typeof renderFrameToCanvas>[0], frame: number, n: number, scale = 1) {
      let c = renderFrameToCanvas(doc, frame, scale);
      c.getContext('2d')!.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        c = renderFrameToCanvas(doc, frame, scale);
        c.getContext('2d')!.getImageData(0, 0, 1, 1);
      }
      return (performance.now() - t0) / n;
    },
    setAddStyle,
    toggleFolderCollapsed,
  };
}
