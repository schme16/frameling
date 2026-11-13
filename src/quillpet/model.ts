// Quill as a pet: what he remembers and how he's feeling. Pure functions over plain data, so the whole thing can be
// tested without a window, a clock or a store.
//
// The one rule the whole model is built around: **nothing here ever makes Quill worse off.** Closeness only goes up,
// there is no meter that drains while you're away, and there is no unhappy mood to fall into. Come back after a
// month and he's delighted, not sulking. Every function below is written so that stays true, and the tests check it.
import type { QuillAnim } from '../ui/mascot/timing';

/** A thing you gave him: a drawing of yours, kept as a small picture. */
export interface PetThing {
  id: string;
  /** What it was called when you gave it ("Layer 1", the document's name, or what you typed). */
  name: string;
  /** A small PNG data URL. Kept little on purpose: this lives in localStorage. */
  picture: string;
  /** When you gave it, ms since epoch. */
  givenAt: number;
}

/** Everything Quill remembers between runs. */
export interface PetState {
  /** When you two met, ms since epoch. */
  metAt: number;
  /** How close you are. Only ever goes up. */
  closeness: number;
  /** Days you've spent drawing together. */
  days: number;
  /** The last day that counted, as `YYYY-MM-DD` in your own time, so a day counts once however long you're at it. */
  lastDay: string;
  /** What you've given him, oldest first. */
  things: PetThing[];
  /** Colours he's tasted, newest last. */
  colours: string[];
  /** Moments he's already made a fuss of, so he only does it once. */
  seen: string[];
}

export const FRESH_PET: PetState = { metAt: 0, closeness: 0, days: 0, lastDay: '', things: [], colours: [], seen: [] };

/** How many things and colours he keeps. Old ones drop off the front, nothing is ever taken as a punishment. */
export const MAX_THINGS = 24;
export const MAX_COLOURS = 12;

// ---------------------------------------------------------------- what he notices

/** Something that happened that Quill would care about. */
export type PetEvent =
  | { kind: 'drew' }
  | { kind: 'played' }
  | { kind: 'finished' }
  | { kind: 'quest' }
  | { kind: 'petted' }
  | { kind: 'gave'; thing: PetThing }
  | { kind: 'fed'; colour: string }
  | { kind: 'noticed'; colour: string }
  | { kind: 'visited' };

/** What each one is worth, and how many times a day it can count. A day's drawing is worth a lot, but not endless:
 *  the cap is there so closeness means "we've been at this a while", not "you left the app open". */
const WORTH: Record<PetEvent['kind'], { points: number; perDay: number }> = {
  drew: { points: 1, perDay: 40 },
  played: { points: 1, perDay: 10 },
  finished: { points: 5, perDay: 8 },
  quest: { points: 10, perDay: 20 },
  petted: { points: 1, perDay: 20 },
  gave: { points: 4, perDay: 12 },
  fed: { points: 2, perDay: 12 },
  // A colour he picks up just by watching you draw. Worth nothing, so drawing can't be used to farm closeness, but
  // it still goes in his quills.
  noticed: { points: 0, perDay: 0 },
  visited: { points: 3, perDay: 1 },
};

/** How many of each kind have counted today. Kept beside the saved state, not in it: a new day starts empty. */
export type DayCount = Partial<Record<PetEvent['kind'], number>>;

/** The day an instant falls on, in the person's own time zone. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days between two instants, by the day they fall on, never negative. */
export function daysBetween(from: number, to: number): number {
  if (!from || to <= from) return 0;
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.max(0, Math.round((day(to) - day(from)) / 86400000));
}

export interface Applied {
  pet: PetState;
  count: DayCount;
  /** Points actually added (0 when the day's cap for that kind is used up). */
  gained: number;
}

/** Takes in something that happened and gives back what Quill remembers now. Never lowers anything. */
export function apply(pet: PetState, count: DayCount, ev: PetEvent, at: number): Applied {
  const day = dayKey(at);
  // A new day: the caps start again, and the day itself counts once.
  const fresh = pet.lastDay !== day;
  const c: DayCount = fresh ? {} : { ...count };
  let next: PetState = fresh ? { ...pet, lastDay: day, days: pet.days + 1 } : pet;
  if (!next.metAt) next = { ...next, metAt: at };

  const worth = WORTH[ev.kind];
  const used = c[ev.kind] ?? 0;
  const gained = used >= worth.perDay ? 0 : worth.points;
  if (gained) c[ev.kind] = used + 1;

  if (ev.kind === 'gave') {
    const things = [...next.things.filter((t) => t.id !== ev.thing.id), ev.thing];
    next = { ...next, things: things.slice(-MAX_THINGS) };
  }
  if (ev.kind === 'fed' || ev.kind === 'noticed') {
    const colours = [...next.colours.filter((x) => x.toLowerCase() !== ev.colour.toLowerCase()), ev.colour];
    next = { ...next, colours: colours.slice(-MAX_COLOURS) };
  }
  // The only line that touches closeness, and it only ever adds.
  if (gained) next = { ...next, closeness: next.closeness + gained };
  return { pet: next, count: c, gained };
}

