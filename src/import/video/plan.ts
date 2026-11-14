// Opening a video as frames to trace over: what a request makes (how many pictures, how big, which frame each lands on)
// and the words for what was found and what was left out. Plain functions with no video in sight, so they are tested.
import type { ImportReport } from '../report';

export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;
export const VIDEO_ACCEPT = '.mp4,.m4v,.mov,.webm,.mkv,video/mp4,video/webm,video/quicktime';
/** The most pictures one go brings in. */
export const MAX_VIDEO_FRAMES = 1000;
/** The longest side a picture is made at, by default and at most. */
export const DEFAULT_SIDE = 1280;
export const MAX_SIDE = 2560;

export type VideoAs = 'reference' | 'pixel';

export interface VideoFacts {
  name: string;
  /** Seconds. */
  duration: number;
  width: number;
  height: number;
  /** The video's own pictures a second, when it could be told (0 = unknown). */
  fps: number;
  hasSound: boolean;
  /** The kind of picture track, when known ("avc", "vp9"). */
  codec?: string;
}

export interface VideoRequest {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  /** Pictures a second. */
  rate: number;
  /** Longest side of each picture, in pixels. */
  side: number;
  as: VideoAs;
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Seconds as a person says them: "2.4 seconds", "1 minute 5 seconds". */
export function secondsText(s: number): string {
  if (s < 60) return `${Math.round(s * 10) / 10} ${Math.round(s * 10) / 10 === 1 ? 'second' : 'seconds'}`;
  const m = Math.floor(s / 60);
  return `${plural(m, 'minute')} ${Math.round(s - m * 60)} seconds`;
}

/** How many pictures a stretch makes at a rate (at least one, and never more than the limit). */
export function frameCount(start: number, end: number, rate: number): number {
  if (!(end > start) || !(rate > 0)) return 0;
  return Math.max(1, Math.min(MAX_VIDEO_FRAMES, Math.round((end - start) * rate)));
}

/** How many pictures the stretch would make with no limit (for saying some were left out). */
export function frameCountUncapped(start: number, end: number, rate: number): number {
  return !(end > start) || !(rate > 0) ? 0 : Math.max(1, Math.round((end - start) * rate));
}

/** The moments to take a picture at, in seconds from the start of the video. */
export function frameTimes(start: number, end: number, rate: number): number[] {
  const n = frameCount(start, end, rate);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.min(end, start + i / rate));
  return out;
}

/** The size each picture is made at: the video's own, or shrunk to fit `side` (never bigger than the video, never under 1). */
export function frameSize(w: number, h: number, side: number): { width: number; height: number } {
  const k = Math.min(1, side / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** The frame of the animation each picture lands on: the animation runs at `docFps`, and a picture's moment is `time` seconds into the stretch that began at `start`. */
export function landingFrames(times: number[], start: number, docFps: number, first = 0): number[] {
  return times.map((t) => first + Math.round((t - start) * docFps));
}

/** How many frames the last picture holds, so the clip fills its stretch. */
export function lastHold(rate: number, docFps: number): number {
  return Math.max(1, Math.round(docFps / rate));
}

/** About how much room the pictures take: a reference keeps JPEGs in the file, pixel frames keep every colour in memory. */
export function estimateBytes(count: number, width: number, height: number, as: VideoAs): number {
  return count * width * height * (as === 'pixel' ? 4 : 0.3);
}

export const mb = (bytes: number): string => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1048576))} MB`);

/** A warning when the pictures would be a lot to hold, or null. */
export function sizeWarning(count: number, width: number, height: number, as: VideoAs): string | null {
  const bytes = estimateBytes(count, width, height, as);
  const limit = as === 'pixel' ? 600 * 1048576 : 250 * 1048576;
  if (bytes < limit) return null;
  return as === 'pixel'
    ? `That is about ${mb(bytes)} of pictures to hold, which may make Frameling slow. Fewer pictures a second, a shorter stretch or a smaller size would help.`
    : `That adds about ${mb(bytes)} to your file. Fewer pictures a second, a shorter stretch or a smaller size would keep it light.`;
}

/** The words for what the video holds and what the request makes, said before anything happens. */
export function foundSummary(v: VideoFacts, r: VideoRequest): { found: string; left: string[]; notes: string[] } {
  const count = frameCount(r.start, r.end, r.rate);
  const size = frameSize(v.width, v.height, r.side);
  const found = `${secondsText(v.duration)} of video, ${v.width} x ${v.height}${v.fps ? `, ${Math.round(v.fps * 10) / 10} pictures a second` : ''}. That stretch makes ${plural(count, 'picture')} of ${size.width} x ${size.height}.`;
  const left: string[] = [];
  if (v.hasSound) left.push("The sound. Only the pictures come in; to use the sound, add the video's file in [Sound](help:sound).");
  const over = frameCountUncapped(r.start, r.end, r.rate) - count;
  if (over > 0) left.push(`${plural(over, 'picture')} past the limit of ${MAX_VIDEO_FRAMES}. Pick a shorter stretch or fewer pictures a second to get them.`);
  const notes: string[] = [];
  if (v.fps && r.rate > v.fps + 0.01) notes.push(`The video only has ${Math.round(v.fps * 10) / 10} pictures a second, so some pictures will repeat.`);
  if (v.width > size.width) notes.push(`The pictures are made smaller than the video (${v.width} x ${v.height}) to keep them light.`);
  const warn = sizeWarning(count, size.width, size.height, r.as);
  if (warn) notes.push(warn);
  return { found, left, notes };
}

/** What came in, for the toast and the list behind it. */
export function videoReport(name: string, count: number, r: VideoRequest, size: { width: number; height: number }, left: string[], notes: string[], where: string): ImportReport {
  const what = r.as === 'reference' ? `${plural(count, 'picture')} on a reference layer` : `${plural(count, 'frame')} of ${size.width} x ${size.height}`;
  return { headline: `${where} "${name}": ${what}, from ${secondsText(r.start)} to ${secondsText(r.end)}.`, left, info: notes };
}

/** Clamps a request to the video: start inside it, an end after the start, a sensible rate and size. */
export function tidyRequest(r: VideoRequest, duration: number): VideoRequest {
  const d = Math.max(0, duration);
  const start = Math.min(Math.max(0, Number.isFinite(r.start) ? r.start : 0), Math.max(0, d - 0.01));
  const end = Math.min(d, Math.max(start + 0.01, Number.isFinite(r.end) ? r.end : d));
  const rate = Math.min(120, Math.max(1, Number.isFinite(r.rate) ? r.rate : 12));
  const side = Math.min(MAX_SIDE, Math.max(16, Math.round(Number.isFinite(r.side) ? r.side : DEFAULT_SIDE)));
  return { start, end, rate, side, as: r.as };
}
