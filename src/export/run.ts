// Runs an export: draws each frame at an exact frame number (so the result never depends on how fast this computer
// is), feeds the encoder, and hands back the finished file or files. Needs a canvas, so it only runs in the app.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, type VideoCodec } from 'mediabunny';
import type { Doc } from '../core/format';
import { encodePng, type RawImage } from '../io/png';
import { ApngWriter } from './apng';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from './draw';
import { buildPalette, GifWriter, sampleFrames } from './gif';
import { frameNumber, MAX_SHEET_SIDE, planExport, type Plan } from './plan';
import { buildSheetFiles } from './engines';
import { frameToSvg } from './svg';
import { formatInfo, type ExportSettings } from './types';

export interface Progress {
  done: number;
  total: number;
  /** What is happening, in friendly words. */
  label: string;
}

export interface RunContext {
  doc: Doc;
  settings: ExportSettings;
  /** The frame being looked at (for "this frame"). */
  currentFrame: number;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
  /** Which video codec to use, from detectCapabilities (the dialog checked it already). */
  videoCodec?: VideoCodec | null;
  /** Whether the chosen video codec can keep a see-through background. */
  videoAlpha?: boolean;
  appVersion?: string;
}

export type RunResult =
  | { kind: 'file'; name: string; bytes: Uint8Array }
  | { kind: 'files'; folderName: string; files: { name: string; bytes: Uint8Array }[]; /** The file to point at afterwards. */ main: string };

export function isCancelled(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

const cancelled = () => new DOMException('Export cancelled', 'AbortError');

/** Lets the window breathe (progress bar, Cancel button) between frames. */
async function breathe(signal: AbortSignal, i: number): Promise<void> {
  if (signal.aborted) throw cancelled();
  if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  if (signal.aborted) throw cancelled();
}

export async function runExport(ctx: RunContext): Promise<RunResult> {
  const { doc, settings, currentFrame, signal, onProgress } = ctx;
  const plan = planExport(doc, settings, currentFrame);
  if (plan.problem) throw new Error(plan.problem);
  const info = formatInfo(settings.format);
  const bg = backgroundFor(doc, settings.transparent, settings.format === 'webm' ? !!ctx.videoAlpha : info.alpha);
  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind === 'pixel');
  const target = { width: plan.width, height: plan.height, scale: settings.scale, background: bg, crisp };
  const canvas = makeCanvas(plan.width, plan.height);
  const frameAt = (i: number) => drawFrame(canvas, doc, plan.range.start + i, target);
  const rgbaAt = (i: number): RawImage => readPixels(frameAt(i));
  const step = (done: number, label: string) => onProgress({ done, total: plan.count, label });

  switch (settings.format) {
    case 'png': {
      step(0, 'Drawing the picture');
      const bytes = encodePng(rgbaAt(0));
      return { kind: 'file', name: `${plan.name}.png`, bytes };
    }
    case 'svg': {
      step(0, 'Writing the drawing');
      const svg = frameToSvg(doc, plan.range.start, { scale: settings.scale, transparent: bg === 'none' });
      return { kind: 'file', name: `${plan.name}.svg`, bytes: strToU8(svg) };
    }
    case 'pngseq': {
      const files: Zippable = {};
      for (let i = 0; i < plan.count; i++) {
        await breathe(signal, i);
        step(i, `Drawing frame ${i + 1} of ${plan.count}`);
        files[`${plan.name}-${frameNumber(i, plan.count)}.png`] = [encodePng(rgbaAt(i)), { level: 0 }];
      }
      step(plan.count, 'Packing the zip');
      return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(files) };
    }
    case 'apng': {
      const w = new ApngWriter({ width: plan.width, height: plan.height, fps: doc.fps, loop: settings.loop }, plan.count);
      for (let i = 0; i < plan.count; i++) {
        await breathe(signal, i);
        step(i, `Drawing frame ${i + 1} of ${plan.count}`);
        w.addFrame(rgbaAt(i));
      }
      step(plan.count, 'Finishing up');
      return { kind: 'file', name: `${plan.name}.png`, bytes: w.finish() };
    }
    case 'gif': {
      const transparent = bg === 'none';
      // First look at a spread of frames to choose one set of colours for the whole GIF.
      const samples = sampleFrames(plan.count);
      const sampled: Uint8ClampedArray[] = [];
      for (let k = 0; k < samples.length; k++) {
        await breathe(signal, k);
        step(0, 'Choosing colours');
        sampled.push(new Uint8ClampedArray(rgbaAt(samples[k]).pixels));
      }
      const palette = buildPalette(sampled, transparent);
      sampled.length = 0;
      const w = new GifWriter({ width: plan.width, height: plan.height, fps: doc.fps, loop: settings.loop, transparent, dither: settings.dither }, palette, plan.count);
      for (let i = 0; i < plan.count; i++) {
        await breathe(signal, i);
        step(i, `Drawing frame ${i + 1} of ${plan.count}`);
        w.addFrame(rgbaAt(i).pixels);
      }
      step(plan.count, 'Finishing up');
      return { kind: 'file', name: `${plan.name}.gif`, bytes: w.finish() };
    }
    case 'mp4':
    case 'webm': {
      const codec = ctx.videoCodec;
      if (!codec) throw new Error("This computer can't make that kind of video.");
      const mp4 = settings.format === 'mp4';
      const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
      const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH, ...(bg === 'none' ? { alpha: 'keep' as const } : {}) });
      output.addVideoTrack(source, { frameRate: doc.fps });
      try {
        await output.start();
        const dt = 1 / doc.fps;
        for (let i = 0; i < plan.count; i++) {
          await breathe(signal, i);
          step(i, `Drawing frame ${i + 1} of ${plan.count}`);
          frameAt(i);
          // The time of each frame is its number divided by the frame rate, however long drawing it took.
          await source.add(i * dt, dt);
        }
        step(plan.count, 'Finishing the video');
        await output.finalize();
      } catch (e) {
        await output.cancel().catch(() => undefined);
        throw e;
      }
      const buf = (output.target as BufferTarget).buffer;
      if (!buf) throw new Error('The video came out empty. Please try again.');
      return { kind: 'file', name: `${plan.name}.${mp4 ? 'mp4' : 'webm'}`, bytes: new Uint8Array(buf) };
    }
    case 'sheet':
      return runSheet(ctx, plan, rgbaAt, step);
  }
}

async function runSheet(ctx: RunContext, plan: Plan, rgbaAt: (i: number) => RawImage, step: (done: number, label: string) => void): Promise<RunResult> {
  const { doc, settings, signal } = ctx;
  const sheet = settings.sheet;
  const frames: RawImage[] = [];
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    const img = rgbaAt(i);
    // The canvas is reused, so each frame keeps its own copy of the pixels.
    frames.push({ width: img.width, height: img.height, pixels: new Uint8ClampedArray(img.pixels) });
  }
  step(plan.count, 'Packing the sheet');
  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind === 'pixel');
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
  });
  return { kind: 'files', folderName: out.main.replace(/\.png$/, ''), files: out.files, main: out.main };
}
