import { psdFile } from '../layered-run';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, settings }, { plan, bg, crisp, step }) => {
  step(0, 'Drawing every layer');
  const bytes = psdFile(doc, plan.range.start, settings.scale, bg, crisp);
  return { kind: 'file', name: `${plan.name}.psd`, bytes };
};
