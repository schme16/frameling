/**
 * How a clip plays: which way (forward, backward, back and forth) and how often (forever, N times, once). Pure
 * functions, shared by the timeline's playback and every exporter, so they all agree on the order of the frames.
 *
 * One pass is one trip through the clip. Forward plays 0..n-1 and backward n-1..0. Back and forth is 0..n-1 and then
 * back down to 0, with the end frames shown once per turn (no stutter): the pass is 0..n-1, n-2..1 and the frame it
 * returns to (0) is where it ends. A clip that repeats N times does N passes and then holds the frame it ends on.
 */
import type { Clip, ClipDirection } from './format';

export const CLIP_DIRECTIONS: ClipDirection[] = ['forward', 'reverse', 'pingpong', 'pingpong-reverse'];

/** Words for the direction, as shown in menus and help. */
export const DIRECTION_WORDS: Record<ClipDirection, string> = {
  forward: 'Forward',
  reverse: 'Backward',
  pingpong: 'Back and forth',
  'pingpong-reverse': 'Back and forth, from the end',
};

export const MAX_REPEAT = 999;

export type ClipPlaySpec = Pick<Clip, 'loop'> & Partial<Pick<Clip, 'direction' | 'repeat'>>;

export function isDirection(v: unknown): v is ClipDirection {
  return typeof v === 'string' && (CLIP_DIRECTIONS as string[]).includes(v);
}

/** The direction, forward when none is set. */
export function clipDirection(c: Partial<Pick<Clip, 'direction'>>): ClipDirection {
  return isDirection(c.direction) ? c.direction : 'forward';
}

/** How many passes it plays: Infinity when it loops forever. */
export function clipPlays(c: ClipPlaySpec): number {
  if (c.loop) return Infinity;
  return cleanRepeat(c.repeat) ?? 1;
}

/** A repeat count as a whole number from 1 to 999, or undefined when it is not one. */
export function cleanRepeat(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  return n >= 1 && n <= MAX_REPEAT ? n : undefined;
}

export const isReversed = (dir: ClipDirection): boolean => dir === 'reverse' || dir === 'pingpong-reverse';
export const isBackAndForth = (dir: ClipDirection): boolean => dir === 'pingpong' || dir === 'pingpong-reverse';

/** How many frames one pass shows before it starts again (the turn frames count once). */
export function cycleLength(len: number, dir: ClipDirection): number {
  if (len <= 1) return 1;
  return isBackAndForth(dir) ? 2 * len - 2 : len;
}

/** The positions (0 = the clip's first frame) one pass shows, in order. */
export function cyclePositions(len: number, dir: ClipDirection): number[] {
  const n = Math.max(1, len);
  const up = Array.from({ length: n }, (_, i) => i);
  const down = Array.from({ length: n }, (_, i) => n - 1 - i);
  switch (dir) {
    case 'reverse':
      return down;
    case 'pingpong':
      return n <= 1 ? [0] : [...up, ...down.slice(1, -1)];
    case 'pingpong-reverse':
      return n <= 1 ? [0] : [...down, ...up.slice(1, -1)];
    default:
      return up;
  }
}

/** The position it ends on (and holds) after its last pass. */
export function holdPosition(len: number, dir: ClipDirection): number {
  const n = Math.max(1, len);
  switch (dir) {
    case 'reverse':
      return 0;
    case 'pingpong':
      return 0;
    case 'pingpong-reverse':
      return n - 1;
    default:
      return n - 1;
  }
}

/** The position it starts on. */
export function entryPosition(len: number, dir: ClipDirection): number {
  return isReversed(dir) ? Math.max(1, len) - 1 : 0;
}

/**
 * Where playback is after `idx` steps (0 = the first frame shown) through `len` frames: the position (0 = the clip's
 * first frame), or done once the last pass has finished (the position is then the one it holds).
 */
export function directedPosition(idx: number, len: number, dir: ClipDirection, plays: number): { pos: number; done: boolean } {
  const n = Math.max(1, len);
  const cycle = cycleLength(n, dir);
  const total = plays * cycle;
  if (Number.isFinite(total) && idx >= total) return { pos: holdPosition(n, dir), done: true };
  if (n === 1) return { pos: 0, done: false };
  const i = Math.max(0, idx) % cycle;
  return { pos: cyclePositions(n, dir)[i], done: false };
}

