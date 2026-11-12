import { strToU8 } from 'fflate';
import { dotLottieBytes } from '../dotlottie';
import { docToLottie, lottieJson } from '../lottie';
import { loadShapeExports } from '../shapeExport';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async (ctx, { plan, bg, step }) => {
  await loadShapeExports();
  const { doc, settings } = ctx;
  step(0, 'Writing the animation');
  const lottie = { range: plan.range, transparent: bg === 'none', pictures: settings.lottiePictures, softAndShadow: settings.lottieSoft };
  if (settings.lottieFile === 'dotlottie') return { kind: 'file', name: `${plan.name}.lottie`, bytes: dotLottieBytes(docToLottie(doc, lottie), { generator: ctx.appVersion ? `Frameling ${ctx.appVersion}` : 'Frameling', loop: settings.loop, version: settings.dotLottieVersion }) };
  return { kind: 'file', name: `${plan.name}.json`, bytes: strToU8(lottieJson(doc, lottie)) };
};
