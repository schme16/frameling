// A sticker or emoji pack: every frame at the size each messaging app asks for, a folder per app, in one zip.
import { zipSync, type Zippable } from 'fflate';
import { currentChoice } from '../../core/choices';
import { encodePng } from '../../io/png';
import { readPixels } from '../draw';
import { canvasBytes } from '../encode';
import { kilobytes, STICKER_QUALITIES, stickerPick, type IconFit, type StickerService } from '../icons';
import { frameNumber, slug } from '../plan';
import { breathe } from '../runtime';
import { squareCanvas } from './square';
import type { ExporterRun } from '../registry';
import '../choices';

/** WebP at the best quality that stays under the service's limit (or the lowest one tried, and says whether it fits). */
async function webpUnder(canvas: OffscreenCanvas, max: number): Promise<{ bytes: Uint8Array; fits: boolean }> {
  let bytes: Uint8Array = new Uint8Array(0);
  for (const q of STICKER_QUALITIES) {
    bytes = await canvasBytes(canvas, 'image/webp', q);
    if (bytes.length <= max) return { bytes, fits: true };
  }
  return { bytes, fits: false };
}

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, bg, crisp, step }) => {
  const services = stickerPick(settings.stickerFor);
  const base = slug(doc.name, 'sticker');
  const fit: IconFit = (currentChoice('export.iconFit') as IconFit | undefined) === 'fill' ? 'fill' : 'fit';
  const files: Zippable = {};
  const over = new Map<string, StickerService>();
  const total = plan.count * services.length;
  let done = 0;
  for (let i = 0; i < plan.count; i++) {
    const frame = plan.range.start + (plan.order?.[i] ?? i);
    const src = { doc, frame, bg, crisp, fit } as const;
    // Apps that want the same size share one drawing.
    const drawn = new Map<number, OffscreenCanvas>();
    for (const sv of services) {
      await breathe(signal, done);
      step(done, `Making ${sv.title} ${i + 1} of ${plan.count}`);
      done++;
      let canvas = drawn.get(sv.size);
      if (!canvas) drawn.set(sv.size, (canvas = squareCanvas(src, sv.size)));
      let bytes: Uint8Array;
      if (sv.type === 'webp') {
        const r = await webpUnder(canvas, sv.maxBytes);
        bytes = r.bytes;
        if (!r.fits) over.set(sv.id, sv);
      } else {
        bytes = encodePng(readPixels(canvas));
        if (bytes.length > sv.maxBytes) over.set(sv.id, sv);
      }
      const name = plan.count === 1 ? base : `${base}-${frameNumber(i, plan.count)}`;
      files[`${sv.id}/${name}.${sv.type}`] = [bytes, { level: 0 }];
    }
  }
  step(total, 'Packing the zip');
  const note = over.size ? `Over the size limit for ${[...over.values()].map((s) => `${s.title} (${kilobytes(s.maxBytes)})`).join(', ')}. Try a simpler drawing or fewer colours.` : undefined;
  return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(files), ...(note ? { note } : {}) };
};
