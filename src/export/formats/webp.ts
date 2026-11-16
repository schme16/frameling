// A WebP picture: one frame is a plain still; more is an animated WebP, with every frame saved by the browser and packed
// together (webp.ts). Frames that look the same as the one before are stored once and show for longer.
import { readPixels } from '../draw';
import { canvasBytes } from '../encode';
import { breathe } from '../runtime';
import { buildAnimatedWebp, webpDelays, webpLosslessOf, webpQualityOf, type WebpFrameIn } from '../webp';
import type { ExporterRun } from '../registry';

const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, crisp, canvas, step, frameAt }) => {
  const lossless = webpLosslessOf(settings, crisp);
  // WebP's own scale runs 0 to 1, and 1 means lossless in the browser.
  const quality = lossless ? 1 : webpQualityOf(settings) / 100;
  if (plan.count === 1) {
    step(0, 'Drawing the picture');
    return { kind: 'file', name: `${plan.name}.webp`, bytes: await canvasBytes(frameAt(0), 'image/webp', quality) };
  }
  const delays = webpDelays(plan.count, doc.fps);
  const frames: WebpFrameIn[] = [];
  let prev: Uint8ClampedArray | null = null;
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    const drawn = frameAt(i);
    const pixels = readPixels(drawn).pixels;
    if (prev && sameBytes(prev, pixels)) {
      frames[frames.length - 1].ms += delays[i];
      continue;
    }
    prev = new Uint8ClampedArray(pixels);
    frames.push({ file: await canvasBytes(canvas, 'image/webp', quality), ms: delays[i] });
  }
  step(plan.count, 'Packing the WebP');
  const bytes = buildAnimatedWebp(frames, { width: plan.width, height: plan.height, loop: plan.loop });
  return { kind: 'file', name: `${plan.name}.webp`, bytes };
};