/** Takes one of his things away, because you asked. The only thing that ever shrinks, and never on its own. */
export function letGo(pet: PetState, id: string): PetState {
  return { ...pet, things: pet.things.filter((t) => t.id !== id) };
}

/** Marks a moment as made a fuss of, so he doesn't do it twice. */
export function markSeen(pet: PetState, id: string): PetState {
  return pet.seen.includes(id) ? pet : { ...pet, seen: [...pet.seen, id] };
}

// ---------------------------------------------------------------- how well you know each other

export interface Stage {
  id: string;
  /** What it's called, in plain words. */
  name: string;
  /** Closeness needed to reach it. */
  at: number;
}

export const STAGES: Stage[] = [
  { id: 'met', name: 'Just met', at: 0 },
  { id: 'friends', name: 'Friends', at: 30 },
  { id: 'good', name: 'Good friends', at: 120 },
  { id: 'best', name: 'Best friends', at: 350 },
  { id: 'always', name: 'Inseparable', at: 900 },
];

export function stageOf(closeness: number): Stage {
  let out = STAGES[0];
  for (const s of STAGES) if (closeness >= s.at) out = s;
  return out;
}

/** The next one along, and how far there is to go. Null once you're as close as it gets. */
export function nextStage(closeness: number): { stage: Stage; toGo: number } | null {
  const s = STAGES.find((x) => closeness < x.at);
  return s ? { stage: s, toGo: s.at - closeness } : null;
}

/** How far through the current step you are, 0 to 1. Full at the last one. */
export function stageProgress(closeness: number): number {
  const now = stageOf(closeness);
  const next = nextStage(closeness);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (closeness - now.at) / (next.stage.at - now.at)));
}

// ---------------------------------------------------------------- how he's feeling right now

/** Worked out fresh every time from what's happening, never stored, so it can't rot while you're away.
 *  There's no unhappy one in the list, and that's on purpose. */
export type Mood = 'asleep' | 'sleepy' | 'cosy' | 'curious' | 'happy' | 'excited' | 'proud';

/** What's going on, as the panel sees it. */
export interface NowCtx {
  /** Milliseconds since you last touched anything. */
  sinceInput: number;
  /** Milliseconds since your last edit, or Infinity if you haven't drawn this run. */
  sinceEdit: number;
  /** The animation is playing. */
  playing: boolean;
  /** You just finished something (exported, saved, ended a quest). */
  justFinished: boolean;
  /** You just gave him something, fed him or stroked him. */
  justFussed: boolean;
  /** Days since you were last here. */
  daysAway: number;
}

export const NO_NOW: NowCtx = { sinceInput: 0, sinceEdit: Infinity, playing: false, justFinished: false, justFussed: false, daysAway: 0 };

/** His mood, and the animation that goes with it. Order matters: the loudest thing wins. */
export function moodNow(ctx: NowCtx): { mood: Mood; anim: QuillAnim } {
  if (ctx.justFinished) return { mood: 'proud', anim: 'cheer' };
  if (ctx.justFussed) return { mood: 'happy', anim: 'cheer' };
  // Back after a break is a happy thing. This is the line that keeps him from ever sulking about it.
  if (ctx.daysAway >= 1 && ctx.sinceInput < 20000) return { mood: 'excited', anim: 'wave' };
  if (ctx.playing) return { mood: 'excited', anim: 'cheer' };
  if (ctx.sinceEdit < 4000) return { mood: 'happy', anim: 'draw' };
  if (ctx.sinceInput > 180000) return { mood: 'asleep', anim: 'sleep' };
  if (ctx.sinceInput > 60000) return { mood: 'sleepy', anim: 'idle' };
  if (ctx.sinceEdit < 60000) return { mood: 'curious', anim: 'think' };
  return { mood: 'cosy', anim: 'idle' };
}

/** What he's doing, said in plain words under his picture. */
export const MOOD_WORDS: Record<Mood, string> = {
  asleep: 'Fast asleep',
  sleepy: 'Dozing off',
  cosy: 'Pottering about',
  curious: 'Watching you work',
  happy: 'Happy',
  excited: 'Excited',
  proud: 'Proud of you',
};
