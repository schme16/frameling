import { buildPalette, GifWriter, sampleFrames } from '../gif';
import { breathe } from '../runtime';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, bg, step, rgbaAt }) => {
  const transparent = bg === 'none';
  // First look at a spread of frames to choose one set of colours for the whole GIF.
  const samples = sampleFrames(plan.count);
  const sampled: Uint8ClampedArray[] = [];
  for (let k = 0; k < samples.length; k++) {
    await breathe(signal, k);
    step(0, 'Choosing colours');
    sampled.push(new Uint8ClampedArray(rgbaAt(samples[k]).pixels));
  }
  const palette = buildPalette(sampled, transparent);
  sampled.length = 0;
  const w = new GifWriter({ width: plan.width, height: plan.height, fps: doc.fps, loop: plan.loop, transparent, dither: settings.dither }, palette, plan.count);
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    w.addFrame(rgbaAt(i).pixels);
  }
  step(plan.count, 'Finishing up');
  return { kind: 'file', name: `${plan.name}.gif`, bytes: w.finish() };
};
