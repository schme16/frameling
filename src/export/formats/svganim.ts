import { strToU8 } from 'fflate';
import { animatedSvg } from '../svg-anim';
import { loadShapeExports } from '../shapeExport';
import { withToothPictures } from '../svgTooth';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ doc, settings }, { plan, bg, step }) => {
  await loadShapeExports();
  step(0, 'Writing the animation');
  const svg = withToothPictures(settings.svgTooth, settings.scale, () => animatedSvg(doc, { range: plan.range, order: plan.order, scale: settings.scale, transparent: bg === 'none', loop: plan.loop }));
  return { kind: 'file', name: `${plan.name}.svg`, bytes: strToU8(svg) };
};
