// What Quill does when nothing is going on: he potters round his room. Pure functions over plain data (a random
// number is passed in), so the whole thing is tested without a window or a clock.
//
// Two rules the file is built around.
// 1. Nothing here ever makes him worse off. There's no hunger, no tiredness and no counter that grows while you're
//    away. What he does next depends only on what he did a moment ago and how things are right now, and the clock
//    that moves him on lives in the hook, which doesn't run when you aren't looking at him. Come back after a month
//    and he's just pottering.
// 2. It must not read as a loop. See `pickNext`: no repeats back to back, whatever he did lately is less likely,
//    where he goes and for how long both vary, and a few doings have more than one way of being done.
import type { Beat } from '../ui/mascot/timing';

export type Doing = 'wander' | 'draw' | 'window' | 'eat' | 'nap' | 'hop' | 'admire' | 'rest' | 'play';

export const DOINGS: readonly Doing[] = ['wander', 'draw', 'window', 'eat', 'nap', 'hop', 'admire', 'rest', 'play'];

/** The places in his room, as how far along it they are (0 is the left wall, 1 the right). */
export type Spot = 'bed' | 'window' | 'middle' | 'desk' | 'bowl';

export const SPOT_X: Record<Spot, number> = { bed: 0.14, window: 0.36, middle: 0.52, desk: 0.72, bowl: 0.88 };
export const SPOTS = Object.keys(SPOT_X) as Spot[];

/** The hop he makes to get somewhere, as long as the clip. */
export const TRAVEL_MS = 780;

/** A moment of pottering: what he's doing, where, for how long, and the clips that show it. */
export interface Move {
  doing: Doing;
  spot: Spot;
  /** What to play, travel first when he's changing place. The last beat stays on. */
  beats: Beat[];
  /** How long he stays at it, in ms. Always whole seconds, since the clock ticks once a second. */
  ms: number;
  /** Said in plain words under him. */
  words: string;
}

/** What's true right now that changes what he fancies. */
export interface PotterCtx {
  /** Whether he has tasted any colours, which is what he eats and admires. */
  hasColours: boolean;
  /** Milliseconds since anyone touched anything: the longer it's been quiet, the more he fancies a nap. */
  sinceInput: number;
  /** Whether a toy of yours is on his floor. Without one he has nothing to play with, so play is not on the list. */
  hasToy?: boolean;
}

export interface Potter {
  move: Move;
  /** ms left on this move. */
  left: number;
  /** What he did lately, newest last. Only used to vary the next thing. */
  history: Doing[];
}

/** How many of his recent doings count against doing the same again. */
export const MEMORY = 6;

const WEIGHT: Record<Doing, number> = { wander: 3, draw: 2.5, window: 2.5, eat: 1.5, nap: 1.2, hop: 1, admire: 1.2, rest: 2, play: 2 };

/** How long each doing lasts, in whole seconds [min, max]. */
const SECONDS: Record<Doing, [number, number]> = {
  wander: [3, 6],
  draw: [8, 16],
  window: [8, 18],
  eat: [5, 9],
  nap: [12, 26],
  hop: [2, 4],
  admire: [6, 10],
  rest: [4, 10],
  play: [6, 12],
};

/** A nap this long is a proper curl-up. */
const LONG_NAP_MS = 18_000;

