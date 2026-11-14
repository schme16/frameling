// ProRes: frames are drawn here exactly like every other export and streamed to FFmpeg on the desktop side, which
// writes the .mov. Checked once per dialog: FFmpeg present and able to make ProRes.
import type { Doc } from '../core/format';
import { desktop } from '../io/desktop';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from './draw';
import { planExport } from './plan';
import type { Progress } from './run';
import type { ExportSettings } from './types';

export interface ProresSupport {
  ok: boolean;
  reason?: string;
}

let cached: Promise<ProresSupport> | null = null;

/** Can this computer make ProRes? (Asks the desktop side, which looks for FFmpeg.) */
export function proresSupport(fresh = false): Promise<ProresSupport> {
  const api = desktop();
  if (!api?.video) return Promise.resolve({ ok: false, reason: 'ProRes is made with FFmpeg, so it needs the Frameling desktop app.' });
  if (!cached || fresh) cached = api.video.probe().catch(() => ({ ok: false, reason: 'Frameling could not check for FFmpeg.' }));
  return cached;
}

const cancelled = () => new DOMException('Export cancelled', 'AbortError');

/** Draws every frame and hands it to FFmpeg, writing `target`. Throws an Error with plain words on a problem. */
export async function runProres(doc: Doc, settings: ExportSettings, currentFrame: number, target: string, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<void> {
  const api = desktop();
  if (!api?.video) throw new Error('ProRes needs the Frameling desktop app.');
  const plan = planExport(doc, settings, currentFrame);
  const bg = backgroundFor(doc, settings.transparent, true);
  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector');
  const started = await api.video.start(target, { width: plan.width, height: plan.height, fps: doc.fps, alpha: bg === 'none' });
  if ('error' in started) throw new Error(started.error);
  const canvas = makeCanvas(plan.width, plan.height);
  try {
    for (let i = 0; i < plan.count; i++) {
      if (signal.aborted) throw cancelled();
      onProgress({ done: i, total: plan.count, label: `Drawing frame ${i + 1} of ${plan.count}` });
      drawFrame(canvas, doc, plan.range.start + (plan.order?.[i] ?? i), { width: plan.width, height: plan.height, scale: settings.scale, background: bg, crisp });
      const img = readPixels(canvas);
      const r = await api.video.frame(started.id, new Uint8Array(img.pixels.buffer, img.pixels.byteOffset, img.pixels.byteLength));
      if ('error' in r) throw new Error(r.error);
    }
    onProgress({ done: plan.count, total: plan.count, label: 'Finishing the video' });
    const done = await api.video.finish(started.id);
    if ('error' in done) throw new Error(done.error);
  } catch (e) {
    await api.video.cancel(started.id).catch(() => undefined);
    throw e;
  }
}
