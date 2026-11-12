// PDF and Illustrator share one writer.
import { zipSync, type Zippable } from 'fflate';
import { frameNumber, planFrames } from '../plan';
import { pdfFile } from '../layered-run';
import { breathe } from '../runtime';
import { aiFramesOf } from '../types';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, bg, crisp, step }) => {
  const frames = planFrames(plan);
  const ai = settings.format === 'ai';
  const how = aiFramesOf(settings);
  step(0, 'Writing the pages');
  await breathe(signal, 0);
  if (ai && how === 'files') {
    // Each frame as an Illustrator file of its own, together in a zip.
    const z: Zippable = {};
    for (let i = 0; i < frames.length; i++) {
      await breathe(signal, i);
      step(i, `Writing frame ${i + 1} of ${plan.count}`);
      z[`${plan.name}-${frameNumber(i, plan.count)}.ai`] = [pdfFile(doc, [frames[i]], settings.scale, bg === 'none', crisp, () => undefined, true, true), { level: 0 }];
    }
    step(plan.count, 'Packing the zip');
    return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(z) };
  }
  // Illustrator's own data (real layers and artboards) goes in unless each frame is to stay a PDF page.
  const native = ai && how !== 'pages';
  const bytes = pdfFile(doc, frames, settings.scale, bg === 'none', crisp, (i) => step(i + 1, `Writing page ${i + 1} of ${plan.count}`), ai, native);
  return { kind: 'file', name: `${plan.name}.${settings.format}`, bytes };
};
