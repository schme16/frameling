// Runs an export: draws each frame at an exact frame number (so the result never depends on how fast this computer
// is), feeds the encoder, and hands back the finished file or files. Needs a canvas, so it only runs in the app.
// The making of each format is in its own module (formats/), found through the registry and loaded when used.
import { backgroundFor, drawFrame, makeCanvas, readPixels } from './draw';
import { planExport } from './plan';
import { exporterOf, type RunEnv } from './registry';
import { isCancelled, type Progress, type RunContext, type RunResult } from './runtime';
import { formatInfo } from './types';

export { isCancelled, type Progress, type RunContext, type RunResult };

export async function runExport(ctx: RunContext): Promise<RunResult> {
  const { doc, settings, currentFrame, onProgress } = ctx;
  const def = exporterOf(settings.format);
  if (!def) throw new Error('That kind of export is turned off.');
  const plan = planExport(doc, settings, currentFrame);
  if (plan.problem) throw new Error(plan.problem);
  if (def.direct) throw new Error(`${def.info.title.replace(/ video$/, '')} is made by the desktop app.`);
  const info = formatInfo(settings.format);
  // A format that checks the computer first (video) says itself whether it can keep a see-through background.
  const bg = backgroundFor(doc, settings.transparent, def.prepare ? !!ctx.videoAlpha : info.alpha);
  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector' || !!l.rig);
  const target = { width: plan.width, height: plan.height, scale: settings.scale, background: bg, crisp };
  const canvas = makeCanvas(plan.width, plan.height);
  const frameAt = (i: number) => drawFrame(canvas, doc, plan.range.start + (plan.order?.[i] ?? i), target);
  const rgbaAt = (i: number) => readPixels(frameAt(i));
  const step = (done: number, label: string) => onProgress({ done, total: plan.count, label });
  const env: RunEnv = { plan, bg, crisp, canvas, frameAt, rgbaAt, step };
  return (await def.load()).run(ctx, env);
}
