import { zipSync, type Zippable } from 'fflate';
import { encodePng } from '../../io/png';
import { frameNumber } from '../plan';
import { breathe } from '../runtime';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ signal }, { plan, step, rgbaAt }) => {
  const files: Zippable = {};
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    files[`${plan.name}-${frameNumber(i, plan.count)}.png`] = [encodePng(rgbaAt(i)), { level: 0 }];
  }
  step(plan.count, 'Packing the zip');
  return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(files) };
};
