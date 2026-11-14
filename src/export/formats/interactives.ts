// An Interactives package (.flplay). Registered by the Interactives feature (src/interactives), so it goes with it.
import type { RawImage } from '../../io/png';
import { saveFile } from '../../io/file';
import { withoutNotes } from '../../notes/model';
import { MAX_SHEET_SIDE } from '../plan';
import { playablePackage } from '../playable';
import { breathe } from '../runtime';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async (ctx, { plan, bg, crisp, step, rgbaAt }) => {
  const { doc, settings, signal } = ctx;
  const frames: RawImage[] = [];
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    const img = rgbaAt(i);
    frames.push({ width: img.width, height: img.height, pixels: new Uint8ClampedArray(img.pixels) });
  }
  step(plan.count, 'Packing for Interactives');
  const { bytes } = playablePackage({
    doc,
    frames,
    range: plan.range,
    scale: settings.scale,
    pixelArt: crisp,
    background: bg === 'none' ? null : bg === 'doc' ? doc.background : '#ffffff',
    maxSide: MAX_SHEET_SIDE,
    appVersion: ctx.appVersion,
    // The drawing inside carries a marker so Frameling knows it came from Interactives (feature id under `ext`).
    source: settings.includeSource === false ? null : saveFile(withoutNotes({ ...doc, ext: { ...doc.ext, interactives: { used: true } } }), ctx.appVersion ?? ''),
  });
  return { kind: 'file', name: `${plan.name}.flplay`, bytes };
};
