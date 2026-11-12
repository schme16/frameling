// A sprite sheet for a game engine (or a web page): every frame on one picture, plus what the engine wants beside it.
import { currentChoice } from '../../core/choices';
import type { RawImage } from '../../io/png';
import { buildSheetFiles } from '../engines';
import { godotBonesFiles } from '../godot-bones-run';
import { MAX_SHEET_SIDE } from '../plan';
import { breathe } from '../runtime';
import { normalizeSheet } from '../types';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async (ctx, { plan, crisp, step, rgbaAt }) => {
  const { doc, settings, signal } = ctx;
  const sheet = settings.sheet;
  const norm = normalizeSheet(sheet);
  if (norm.engine === 'godot' && norm.godotRig === 'bones' && norm.content !== 'separate') {
    const out = await godotBonesFiles({
      doc,
      range: plan.range,
      whole: settings.range === 'all',
      clipId: settings.clipId,
      scale: settings.scale,
      godotPath: sheet.godotPath,
      pixelArt: crisp,
      nativeBounce: currentChoice('export.clipEngineBounce') === 'engine',
      signal,
      onStep: (done, total, label) => ctx.onProgress({ done, total, label }),
    });
    return { kind: 'files', folderName: out.main.replace(/\.tscn$/, ''), files: out.files, main: out.main };
  }
  const frames: RawImage[] = [];
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    const img = rgbaAt(i);
    // The canvas is reused, so each frame keeps its own copy of the pixels.
    frames.push({ width: img.width, height: img.height, pixels: new Uint8ClampedArray(img.pixels) });
  }
  step(plan.count, 'Packing the sheet');
  const out = buildSheetFiles({
    doc,
    sheet: settings.sheet,
    frames,
    range: plan.range,
    whole: settings.range === 'all',
    clipId: settings.clipId,
    scale: settings.scale,
    name: plan.name,
    pixelArt: crisp,
    maxSide: MAX_SHEET_SIDE,
    nativeBounce: currentChoice('export.clipEngineBounce') === 'engine',
  });
  return { kind: 'files', folderName: out.main.replace(/\.png$/, ''), files: out.files, main: out.main };
};