const between = ([lo, hi]: [number, number], rng: () => number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

/** The doing the next one is picked from, with how much he fancies each. Exported for the tests. */
export function weights(history: Doing[], ctx: PotterCtx): Partial<Record<Doing, number>> {
  const recent = history.slice(-MEMORY);
  const out: Partial<Record<Doing, number>> = {};
  for (const d of DOINGS) {
    // Never the same as a moment ago, and the more he did it lately, the less he fancies it.
    if (d === recent[recent.length - 1]) continue;
    // Eating and admiring are about the colours he's tasted, so without any they aren't on the list.
    if ((d === 'eat' || d === 'admire') && !ctx.hasColours) continue;
    // Play is with the toy of yours on his floor, so with none there is nothing to play with.
    if (d === 'play' && !ctx.hasToy) continue;
    let w = WEIGHT[d] * 0.35 ** recent.filter((r) => r === d).length;
    if (d === 'nap') w *= ctx.sinceInput > 30_000 ? 2 : ctx.sinceInput < 8_000 ? 0.4 : 1;
    out[d] = w;
  }
  return out;
}

function chooseDoing(history: Doing[], ctx: PotterCtx, rng: () => number): Doing {
  const w = weights(history, ctx);
  const entries = Object.entries(w) as [Doing, number][];
  let r = rng() * entries.reduce((t, [, x]) => t + x, 0);
  for (const [d, x] of entries) {
    r -= x;
    if (r < 0) return d;
  }
  return entries[entries.length - 1][0];
}

const WORDS = {
  wander: ['Having a wander', 'Pottering about', 'Taking a stroll'],
  draw: ['Drawing something', 'Doodling at his desk'],
  window: ['Looking out of the window', 'Watching the clouds'],
  spotted: ['Spotted something outside'],
  eat: ['Having a snack', 'Munching a pencil colour'],
  nap: ['Having a nap'],
  curled: ['Curled up for a snooze'],
  hop: ['Hopping for no reason'],
  admire: ['Admiring a pencil'],
  rest: ['Having a sit', 'Thinking about nothing'],
  play: ['Playing with your sprite', 'Having a go with your toy', 'Batting your sprite about'],
} as const;

/** One way of doing a thing, so the same doing doesn't look the same every time. */
function variant(doing: Doing, ms: number, rng: () => number): { anim: Beat[]; words: string } {
  switch (doing) {
    case 'wander':
      return { anim: [{ anim: rng() < 0.7 ? 'idle' : 'think' }], words: pick(WORDS.wander, rng) };
    case 'draw':
      return { anim: [{ anim: 'draw' }], words: pick(WORDS.draw, rng) };
    case 'window':
      // Now and then something goes by outside and he points at it.
      return rng() < 0.25 ? { anim: [{ anim: 'point' }], words: pick(WORDS.spotted, rng) } : { anim: [{ anim: rng() < 0.6 ? 'think' : 'idle' }], words: pick(WORDS.window, rng) };
    case 'eat':
      return { anim: [{ anim: 'eat' }], words: pick(WORDS.eat, rng) };
    case 'nap': {
      // He nuzzles into the cushion first, and a long nap goes properly under.
      const long = ms >= LONG_NAP_MS;
      return { anim: [{ anim: 'nuzzle', hold: 2400 }, { anim: long ? 'deep-sleep' : 'sleep' }], words: long ? pick(WORDS.curled, rng) : pick(WORDS.nap, rng) };
    }
    case 'hop':
      return { anim: [{ anim: 'hop' }, { anim: 'idle' }], words: pick(WORDS.hop, rng) };
    case 'admire':
      return { anim: [{ anim: 'holding' }], words: pick(WORDS.admire, rng) };
    case 'rest':
      return { anim: [{ anim: 'idle' }], words: pick(WORDS.rest, rng) };
    case 'play':
      return { anim: [{ anim: 'hop' }, { anim: rng() < 0.5 ? 'point' : 'idle' }], words: pick(WORDS.play, rng) };
  }
}

/** Where a doing happens. Wandering goes somewhere else; the rest stay put unless they belong somewhere. */
function spotFor(doing: Doing, from: Spot, rng: () => number): Spot {
  switch (doing) {
    case 'draw':
      return 'desk';
    case 'window':
      return 'window';
    case 'eat':
      return 'bowl';
    case 'nap':
      return 'bed';
    case 'play':
      return 'middle';
    case 'wander':
      return pick(
        SPOTS.filter((s) => s !== from),
        rng,
      );
    default:
      return from;
  }
}

/** The next thing he does, from where he is and what he did lately. */
export function pickNext(history: Doing[], from: Spot, ctx: PotterCtx, rng: () => number): Move {
  const doing = chooseDoing(history, ctx, rng);
  const spot = spotFor(doing, from, rng);
  const stay = between(SECONDS[doing], rng) * 1000;
  const v = variant(doing, stay, rng);
  // Getting there is a hop. It's part of the move's time, so a long walk doesn't make him late for the next thing.
  const beats: Beat[] = spot === from ? v.anim : [{ anim: 'hop', hold: TRAVEL_MS }, ...v.anim];
  return { doing, spot, beats, ms: stay, words: v.words };
}

/** Where he starts: sitting in the middle for a few seconds, so opening the panel doesn't set him off at once. */
export function startPotter(): Potter {
  return { move: { doing: 'rest', spot: 'middle', beats: [{ anim: 'idle' }], ms: 5000, words: 'Pottering about' }, left: 5000, history: [] };
}

/** Moves a second on. Returns the same object when nothing changed, so a hook can tell. */
export function stepPotter(p: Potter, dt: number, ctx: PotterCtx, rng: () => number): Potter {
  const left = p.left - dt;
  if (left > 0) return { ...p, left };
  const history = [...p.history, p.move.doing].slice(-MEMORY);
  const move = pickNext(history, p.move.spot, ctx, rng);
  return { move, left: move.ms, history };
}

/** A small seeded random number generator, for tests and for the variety check. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- when he potters at all

/** Everything that decides whether the clock runs. */
export interface Gate {
  /** A Quill is actually being drawn in his house (the pet is on, Show Quill is on, and nothing outranks him). */
  shown: boolean;
  /** The panel is on screen: open, and not scrolled or folded out of sight. */
  onScreen: boolean;
  /** The window has focus. */
  focused: boolean;
  /** The page itself is in the background. */
  pageHidden: boolean;
  /** The animation is playing. Playback gets every bit of the machine. */
  playing: boolean;
  /** Reduced motion is on. */
  reduced: boolean;
}

/** Whether the once-a-second clock runs at all. When it doesn't, there is no timer: not a slow one, none. */
export function clockRuns(g: Gate): boolean {
  return g.shown && g.onScreen && g.focused && !g.pageHidden && !g.playing;
}

/** Whether he moves about. With reduced motion he settles in the middle and stays put. */
export function potters(g: Gate): boolean {
  return clockRuns(g) && !g.reduced;
}
