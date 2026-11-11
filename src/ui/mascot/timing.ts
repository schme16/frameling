// Quill's sprite sheet and the maths of which frame shows when. Pure functions, no DOM, so they're easy to test.

export interface SheetFrame {
  x: number;
  y: number;
  ms: number;
}

export interface SheetAnim {
  frames: SheetFrame[];
  loop: boolean;
}

export interface Sheet {
  frameW: number;
  frameH: number;
  anims: Record<string, SheetAnim>;
}

export type QuillAnim = 'idle' | 'wave' | 'talk' | 'point' | 'cheer' | 'think' | 'draw' | 'sleep' | 'oops';

/** One step of a little performance: play `anim`, for `hold` ms if given (else once through, or forever if it loops). */
export interface Beat {
  anim: QuillAnim;
  hold?: number;
}

/** What to play: one anim name, or beats in order. The last beat stays on. */
export type Script = QuillAnim | Beat[];

const num = (v: unknown, min: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null);

/** Checks a mascot.json. Anything broken (a frame with no time, a missing size) gives null, and Quill just isn't drawn. */
export function parseSheet(raw: unknown): Sheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const frameW = num(r.frameW, 1);
  const frameH = num(r.frameH, 1);
  if (!frameW || !frameH || !r.anims || typeof r.anims !== 'object') return null;
  const anims: Record<string, SheetAnim> = {};
  for (const [name, a] of Object.entries(r.anims as Record<string, unknown>)) {
    const list = a && typeof a === 'object' ? (a as { frames?: unknown }).frames : null;
    if (!Array.isArray(list) || !list.length) continue;
    const frames: SheetFrame[] = [];
    for (const f of list) {
      const x = num(f?.x, 0);
      const y = num(f?.y, 0);
      const ms = num(f?.ms, 1);
      if (x === null || y === null || ms === null) break;
      frames.push({ x, y, ms });
    }
    if (frames.length === list.length) anims[name] = { frames, loop: !!(a as { loop?: unknown }).loop };
  }
  if (!Object.keys(anims).length) return null;
  return { frameW, frameH, anims };
}

export function totalMs(anim: SheetAnim): number {
  let t = 0;
  for (const f of anim.frames) t += f.ms;
  return t;
}

/** The anim actually used for a name: idle turns into sleep when Quill is bored, and anything missing falls back to idle. */
export function resolveAnim(sheet: Sheet, name: string, sleepy = false): string {
  if (name === 'idle' && sleepy && sheet.anims.sleep) return 'sleep';
  if (sheet.anims[name]) return name;
  if (sheet.anims.idle) return 'idle';
  return Object.keys(sheet.anims)[0];
}

export interface FrameAt {
  index: number;
  /** ms until the frame changes. Infinity when it never will (a one-frame loop, or a finished one-shot). */
  next: number;
  done: boolean;
}

/**
 * Which frame of `anim` shows `t` ms after it started. A loop wraps round; a one-shot stops on its last frame. With
 * `hold` the anim counts as done at that time instead (a loop stops looping, a one-shot waits on its last frame).
 */
export function frameAt(anim: SheetAnim, t: number, hold?: number): FrameAt {
  const total = totalMs(anim);
  const end = hold ?? (anim.loop ? Infinity : total);
  if (t >= end) {
    const last = anim.loop ? frameIn(anim, t % total) : { index: anim.frames.length - 1, next: Infinity };
    return { index: last.index, next: Infinity, done: true };
  }
  const local = anim.loop ? Math.max(0, t) % total : Math.max(0, t);
  const f = local >= total ? { index: anim.frames.length - 1, next: Infinity } : frameIn(anim, local);
  // A single-frame loop never changes; a held anim changes once more, when it's done.
  const next = anim.frames.length === 1 && anim.loop ? Infinity : f.next;
  return { index: f.index, next: Math.min(next, end - t), done: false };
}

function frameIn(anim: SheetAnim, local: number): { index: number; next: number } {
  let acc = 0;
  for (let i = 0; i < anim.frames.length; i++) {
    acc += anim.frames[i].ms;
    if (local < acc) return { index: i, next: acc - local };
  }
  return { index: anim.frames.length - 1, next: Infinity };
}

export function toBeats(script: Script, then?: QuillAnim): Beat[] {
  const beats = typeof script === 'string' ? [{ anim: script }] : script.length ? script : [{ anim: 'idle' as const }];
  return then ? [...beats, { anim: then }] : beats;
}

export interface Pose {
  /** The sheet anim showing (after resolveAnim). */
  anim: string;
  frame: SheetFrame;
  /** ms until something changes. */
  next: number;
  /** Which beat is playing. */
  beat: number;
  /** True once the last beat has finished (a one-shot ending, or its hold running out). */
  done: boolean;
}

export interface PoseOptions {
  sleepy?: boolean;
  /** Less motion: every anim shows its first frame and stays there, though beats still move on. */
  still?: boolean;
}

/** Where a script is `t` ms after it started. */
export function poseAt(sheet: Sheet, beats: Beat[], t: number, opts: PoseOptions = {}): Pose {
  let start = 0;
  for (let b = 0; b < beats.length; b++) {
    const beat = beats[b];
    const last = b === beats.length - 1;
    const name = resolveAnim(sheet, beat.anim, opts.sleepy && last);
    const anim = sheet.anims[name];
    // A beat with something after it plays once through even if the anim loops (a looping wave, then idle).
    const hold = beat.hold ?? (last ? undefined : totalMs(anim));
    const f = frameAt(anim, t - start, hold);
    if (!f.done || last) {
      if (opts.still) {
        const end = hold ?? (anim.loop ? Infinity : totalMs(anim));
        return { anim: name, frame: anim.frames[0], next: f.done ? Infinity : Math.max(0, start + end - t), beat: b, done: f.done };
      }
      return { anim: name, frame: anim.frames[f.index], next: f.next, beat: b, done: f.done };
    }
    start += hold!;
  }
  // Not reached: the last beat always returns.
  const a = sheet.anims[resolveAnim(sheet, 'idle')];
  return { anim: 'idle', frame: a.frames[0], next: Infinity, beat: beats.length - 1, done: true };
}

/** The integer scale for a wanted size. Below one frame's width it shrinks smoothly instead (tiny toasts). */
export function scaleFor(frameW: number, size: number): number {
  if (size >= frameW) return Math.max(1, Math.floor(size / frameW));
  return Math.max(0.25, size / frameW);
}
