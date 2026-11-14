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
import type { ClipDirection, Doc } from '../core/format';
import { clipDirection, clipPlays, cycleLength, directedPosition, entryPosition, holdPosition, indexOfPosition } from '../core/clipPlay';
import { findLayer } from '../core/doc';
import { store, type Store } from '../core/store';
import { tl } from './state';
import { inOutRange } from './inout';
import { frameDue, getPerf } from '../gpu/settings';

export { inOutRange };

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

/**
 * The first and last frame (inclusive) that play: the chosen clip, else the play range set on the ruler (in and out),
 * else the whole animation. A clip also says which way it plays (`direction`, null when it says nothing, so the
 * toolbar's back and forth switch decides) and how many times (`plays`, Infinity when it loops forever).
 */
export function playRange(doc: Doc, clipId: string | null = tl().clipId): { start: number; end: number; clipLoops: boolean; direction: ClipDirection | null; plays: number } {
  const last = Math.max(0, doc.length - 1);
  const clip = clipId ? doc.clips.find((c) => c.id === clipId) : undefined;
  if (!clip) {
    const io = inOutRange(doc);
    return io ? { ...io, clipLoops: true, direction: null, plays: Infinity } : { start: 0, end: last, clipLoops: true, direction: null, plays: Infinity };
  }
  const start = Math.max(0, Math.min(last, clip.start));
  const plays = clipPlays(clip);
  return { start, end: Math.max(start, Math.min(last, clip.end)), clipLoops: plays === Infinity, direction: clip.direction ? clipDirection(clip) : null, plays };
}

/** How the picked range plays right now: which way, and how many times (the Loop switch only matters when the clip says forever). */
function playing(r: ReturnType<typeof playRange>, ui: { loopPlayback: boolean; pingPong?: boolean }): { dir: ClipDirection; plays: number } {
  // The toolbar's back and forth switch plays there and back (two directions) each time, so a plain "once" is a full trip.
  const bounceSwitch = r.direction === null && !!ui.pingPong;
  return {
    dir: r.direction ?? (ui.pingPong ? 'pingpong' : 'forward'),
    plays: Number.isFinite(r.plays) ? (bounceSwitch ? r.plays * 2 : r.plays) : ui.loopPlayback ? Infinity : bounceSwitch ? 2 : 1,
  };
}

/**
 * Where playback is after `idx` steps through a range `len` frames long: the position in the range (0 = its first
 * frame), or done when it has reached the end and doesn't loop. Ping-pong goes forward then back (the ends show once
 * per turn), and without looping it stops when it's back at the start (there and back is two directions).
 */
export function stepPosition(idx: number, len: number, loops: boolean, pingPong: boolean): { pos: number; done: boolean } {
  return directedPosition(idx, len, pingPong ? 'pingpong' : 'forward', loops ? Infinity : pingPong ? 2 : 1);
}

/** The next `count` frames playback will show after `from`, in order, following the loop (or stopping at the end). */
export function upcomingFrames(doc: Doc, from: number, count: number, loop: boolean, clipId: string | null = tl().clipId, pingPong = false): number[] {
  const r = playRange(doc, clipId);
  const len = r.end - r.start + 1;
  const out: number[] = [];
  if (from < r.start || from > r.end) return out;
  const { dir, plays } = playing(r, { loopPlayback: loop, pingPong });
  const seen = new Set<number>();
  const at = indexOfPosition(from - r.start, len, dir);
  for (let k = 1; k <= count; k++) {
    const st = directedPosition(at + k, len, dir, plays);
    if (st.done) break;
    const f = r.start + st.pos;
    if (f === from) continue;
    if (seen.has(f)) break;
    seen.add(f);
    out.push(f);
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
  /** How many passes it has finished, to tell a loop it has come round. */
  pass: number;
  /** The frame we last wrote, to spot someone else moving the playhead. */
  shown: number;
  /** When a new frame last went up, for the frame rate cap in Preferences > Performance. */
  shownAt: number;
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
  const len = r.end - r.start + 1;
  const { dir, plays } = playing(r, ui);
  let f = ui.frame;
  // Pressed on a frame outside the range, or on the frame a finished clip holds: start from the beginning.
  const hold = r.start + holdPosition(len, dir, plays);
  if (f < r.start || f > r.end || (Number.isFinite(plays) && f === hold && r.end > r.start)) f = r.start + entryPosition(len, dir);
  const t = scheduler.now();
  // Set up before moving the playhead: that change comes straight back through the store subscription.
  const mine: Run = { handle: null, t0: t, from: indexOfPosition(f - r.start, len, dir), lastTick: t, pass: 0, shown: f, shownAt: t, doc };
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
  const { dir, plays } = playing(r, ui);
  // Someone scrubbed (or stepped) while it was playing: carry on from where they put it.
  if (ui.frame !== cur.shown && ui.frame >= r.start && ui.frame <= r.end) {
    cur.t0 = t;
    cur.from = indexOfPosition(ui.frame - r.start, len, dir);
    cur.pass = 0;
    cur.shown = ui.frame;
  } else if (t - cur.lastTick > STALL_MS) {
    cur.t0 = t;
    cur.from = indexOfPosition(cur.shown - r.start, len, dir);
    cur.pass = 0;
  }
  cur.lastTick = t;
  const idx = cur.from + Math.floor(((t - cur.t0) * doc.fps) / 1000);
  const st = directedPosition(idx, len, dir, plays);
  if (st.done) {
    s.setUi({ frame: r.start + st.pos, playing: false });
    return stop();
  }
  const pass = Math.floor(idx / cycleLength(len, dir));
  if (pass > cur.pass) {
    cur.pass = pass;
    if (plays === Infinity) for (const fn of [...passListeners]) fn();
  }
  const frame = r.start + st.pos;
  // With a cap, a new frame waits until it is due; the clock still decides which one, so nothing slows down.
  if (frame !== ui.frame && !frameDue(t, cur.shownAt, getPerf().fpsCap)) {
    cur.handle = scheduler.request(tick);
    return;
  }
  if (frame !== ui.frame) {
    s.setUi({ frame });
    cur.shownAt = t;
  }
  cur.shown = frame;
  cur.handle = scheduler.request(tick);
}

const passListeners = new Set<() => void>();
/** Calls `fn` each time a clip that repeats comes round to its start again while playing. Returns a function that stops it. */
export function onPlayPass(fn: () => void): () => void {
  passListeners.add(fn);
  return () => void passListeners.delete(fn);
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
