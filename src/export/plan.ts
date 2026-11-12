// Works out what an export will be (which frames, how big, what it is called) before anything is drawn.
// Pure functions on the document, so they are easy to test.
import type { Doc } from '../core/format';
import { inOutRange } from '../timeline/inout';
import { bakedPositions, clipDirection, clipPlays, hasPlaySettings, isBackAndForth, stillPositions } from '../core/clipPlay';
import { exporterOf } from './registry';
import { DEFAULT_SHEET, formatInfo, oneFrameOnly, type ExportSettings, type FormatId } from './types';

export const MAX_SIDE = 8192;
export const MAX_FRAMES = 5000;
/** The biggest sprite sheet, the largest picture most graphics cards and engines will load. */
export const MAX_SHEET_SIDE = 16384;

export interface FrameRange {
  /** First and last frame, inclusive. */
  start: number;
  end: number;
}

export interface Plan {
  range: FrameRange;
  /** How many pictures the file holds. */
  count: number;
  /**
   * For a clip that plays backward, back and forth or a set number of times, in a format that has no such setting
   * (GIF, APNG, videos): which frame of the range each picture shows, counted from its first. Missing = in order.
   */
  order?: number[];
  /** Whether the file repeats for ever (GIF, APNG, animated SVG), or stops after its last picture. */
  loop: boolean;
  /** The loop setting comes from the clip being exported (not from the checkbox). */
  loopFromClip: boolean;
  width: number;
  height: number;
  /** A file name (or folder name) base, with no extension. */
  name: string;
  /** Why this cannot be exported as set, in plain words. */
  problem: string | null;
}

export const hasPixelLayers = (doc: Doc): boolean => doc.layers.some((l) => l.kind !== 'vector');

/** Scales that make sense for the document: whole numbers for pixel art, friendly steps otherwise. */
export function scaleChoices(doc: Doc): number[] {
  return hasPixelLayers(doc) ? [1, 2, 3, 4, 6, 8] : [0.25, 0.5, 1, 2, 3, 4];
}

/**
 * The scale where one art pixel becomes one pixel (1/8 for a 32 x 32 grid on a 256 stage), or null when the layers
 * don't share one pixel size. Game engines want this size and scale it up themselves.
 */
export function artScale(doc: Doc): number | null {
  const art = doc.layers.filter((l) => !l.reference && !(l.kind === 'vector' && l.rig));
  if (!art.length || !art.every((l) => l.kind !== 'vector')) return null;
  const sizes = new Set(art.map((l) => ('pixelSize' in l ? l.pixelSize : 1)));
  if (sizes.size !== 1) return null;
  const p = [...sizes][0];
  return p > 1 ? 1 / p : null;
}

/** The scale is one of the choices offered for this document. */
export const scaleAllowed = (doc: Doc, scale: number): boolean => scaleChoices(doc).includes(scale) || scale === artScale(doc);

export function defaultSettings(doc: Doc): ExportSettings {
  const pixel = hasPixelLayers(doc);
  return {
    format: doc.length > 1 ? 'mp4' : 'png',
    range: 'all',
    clipId: null,
    // Pixel art starts big enough to see (about 512 pixels across), on a whole number so every art pixel stays square.
    scale: pixel ? [...scaleChoices(doc)].reverse().find((c) => c <= 512 / Math.max(doc.width, doc.height)) ?? 1 : 1,
    transparent: doc.background === null,
    loop: true,
    dither: false,
    sheet: { ...DEFAULT_SHEET },
  };
}

/**
 * How many frames from the start have a drawing on any layer, when that is fewer than the animation's length (so the
 * end would export empty). Null when the drawings reach the end, nothing is drawn yet, or there are sounds (which
 * may want the quiet frames).
 */
export function drawnFrames(doc: Doc): number | null {
  if (doc.audio?.length) return null;
  let drawn = 0;
  for (const l of doc.layers) for (const c of l.cels) drawn = Math.max(drawn, c.start + c.length);
  return drawn > 0 && drawn < doc.length ? drawn : null;
}

