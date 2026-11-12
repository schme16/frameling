import { encodePng } from '../../io/png';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async (_ctx, { plan, step, rgbaAt }) => {
  step(0, 'Drawing the picture');
  const bytes = encodePng(rgbaAt(0));
  return { kind: 'file', name: `${plan.name}.png`, bytes };
};
