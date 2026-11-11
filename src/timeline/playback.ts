/**
 * Playback: a loop that moves `ui.frame` forward at `doc.fps`.
 *
 * The frame is worked out from the clock every tick (elapsed time x fps), not by adding one each time, so a slow
 * tick skips frames and the animation stays in time instead of drifting behind. It plays the clip picked in the
 * timeline if there is one, otherwise the whole animation. At the end it loops (when looping is on) or stops on the
 * last frame. Any change to the document stops it, so you never edit something that is moving.
 *
 * `ui.playing` is the one switch: setting it from anywhere starts or stops the loop, once `installPlayback()` has
 * hooked the store (the timeline's index does that).
 */
import type { Doc } from '../core/format';
import { findLayer } from '../core/doc';
import { store, type Store } from '../core/store';
import { tl } from './state';

export interface Scheduler {
  now(): number;
  request(cb: (time: number) => void): unknown;
  cancel(handle: unknown): void;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const browserScheduler: Scheduler = {
  now,
  request: (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), 16)),
  cancel: (h) => (typeof cancelAnimationFrame === 'function' && typeof h === 'number' ? cancelAnimationFrame(h) : clearTimeout(h as ReturnType<typeof setTimeout>)),
};

let scheduler: Scheduler = browserScheduler;
/** For tests: drive the loop by hand. */
export function setScheduler(s: Scheduler | null): void {
  scheduler = s ?? browserScheduler;
}

/** A tick later than this after the last one is a stall (hidden window, busy page): carry on from here, don't jump. */
const STALL_MS = 500;

/** The first and last frame (inclusive) that play: the chosen clip, or the whole animation. */
export function playRange(doc: Doc, clipId: string | null = tl().clipId): { start: number; end: number; clipLoops: boolean } {
  const last = Math.max(0, doc.length - 1);
  const clip = clipId ? doc.clips.find((c) => c.id === clipId) : undefined;
  if (!clip) return { start: 0, end: last, clipLoops: true };
  const start = Math.max(0, Math.min(last, clip.start));
  return { start, end: Math.max(start, Math.min(last, clip.end)), clipLoops: clip.loop };
}

/** The next `count` frames playback will show after `from`, in order, following the loop (or stopping at the end). */
export function upcomingFrames(doc: Doc, from: number, count: number, loop: boolean, clipId: string | null = tl().clipId): number[] {
  const r = playRange(doc, clipId);
  const len = r.end - r.start + 1;
  const out: number[] = [];
  if (from < r.start || from > r.end) return out;
  for (let k = 1; k <= Math.min(count, len - 1 + (loop ? 1 : 0)); k++) {
    const i = from - r.start + k;
    if (i >= len && !(loop && r.clipLoops)) break;
    out.push(r.start + (i % len));
  }
  return out;
}

/** Frames next to `frame` (nearest first, alternating forward and back), for pre-drawing while paused. */
export function neighbourFrames(frame: number, length: number, reach: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= reach; k++) {
    if (frame + k < length) out.push(frame + k);
    if (frame - k >= 0) out.push(frame - k);
  }
  return out;
}

interface Run {
  handle: unknown;
  /** Clock time the current stretch started, and where in the range it started (0 = first frame of the range). */
  t0: number;
  from: number;
  lastTick: number;
  /** The frame we last wrote, to spot someone else moving the playhead. */
  shown: number;
  doc: Doc;
}

let run: Run | null = null;

function stop(): void {
  if (run) scheduler.cancel(run.handle);
  run = null;
}

function begin(): void {
  stop();
  const s = store();
  const { doc, ui } = s.get();
  const r = playRange(doc);
  const loops = ui.loopPlayback && r.clipLoops;
  let f = ui.frame;
  if (f < r.start || f > r.end || (!loops && f === r.end && r.end > r.start)) f = r.start;
  const t = scheduler.now();
  // Set up before moving the playhead: that change comes straight back through the store subscription.
  const mine: Run = { handle: null, t0: t, from: f - r.start, lastTick: t, shown: f, doc };
  run = mine;
  if (f !== ui.frame) s.setUi({ frame: f });
  mine.handle = scheduler.request(tick);
}

function tick(): void {
  const cur = run;
  if (!cur) return;
  const s = store();
  const { doc, ui } = s.get();
  if (!ui.playing) return stop();
  if (doc !== cur.doc) return void s.setUi({ playing: false });
  const t = scheduler.now();
  const r = playRange(doc);
  const len = r.end - r.start + 1;
  // Someone scrubbed (or stepped) while it was playing: carry on from where they put it.
  if (ui.frame !== cur.shown && ui.frame >= r.start && ui.frame <= r.end) {
    cur.t0 = t;
    cur.from = ui.frame - r.start;
    cur.shown = ui.frame;
  } else if (t - cur.lastTick > STALL_MS) {
    cur.t0 = t;
    cur.from = cur.shown - r.start;
  }
  cur.lastTick = t;
  const idx = cur.from + Math.floor(((t - cur.t0) * doc.fps) / 1000);
  const loops = ui.loopPlayback && r.clipLoops;
  if (idx >= len && !loops) {
    s.setUi({ frame: r.end, playing: false });
    return stop();
  }
  const frame = r.start + (idx % len);
  if (frame !== ui.frame) s.setUi({ frame });
  cur.shown = frame;
  cur.handle = scheduler.request(tick);
}

/** Hooks the loop to a store's `ui.playing` flag. Returns a function that unhooks it. */
export function installPlayback(s: Store = store()): () => void {
  let lastDoc = s.get().doc;
  const off = s.subscribe(() => {
    const { doc, ui } = s.get();
    if (ui.playing && doc !== lastDoc) {
      lastDoc = doc;
      s.setUi({ playing: false });
      return;
    }
    lastDoc = doc;
    if (ui.playing && !run) begin();
    else if (!ui.playing && run) stop();
  });
  return () => {
    off();
    stop();
  };
}

export function isPlaying(): boolean {
  return store().get().ui.playing;
}

export function play(): void {
  store().setUi({ playing: true });
}

export function pause(): void {
  store().setUi({ playing: false });
}

export function togglePlay(): void {
  store().setUi((ui) => ({ playing: !ui.playing }));
}

/** Jumps to a frame (kept inside the animation). Stops playback, like grabbing the playhead. */
export function goTo(frame: number): void {
  const { doc } = store().get();
  const f = Math.max(0, Math.min(doc.length - 1, Math.round(frame)));
  store().setUi({ frame: f, playing: false });
}

export function stepFrame(by: number): void {
  goTo(store().get().ui.frame + by);
}

export function firstFrame(): void {
  goTo(playRange(store().get().doc).start);
}

export function lastFrame(): void {
  goTo(playRange(store().get().doc).end);
}

/** Jumps to the previous or next key (the start of a drawing) on the active layer. Returns false if there isn't one. */
export function stepKey(dir: 'prev' | 'next'): boolean {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return false;
  let to: number | undefined;
  for (const c of layer.cels) {
    if (dir === 'prev' && c.start < ui.frame) to = c.start;
    if (dir === 'next' && c.start > ui.frame) {
      to = c.start;
      break;
    }
  }
  if (to === undefined) return false;
  goTo(to);
  return true;
}
