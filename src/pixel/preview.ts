// The Preview panel's maths and settings: which frames it loops over, how big "real size" is, and stepping through
// the frames at the document's speed. No DOM, so it can be tested.
import type { Doc } from '../core/format';
import { artScale } from '../export/plan';
import { createStore, readJson, writeJson } from '../ui/mini';

export type PreviewZoom = 1 | 2 | 3 | 'fit';
export type PreviewRange = 'all' | 'clip';

export interface PreviewSettings {
  playing: boolean;
  zoom: PreviewZoom;
  /** The whole animation, or just the clip the playhead is in. */
  range: PreviewRange;
  loop: boolean;
}

// Fit by default: big enough to judge, with a real-size copy in the corner.
export const DEFAULT_PREVIEW: PreviewSettings = { playing: true, zoom: 'fit', range: 'all', loop: true };
const KEY = 'frameling.preview';

function cleanSettings(v: Partial<PreviewSettings>): PreviewSettings {
  return {
    playing: typeof v.playing === 'boolean' ? v.playing : DEFAULT_PREVIEW.playing,
    zoom: v.zoom === 1 || v.zoom === 2 || v.zoom === 3 || v.zoom === 'fit' ? v.zoom : DEFAULT_PREVIEW.zoom,
    range: v.range === 'clip' ? 'clip' : 'all',
    loop: typeof v.loop === 'boolean' ? v.loop : DEFAULT_PREVIEW.loop,
  };
}

export const previewSettings = createStore<PreviewSettings>(cleanSettings(readJson<Partial<PreviewSettings>>(KEY, {})));

export function setPreview(patch: Partial<PreviewSettings>): void {
  const next = cleanSettings({ ...previewSettings.get(), ...patch });
  previewSettings.set(next);
  writeJson(KEY, next);
}

/** Document units per screen pixel at 1x: one art pixel per screen pixel for pixel art, else the document's own pixels. */
export function previewBase(doc: Doc): number {
  return artScale(doc) ?? 1;
}

/** The frames the preview loops over, first and last inclusive, and the clip's name when it's one clip. */
export function previewFrames(doc: Doc, range: PreviewRange, frame: number): { start: number; end: number; clip: string | null } {
  const last = Math.max(0, doc.length - 1);
  if (range === 'clip') {
    const c = doc.clips.find((x) => frame >= x.start && frame <= x.end);
    if (c) return { start: Math.max(0, Math.min(last, c.start)), end: Math.max(0, Math.min(last, c.end)), clip: c.name };
  }
  return { start: 0, end: last, clip: null };
}

/** The frame after `f` in the range: back to the start when looping, null when a single play-through has ended. */
export function nextPreviewFrame(f: number, r: { start: number; end: number }, loop: boolean): number | null {
  if (f < r.start || f > r.end) return r.start;
  if (f < r.end) return f + 1;
  return loop ? r.start : null;
}

/**
 * Screen pixels per art pixel. 1x, 2x and 3x are exact. Fit is the biggest whole number that fits the box (never
 * below 1 for pixel art, so pixels stay square), or a fraction for a drawing too big for the box even at 1x.
 */
export function previewScale(zoom: PreviewZoom, w: number, h: number, boxW: number, boxH: number): number {
  if (zoom !== 'fit') return zoom;
  if (w <= 0 || h <= 0 || boxW <= 0 || boxH <= 0) return 1;
  const fit = Math.min(boxW / w, boxH / h);
  return fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
}

/** How many frames to move on after `elapsed` ms at `fps`, and the time left over (so playback keeps its speed). */
export function framesDue(elapsed: number, fps: number): { steps: number; rest: number } {
  const per = 1000 / Math.max(1, fps);
  // A long pause (the window was hidden) skips ahead by at most a second rather than racing to catch up.
  const due = Math.floor(elapsed / per);
  const cap = Math.max(1, Math.round(fps));
  if (due > cap) return { steps: cap, rest: 0 };
  return { steps: due, rest: elapsed - due * per };
}

// Frames the Preview has played, for the quest step that asks you to watch it.
let played = 0;
export const notePreviewFrame = (): void => void played++;
export const previewFramesPlayed = (): number => played;
export const resetPreviewFramesPlayed = (): void => void (played = 0);
