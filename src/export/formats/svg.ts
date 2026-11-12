import { strToU8 } from 'fflate';
import { frameToSvg } from '../svg';
import { loadShapeExports } from '../shapeExport';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, settings }, { plan, bg, step }) => {
  await loadShapeExports();
  step(0, 'Writing the drawing');
  const svg = frameToSvg(doc, plan.range.start, { scale: settings.scale, transparent: bg === 'none' });
  return { kind: 'file', name: `${plan.name}.svg`, bytes: strToU8(svg) };
};
