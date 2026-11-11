// Runs an export: draws each frame at an exact frame number (so the result never depends on how fast this computer
// is), feeds the encoder, and hands back the finished file or files. Needs a canvas, so it only runs in the app.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSample, VideoSampleSource, WebMOutputFormat, type VideoCodec } from 'mediabunny';
import type { Doc } from '../core/format';
import { encodePng, type RawImage } from '../io/png';
import { ApngWriter } from './apng';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from './draw';
import { buildPalette, GifWriter, sampleFrames } from './gif';
import { frameNumber, planExport, slug, type Plan } from './plan';
import { buildAnimations, buildAtlas, buildCells, composeSheet, godotResourcePath, godotScene, godotSpriteFrames, godotTexturePath, layoutCells } from './sheet';
import { frameToSvg } from './svg';
import { formatInfo, type ExportSettings } from './types';
import { BT709_LIMITED, rgbaToI420 } from './yuv';

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
      // MP4 frames are converted to limited range BT.709 here (see yuv.ts); left to the browser they come out full
      // range. WebM keeps the canvas path, which is what carries a see-through background.
      const config = { codec, quality: QUALITY_HIGH, ...(bg === 'none' ? { alpha: 'keep' as const } : {}) };
      const source = mp4 ? new VideoSampleSource(config) : new CanvasSource(canvas, config);
      output.addVideoTrack(source, { frameRate: doc.fps });
      try {
        await output.start();
        const dt = 1 / doc.fps;
        let yuv: Uint8Array | undefined;
        for (let i = 0; i < plan.count; i++) {
          await breathe(signal, i);
          step(i, `Drawing frame ${i + 1} of ${plan.count}`);
          // The time of each frame is its number divided by the frame rate, however long drawing it took.
          if (source instanceof VideoSampleSource) {
            const img = rgbaAt(i);
            yuv = rgbaToI420(img.pixels, img.width, img.height, yuv);
            const sample = new VideoSample(yuv, { format: 'I420', codedWidth: img.width, codedHeight: img.height, timestamp: i * dt, duration: dt, colorSpace: BT709_LIMITED });
            try {
              await source.add(sample);
            } finally {
              sample.close();
            }
          } else {
            frameAt(i);
            await source.add(i * dt, dt);
          }
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
  const whole = settings.range === 'all';
  const animations = buildAnimations({ clips: doc.clips, rangeStart: plan.range.start, rangeEnd: plan.range.end, fps: doc.fps, whole, onlyClipId: settings.clipId });
  // A new clip must start a new cell, or two clips would share a picture that one of them might later change.
  const cuts = new Set<number>();
  for (const c of doc.clips) cuts.add(Math.min(c.start, c.end) - plan.range.start).add(Math.max(c.start, c.end) + 1 - plan.range.start);
  const { cells, cellOfFrame } = buildCells(frames, { trim: sheet.trim, dedupe: sheet.dedupe, cuts });
  const layout = layoutCells(cells, { columns: sheet.columns, padding: sheet.padding, pot: sheet.pot });
  const png = encodePng(composeSheet(cells, layout));

  const texturePath = godotTexturePath(sheet.godotPath, doc.name);
  const base = (sheet.godot || sheet.godotScene ? texturePath.split('/').pop()!.replace(/\.[^.]*$/, '') : '') || slug(plan.name);
  const files: { name: string; bytes: Uint8Array }[] = [{ name: `${base}.png`, bytes: png }];
  if (sheet.json) {
    const atlas = buildAtlas({ image: `${base}.png`, layout, cells, cellOfFrame, animations, fps: doc.fps, scale: settings.scale, frameCount: plan.count });
    files.push({ name: `${base}.json`, bytes: strToU8(JSON.stringify(atlas, null, 2) + '\n') });
  }
  if (sheet.godot || sheet.godotScene) {
    files.push({ name: `${base}.tres`, bytes: strToU8(godotSpriteFrames({ texturePath, layout, cells, cellOfFrame, animations })) });
  }
  if (sheet.godotScene) {
    const node = doc.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Sprite';
    files.push({ name: `${base}.tscn`, bytes: strToU8(godotScene({ resourcePath: godotResourcePath(texturePath), nodeName: node, animation: animations[0].name })) });
  }
  return { kind: 'files', folderName: base, files, main: `${base}.png` };
}
