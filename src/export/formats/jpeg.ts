import { canvasBytes, onWhite } from '../encode';
import { jpegQualityOf } from '../webp';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async ({ settings }, { plan, step, frameAt }) => {
  step(0, 'Drawing the picture');
  const flat = onWhite(frameAt(0));
  step(0, 'Making the JPEG');
  const bytes = await canvasBytes(flat, 'image/jpeg', jpegQualityOf(settings) / 100);
  return { kind: 'file', name: `${plan.name}.jpg`, bytes };
};
