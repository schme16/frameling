import { ApngWriter } from '../apng';
import { breathe } from '../runtime';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, signal }, { plan, step, rgbaAt }) => {
  const w = new ApngWriter({ width: plan.width, height: plan.height, fps: doc.fps, loop: plan.loop }, plan.count);
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    w.addFrame(rgbaAt(i));
  }
  step(plan.count, 'Finishing up');
  return { kind: 'file', name: `${plan.name}.png`, bytes: w.finish() };
};