/** The frames an export covers. Whole animation, one clip, the play range, or the frame being looked at. */
export function resolveRange(doc: Doc, s: Pick<ExportSettings, 'range' | 'clipId' | 'format' | 'aiFrames'>, currentFrame: number): FrameRange {
  const last = Math.max(0, doc.length - 1);
  const clamp = (n: number) => Math.min(last, Math.max(0, Math.round(n)));
  if (oneFrameOnly(s, formatInfo(s.format).animated)) {
    const f = clamp(currentFrame);
    return { start: f, end: f };
  }
  if (s.range === 'clip') {
    const clip = doc.clips.find((c) => c.id === s.clipId);
    if (clip) return { start: clamp(Math.min(clip.start, clip.end)), end: clamp(Math.max(clip.start, clip.end)) };
  }
  if (s.range === 'inOut') {
    const io = inOutRange(doc);
    if (io) return io;
  }
  return { start: 0, end: last };
}

/** Output size in pixels. Videos need even numbers. */
export function outputSize(doc: Doc, scale: number, even: boolean): { width: number; height: number } {
  let w = Math.max(1, Math.round(doc.width * scale));
  let h = Math.max(1, Math.round(doc.height * scale));
  if (even) {
    w += w % 2;
    h += h % 2;
  }
  return { width: w, height: h };
}

/** A name that is safe as a file name on every system and still reads like what the person typed. */
export function fileSafe(name: string, fallback = 'Untitled'): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return s || fallback;
}

/** Lowercase, hyphenated: for paths inside game projects, where spaces and capitals only cause trouble. */
export function slug(name: string, fallback = 'sprites'): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

/** Formats that show the pictures one after another (or page after page) with no direction or repeat count of their own. */
const isBaked = (f: FormatId): boolean => !!exporterOf(f)?.baked;

/** Formats that are pictures to look at, not to play: each frame once, in the order the clip starts, whatever its repeat. */
export const isStillsFormat = (f: FormatId): boolean => !!exporterOf(f)?.stills;

/**
 * The order a clip's frames go in for such a format, or undefined when it just plays through once, forward. Stills
 * (PNG sequence, PDF, Illustrator pages) keep the direction but hold each frame once, however often the clip repeats.
 */
export function clipPlayOrder(doc: Doc, s: Pick<ExportSettings, 'range' | 'clipId' | 'format' | 'aiFrames'>, range: FrameRange): number[] | undefined {
  if (s.range !== 'clip' || !isBaked(s.format) || oneFrameOnly(s, formatInfo(s.format).animated)) return undefined;
  const clip = doc.clips.find((c) => c.id === s.clipId);
  if (!clip || !hasPlaySettings(clip)) return undefined;
  const len = range.end - range.start + 1;
  if (isStillsFormat(s.format)) {
    const once = stillPositions(len, clipDirection(clip));
    return once.every((p, i) => p === i) ? undefined : once;
  }
  return bakedPositions(len, clipDirection(clip), clipPlays(clip));
}

/** Formats with a loop setting of their own. */
const hasLoop = (f: FormatId): boolean => !!exporterOf(f)?.loops;

/**
 * Whether the file repeats for ever. An exported clip sets this itself: one that loops repeats for ever, one that plays
 * N times or once stops after the passes baked into the file. Choosing by hand (`loopTouched`) wins over the clip.
 */
export function exportLoop(doc: Doc, s: Pick<ExportSettings, 'range' | 'clipId' | 'format' | 'loop' | 'loopTouched'>): { loop: boolean; fromClip: boolean } {
  const clip = s.range === 'clip' && hasLoop(s.format) ? doc.clips.find((c) => c.id === s.clipId) : undefined;
  if (!clip || s.loopTouched) return { loop: s.loop, fromClip: false };
  return { loop: clip.loop, fromClip: true };
}

