// Works out what an export will be (which frames, how big, what it is called) before anything is drawn.
// Pure functions on the document, so they are easy to test.
import type { Doc } from '../core/format';
import { DEFAULT_SHEET, formatInfo, type ExportSettings, type FormatId } from './types';

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
  count: number;
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

/** The frames an export covers. Whole animation, one clip, or the frame being looked at. */
export function resolveRange(doc: Doc, s: Pick<ExportSettings, 'range' | 'clipId' | 'format'>, currentFrame: number): FrameRange {
  const last = Math.max(0, doc.length - 1);
  const clamp = (n: number) => Math.min(last, Math.max(0, Math.round(n)));
  if (!formatInfo(s.format).animated || s.range === 'frame') {
    const f = clamp(currentFrame);
    return { start: f, end: f };
  }
  if (s.range === 'clip') {
    const clip = doc.clips.find((c) => c.id === s.clipId);
    if (clip) return { start: clamp(Math.min(clip.start, clip.end)), end: clamp(Math.max(clip.start, clip.end)) };
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

export function planExport(doc: Doc, s: ExportSettings, currentFrame: number): Plan {
  const info = formatInfo(s.format);
  const range = resolveRange(doc, s, currentFrame);
  const count = range.end - range.start + 1;
  const video = s.format === 'mp4' || s.format === 'webm';
  const { width, height } = outputSize(doc, s.scale, video);
  let name = fileSafe(doc.name);
  if (info.animated && s.range === 'clip') {
    const clip = doc.clips.find((c) => c.id === s.clipId);
    if (clip) name += '-' + fileSafe(clip.name);
  }
  if ((!info.animated || s.range === 'frame') && doc.length > 1) name += `-frame-${range.start + 1}`;

  let problem: string | null = null;
  if (!(s.scale > 0)) problem = 'Pick a size first.';
  else if (width > MAX_SIDE || height > MAX_SIDE) problem = `That is bigger than ${MAX_SIDE} pixels on one side. Choose a smaller size.`;
  else if (count > MAX_FRAMES) problem = 'That is a lot of frames. Try exporting one clip at a time.';
  else if (s.range === 'clip' && info.animated && !doc.clips.some((c) => c.id === s.clipId)) problem = 'Pick which clip to export.';
  else if (video && count < 2) problem = 'A video needs at least two frames. Try the whole animation or a clip.';
  return { range, count, width, height, name, problem };
}

export function filtersFor(format: FormatId): { name: string; extensions: string[] }[] {
  const info = formatInfo(format);
  const names: Record<FormatId, string> = { mp4: 'MP4 video', webm: 'WebM video', gif: 'Animated GIF', apng: 'Animated PNG', png: 'PNG picture', pngseq: 'Zip file', svg: 'SVG drawing', sheet: 'PNG picture', interactives: 'Interactives package', lottie: 'Lottie animation', svganim: 'Animated SVG' };
  return [{ name: names[format], extensions: [info.ext] }];
}

/** Zero-padded frame numbers: 0001, 0002... with enough digits for the count. */
export function frameNumber(index: number, count: number): string {
  return String(index + 1).padStart(Math.max(4, String(count).length), '0');
}