/** The step count that shows `pos` going the way the clip plays (for carrying on from a frame somebody picked). */
export function indexOfPosition(pos: number, len: number, dir: ClipDirection): number {
  const n = Math.max(1, len);
  const p = Math.max(0, Math.min(n - 1, pos));
  return isReversed(dir) ? n - 1 - p : p;
}

/**
 * The whole order a clip shows, as positions, for formats that have no direction or repeat of their own (GIF, a
 * video, Godot's sprite frames). A clip that loops gives one pass (the format repeats it). A clip that plays N times
 * gives N passes, then the frame it holds when that is not already the last one shown.
 */
export function bakedPositions(len: number, dir: ClipDirection, plays: number): number[] {
  const pass = cyclePositions(len, dir);
  if (!Number.isFinite(plays)) return pass;
  const out: number[] = [];
  for (let i = 0; i < plays; i++) out.push(...pass);
  const hold = holdPosition(len, dir);
  if (out[out.length - 1] !== hold) out.push(hold);
  return out;
}

/** `frames` (a clip's frames in order) put in the order the clip plays them. */
export function bakeFrames<T>(frames: T[], dir: ClipDirection, plays: number): T[] {
  return bakedPositions(frames.length, dir, plays).map((p) => frames[p]);
}

/** The frame a finished clip holds (the clip's own frame numbers, start to end inclusive). */
export function holdFrame(c: Pick<Clip, 'start' | 'end' | 'direction'>): number {
  const a = Math.min(c.start, c.end);
  return a + holdPosition(Math.abs(c.end - c.start) + 1, clipDirection(c));
}

/** The frame a clip starts on (the clip's own frame numbers). */
export function entryFrame(c: Pick<Clip, 'start' | 'end' | 'direction'>): number {
  const a = Math.min(c.start, c.end);
  return a + entryPosition(Math.abs(c.end - c.start) + 1, clipDirection(c));
}

/** The frames of the whole clip in the order they play, once through (the clip's own frame numbers). */
export function clipOrder(c: Pick<Clip, 'start' | 'end' | 'loop' | 'direction' | 'repeat'>): number[] {
  const a = Math.min(c.start, c.end);
  const len = Math.abs(c.end - c.start) + 1;
  return bakedPositions(len, clipDirection(c), clipPlays(c)).map((p) => a + p);
}

/** True when the clip plays any way but once, forward: something an exporter has to carry. */
export function hasPlaySettings(c: Partial<Pick<Clip, 'direction' | 'repeat'>>): boolean {
  return clipDirection(c) !== 'forward' || (cleanRepeat(c.repeat) ?? 1) > 1;
}

/** A clip's direction and repeat in plain words, for lists and tooltips: "back and forth, 3 times" (empty when plain). */
export function playWords(c: ClipPlaySpec): string {
  const dir = clipDirection(c);
  const out: string[] = [];
  if (dir !== 'forward') out.push(DIRECTION_WORDS[dir].toLowerCase());
  if (c.loop) return out.concat('loops').join(', ');
  const n = clipPlays(c);
  if (n > 1) out.push(`${n} times`);
  return out.join(', ');
}

/** Cleans what was read from a file: only a known direction (and not 'forward', which is the default) and a whole repeat count are kept. */
export function readClipPlay(raw: { direction?: unknown; repeat?: unknown }): { direction?: ClipDirection; repeat?: number } {
  const out: { direction?: ClipDirection; repeat?: number } = {};
  if (isDirection(raw.direction) && raw.direction !== 'forward') out.direction = raw.direction;
  const r = cleanRepeat(raw.repeat);
  if (r !== undefined && r > 1) out.repeat = r;
  return out;
}

/** A clip from a file with its play settings checked: the rest is kept as it is, bad or default values are left out. */
export function readClip<T extends Record<string, unknown>>(raw: T): T {
  const { direction: _d, repeat: _r, ...rest } = raw;
  return { ...rest, ...readClipPlay(raw) } as T;
}