/** What the clip being exported does when it plays, in plain words ("plays 3 times"), or null when no clip sets the loop. */
export function clipLoopWords(doc: Doc, s: Pick<ExportSettings, 'range' | 'clipId' | 'format'>): { name: string; plays: string } | null {
  const clip = s.range === 'clip' && hasLoop(s.format) ? doc.clips.find((c) => c.id === s.clipId) : undefined;
  if (!clip) return null;
  const n = clipPlays(clip);
  return { name: clip.name, plays: clip.loop ? 'loops for ever' : n > 1 ? `plays ${n} ${isBackAndForth(clipDirection(clip)) ? 'ways' : 'times'}` : 'plays once' };
}

/** The document frame each picture (or page) of the export shows, in the order the file has them. */
export const planFrames = (plan: Pick<Plan, 'range' | 'count' | 'order'>): number[] => Array.from({ length: plan.count }, (_, i) => plan.range.start + (plan.order?.[i] ?? i));

/** `bake: false` keeps the range in plain order even for a clip that plays another way (for plugins, which get the clip's settings instead). */
export function planExport(doc: Doc, s: ExportSettings, currentFrame: number, opts: { bake?: boolean } = {}): Plan {
  const info = formatInfo(s.format);
  const range = resolveRange(doc, s, currentFrame);
  const order = opts.bake === false ? undefined : clipPlayOrder(doc, s, range);
  const count = order ? order.length : range.end - range.start + 1;
  const video = !!exporterOf(s.format)?.video;
  const { width, height } = outputSize(doc, s.scale, video);
  let name = fileSafe(doc.name);
  const one = oneFrameOnly(s, info.animated);
  if (info.animated && !one && s.range === 'clip') {
    const clip = doc.clips.find((c) => c.id === s.clipId);
    if (clip) name += '-' + fileSafe(clip.name);
  }
  if (one && doc.length > 1) name += `-frame-${range.start + 1}`;
  if (info.animated && !one && s.range === 'inOut' && inOutRange(doc)) name += `-frames-${range.start + 1}-${range.end + 1}`;

  let problem: string | null = null;
  if (!(s.scale > 0)) problem = 'Pick a size first.';
  else if (width > MAX_SIDE || height > MAX_SIDE) problem = `That is bigger than ${MAX_SIDE} pixels on one side. Choose a smaller size.`;
  else if (count > MAX_FRAMES) problem = 'That is a lot of frames. Try exporting one clip at a time.';
  else if (s.range === 'clip' && info.animated && !one && !doc.clips.some((c) => c.id === s.clipId)) problem = 'Pick which clip to export.';
  else if (video && count < 2) problem = 'A video needs at least two frames. Try the whole animation or a clip.';
  const looping = exportLoop(doc, s);
  return { range, count, ...(order ? { order } : {}), loop: looping.loop, loopFromClip: looping.fromClip, width, height, name, problem };
}

/** The file extension this export is saved with: a dotLottie `.lottie`, or a zip when each frame is its own
 * Illustrator file (the format says, see registry.ts). */
export function extensionFor(s: Pick<ExportSettings, 'format' | 'lottieFile' | 'aiFrames'>): string {
  return exporterOf(s.format)?.extension?.(s as ExportSettings) ?? formatInfo(s.format).ext;
}

/** Same as extensionFor (the Illustrator export's name for it). */
export const outputExt = extensionFor;

type FilterOpts = Pick<ExportSettings, 'lottieFile' | 'aiFrames'>;

export function filtersFor(format: FormatId, opts?: FilterOpts | ExportSettings['lottieFile']): { name: string; extensions: string[] }[] {
  const s: FilterOpts = typeof opts === 'string' ? { lottieFile: opts } : (opts ?? {});
  const ext = extensionFor({ format, ...s });
  const kind = exporterOf(format)?.fileKind?.({ format, ...s } as ExportSettings);
  return [{ name: kind?.name ?? formatInfo(format).title, extensions: kind?.extensions ?? [ext] }];
}

/** Zero-padded frame numbers: 0001, 0002... with enough digits for the count. */
export function frameNumber(index: number, count: number): string {
  return String(index + 1).padStart(Math.max(4, String(count).length), '0');
}
