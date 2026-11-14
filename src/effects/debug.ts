// With ?debug, the renderer for scripts/e2e/effects.cjs, which checks compositing pixels in a real browser canvas.
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import { nativeFilterWorks, setFilterOverride } from './filterSupport';
import { effectsGpuStats, setEffectsGpu } from './effectsGL';
import { blitPixelsGpu, gpuStats, setPixelBlendGpu } from './pixelBlendGL';
import { blendPixels, settleCanvasBytes } from './pixelBlend';
import { ctx2, makeCanvas } from './apply';
import type { BlendMode } from '../core/format';
import { setAddStyle } from './EffectsPanel';
import { toggleFolderCollapsed } from './rows';

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingEffects: unknown }).__framelingEffects = {
    /** RGBA bytes of a frame rendered at 1:1 (or at `scale`). */
    pixels(doc: Parameters<typeof renderFrameToCanvas>[0], frame = 0, scale = 1) {
      const c = renderFrameToCanvas(doc, frame, scale);
      return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
    },
    /** Loads the document into the editor and reads its canvas at document pixels [x, y] (RGBA), after it paints. */
    async editorPixels(doc: Parameters<typeof renderFrameToCanvas>[0], frame: number, points: [number, number][], activeLayerId?: string) {
      store().load(doc);
      store().setUi({ frame, ...(activeLayerId ? { activeLayerId } : {}) });
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 300));
      const canvas = document.querySelector('canvas.cv-layer:not(.cv-overlay):not(.ab-underlay)') as HTMLCanvasElement;
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
    /**
     * One pixel blend on exact straight RGBA bytes, both ways, each read back from a canvas as the compositor would:
     * the CPU path (settle, blend, put) and the GPU path (the shader). `gpu` is false when the GPU path declined.
     */
    blendBytes(w: number, h: number, back: number[], top: number[], mode: BlendMode, alpha: number) {
      const make = (bytes: number[]) => {
        const c = makeCanvas(w, h);
        const g = ctx2(c);
        g.putImageData(new ImageData(new Uint8ClampedArray(bytes), w, h), 0, 0);
        return { c, g };
      };
      const cpuB = make(back);
      const cpuT = make(top);
      const bd = cpuB.g.getImageData(0, 0, w, h);
      const td = cpuT.g.getImageData(0, 0, w, h);
      settleCanvasBytes(bd.data);
      settleCanvasBytes(td.data);
      blendPixels(bd.data, td.data, mode, alpha);
      cpuB.g.putImageData(bd, 0, 0);
      const cpu = Array.from(cpuB.g.getImageData(0, 0, w, h).data);
      const gpuB = make(back);
      const gpuT = make(top);
      const used = blitPixelsGpu(gpuB.g, gpuT.c, mode, alpha);
      const gpu = Array.from(gpuB.g.getImageData(0, 0, w, h).data);
      return { cpu, gpu, used };
    },
    /** Turns the GPU path of Linear dodge, Subtract and Divide on or off (the CPU path is the fallback), and counts GPU blits. */
    setPixelBlendGpu,
    gpuBlits: () => gpuStats.blits,
    /** Turns the GPU path of grain, wave, colour fringe, dark corners and motion blur on or off (JS is the fallback), and counts its runs. */
    setEffectsGpu,
    effectsGpuRuns: () => effectsGpuStats.runs,
    /** Milliseconds per frame rendering `doc` at `scale` `n` times (the last pixel is read so the GPU has finished). */
    renderMs(doc: Parameters<typeof renderFrameToCanvas>[0], frame: number, n: number, scale = 1, fresh = false) {
      // `fresh` renders a new copy of the document each time: finished effect pictures are cached by drawing, so reusing one would time the cache.
      const copies = fresh ? Array.from({ length: n + 1 }, () => JSON.parse(JSON.stringify(doc))) : [];
      let c = renderFrameToCanvas(fresh ? copies[n] : doc, frame, scale);
      c.getContext('2d')!.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        c = renderFrameToCanvas(fresh ? copies[i] : doc, frame, scale);
        c.getContext('2d')!.getImageData(0, 0, 1, 1);
      }
      return (performance.now() - t0) / n;
    },
    /** Forces the canvas filter path ('native'), the JS fallback ('fallback'), or detection (null); and what detection says. */
    setFilterOverride,
    nativeFilterWorks: () => nativeFilterWorks(document.createElement('canvas').getContext('2d')!),
    setAddStyle,
    toggleFolderCollapsed,
  };
}
