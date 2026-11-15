// What Quill got up to when you weren't looking, and what he remembers. Pure functions over plain data (a random
// number is passed in), so the whole thing is tested without a window or a clock.
//
// The promise this file is built around, and the tests hold it.
// 1. Nothing here ever makes him worse off, and nothing here counts. How long you were out only decides how MANY
//    nice things he had time for, and the answer only ever goes up: nothing, one, two, three, four. It is used once,
//    to choose them, and then dropped. It is never kept, never shown and never worded: what is saved is only what he
//    did, and the words for it say what he did, never how long it took.
// 2. What he remembers is only what you gave him and the date you gave it. A date, never "how long ago".
// 3. Every one of his doings is a good one. He was fine. He was busy.
import type { Spot } from './potter';
import type { PetState } from './model';

export type HappeningKind = 'drew' | 'moved' | 'slept' | 'watched' | 'sorted' | 'found' | 'remembered';

/** One thing he did. `v` picks which of the ways of saying it, so a line reads the same every time you look. */
export type Happening =
  | { kind: 'drew'; v: number; seed: number; colours: string[] }
  | { kind: 'moved'; v: number; thingId: string; name: string; to: Spot }
  | { kind: 'slept'; v: number; spot: Spot }
  | { kind: 'remembered'; v: number; thingId: string; name: string; givenAt: number }
  | { kind: 'watched' | 'sorted' | 'found'; v: number };

/** What he got up to, and the day it was made, so one return only ever makes one lot. */
export interface Lately {
  day: string;
  did: Happening[];
  /** True once the news has been on screen, so it doesn't hang about for ever. */
  seen?: true;
}

/** The most he does at once. */
export const MOST_THINGS = 4;

/** A long break gives him a rarer thing to find. Which is only ever more to come back to, never less. */
export const RARE_AFTER = 21;

/**
 * How many things he had time for. This is the ONLY place the length of a break is used, it only goes up, and the
 * answer is a count of good things. 0 for the same day, because nothing needs saying.
 */
export function howMany(gapDays: number): number {
  if (!(gapDays >= 1)) return 0;
  if (gapDays < 3) return 1;
  if (gapDays < 10) return 2;
  if (gapDays < RARE_AFTER) return 3;
  return MOST_THINGS;
}

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ALL_SPOTS: readonly Spot[] = ['bed', 'window', 'middle', 'desk', 'bowl'];

/** The places he can fall asleep that aren't his bed, because the point is that it's somewhere new. */
export const NAP_SPOTS: readonly Spot[] = ['window', 'middle', 'desk', 'bowl'];

/** Where he fell asleep, in words ("Fell asleep {place}"). */
export const SLEPT_PLACE: Record<Spot, string> = {
  bed: 'on the bed',
  window: 'on the windowsill',
  middle: 'in the middle of the floor',
  desk: 'at the desk',
  bowl: 'by the bowl',
};

/** Where a toy ended up, in words ("{name} lives {place} now"). */
export const TOY_PLACE: Record<Spot, string> = {
  bed: 'by the bed',
  window: 'by the window',
  middle: 'in the middle of the room',
  desk: 'on the desk',
  bowl: 'by the bowl',
};

/** The plain words under him while he's found asleep somewhere new. */
export const sleptWords = (spot: Spot): string => `Fast asleep ${SLEPT_PLACE[spot]}`;

/** How many ways each doing has of being said (the count of its lines in lines.json). The tests keep this honest. */
export const WAYS: Record<HappeningKind, number> = { drew: 3, moved: 3, slept: 3, watched: 4, sorted: 2, found: 3, remembered: 2 };

const way = (kind: HappeningKind, rng: () => number): number => Math.floor(rng() * WAYS[kind]);

/**
 * What he got up to, given that you were out for `gapDays`. Every one of them is something nice: there is no sad one
 * in the list, so there is nothing a longer break could pick. Falls back on what is always possible (he naps, he
 * watches the window, he draws) so a brand new Quill has as much to show as one with a full shelf. Never repeats a kind.
 */
export function whatHeDid(pet: PetState, gapDays: number, rng: () => number): Happening[] {
  const count = howMany(gapDays);
  if (count === 0) return [];
  const things = pet.things;
  const pool: Array<() => Happening> = [
    () => ({ kind: 'drew', v: way('drew', rng), seed: Math.floor(rng() * 0x7fffffff), colours: pet.colours.slice(-4) }),
    () => ({ kind: 'slept', v: way('slept', rng), spot: pick(NAP_SPOTS, rng) }),
    () => ({ kind: 'watched', v: way('watched', rng) }),
  ];
  if (things.length) {
    pool.push(() => {
      const t = pick(things, rng);
      return { kind: 'moved', v: way('moved', rng), thingId: t.id, name: t.name, to: pick(ALL_SPOTS, rng) };
    });
    pool.push(() => {
      const t = pick(things, rng);
      return { kind: 'remembered', v: way('remembered', rng), thingId: t.id, name: t.name, givenAt: t.givenAt };
    });
  }
  if (pet.colours.length > 1) pool.push(() => ({ kind: 'sorted', v: way('sorted', rng) }));

  // The rare find comes first when a long break earns it, so it's never the thing that gets cut.
  const rare: Happening[] = gapDays >= RARE_AFTER ? [{ kind: 'found', v: way('found', rng) }] : [];
  const rest = shuffled(pool, rng)
    .slice(0, Math.max(0, count - rare.length))
    .map((make) => make());
  return [...rare, ...rest];
}

/**
 * Returns a pet that has come back to find things done, or the same pet when there is nothing to add: the same day,
 * or the news for today is already made (so closing and opening the app again changes nothing).
 */
export function comeBack(pet: PetState, gapDays: number, today: string, rng: () => number): PetState {
  if (pet.lately?.day === today) return pet;
  const did = whatHeDid(pet, gapDays, rng);
  if (!did.length) return pet;
  return { ...pet, lately: { day: today, did } };
}

/** Marks the news as looked at. The same pet when it already is, or when there is none. */
export function markLatelySeen(pet: PetState): PetState {
  if (!pet.lately || pet.lately.seen) return pet;
  return { ...pet, lately: { ...pet.lately, seen: true } };
}

/** Whether the news should be on show: made today, or not looked at yet. Never because of how old it is. */
export function latelyShowing(pet: PetState, today: string): Lately | undefined {
  const l = pet.lately;
  if (!l || !l.did.length) return undefined;
  return l.day === today || !l.seen ? l : undefined;
}

// ---------------------------------------------------------------- what he remembers

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayNumber = (ms: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * When he was given something, as a date: "today", "yesterday", "on 3 March", "on 3 March 2025". Never "3 weeks ago".
 * A date says when you gave it. A count of days would say, to anyone who wants to read it that way, how long you had
 * been gone, and he doesn't keep that.
 */
export function whenGiven(givenAt: number, now: number = Date.now()): string {
  if (!givenAt) return 'once';
  const diff = Math.round((dayNumber(now) - dayNumber(givenAt)) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  const d = new Date(givenAt);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `on ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

// ---------------------------------------------------------------- what he drew

const FALLBACK = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f'];
const HEX = /^#[0-9a-f]{3,8}$/i;

/** A drawing of his, as a data URL of a small SVG. His own colours where he has any. The same seed gives the same picture. */
export function doodleUrl(seed: number, colours: readonly string[]): string {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const own = colours.filter((c) => HEX.test(c));
  const ink = (i: number) => (own.length ? own[i % own.length] : FALLBACK[i % FALLBACK.length]);
  const j = (n: number) => +(n + (rng() - 0.5) * 3).toFixed(1);
  const stroke = (pts: Array<[number, number]>, col: string) =>
    `<path d="M${pts.map(([x, y]) => `${j(x)} ${j(y)}`).join(' L')}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ring = (cx: number, cy: number, r: number, col: string, n = 14) =>
    stroke(
      Array.from({ length: n + 2 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]),
      col,
    );
  const subject = Math.floor(rng() * 4);
  let body = '';
  if (subject === 0) {
    // a sun over a hill
    body += ring(46, 15, 7, ink(0));
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      body += stroke([[46 + Math.cos(t) * 10, 15 + Math.sin(t) * 10], [46 + Math.cos(t) * 14, 15 + Math.sin(t) * 14]], ink(0));
    }
    body += stroke([[4, 44], [18, 30], [34, 36], [48, 28], [60, 44]], ink(1));
  } else if (subject === 1) {
    // a house
    body += stroke([[16, 44], [16, 26], [46, 26], [46, 44], [16, 44]], ink(0));
    body += stroke([[12, 27], [31, 10], [50, 27]], ink(1));
    body += stroke([[28, 44], [28, 34], [36, 34], [36, 44]], ink(2));
  } else if (subject === 2) {
    // a flower
    body += stroke([[32, 44], [32, 26]], ink(1));
    body += stroke([[32, 36], [42, 32]], ink(1));
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2;
      body += ring(32 + Math.cos(t) * 7, 18 + Math.sin(t) * 7, 4.5, ink(0), 9);
    }
    body += ring(32, 18, 3, ink(2), 8);
  } else {
    // a fish
    body += stroke([[14, 28], [26, 17], [42, 20], [50, 28], [42, 36], [26, 39], [14, 28]], ink(0));
    body += stroke([[50, 28], [60, 18], [60, 38], [50, 28]], ink(1));
    body += ring(24, 26, 1.6, ink(2), 6);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="4" fill="#fffdf6"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------- reading it back

const SPOT_NAMES: readonly string[] = ALL_SPOTS;
const KINDS: HappeningKind[] = ['drew', 'moved', 'slept', 'watched', 'sorted', 'found', 'remembered'];

/** Reads saved news back, dropping anything that doesn't look right. Never throws. */
export function readLately(x: unknown): Lately | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const v = x as Partial<Lately>;
  if (typeof v.day !== 'string' || !Array.isArray(v.did)) return undefined;
  const str = (s: unknown): s is string => typeof s === 'string';
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const did: Happening[] = [];
  for (const raw of v.did.slice(0, MOST_THINGS)) {
    const h = raw as Record<string, unknown> | null;
    if (!h || typeof h !== 'object' || !KINDS.includes(h.kind as HappeningKind) || !num(h.v)) continue;
    const kind = h.kind as HappeningKind;
    const vv = Math.max(0, Math.min(WAYS[kind] - 1, Math.floor(h.v)));
    if (kind === 'drew') {
      if (!num(h.seed)) continue;
      did.push({ kind, v: vv, seed: h.seed, colours: Array.isArray(h.colours) ? h.colours.filter(str).filter((c) => HEX.test(c)).slice(0, 4) : [] });
    } else if (kind === 'moved') {
      if (!str(h.thingId) || !str(h.name) || !str(h.to) || !SPOT_NAMES.includes(h.to)) continue;
      did.push({ kind, v: vv, thingId: h.thingId, name: h.name, to: h.to as Spot });
    } else if (kind === 'slept') {
      if (!str(h.spot) || !SPOT_NAMES.includes(h.spot)) continue;
      did.push({ kind, v: vv, spot: h.spot as Spot });
    } else if (kind === 'remembered') {
      if (!str(h.thingId) || !str(h.name) || !num(h.givenAt)) continue;
      did.push({ kind, v: vv, thingId: h.thingId, name: h.name, givenAt: h.givenAt });
    } else {
      did.push({ kind, v: vv });
    }
  }
  return did.length ? { day: v.day, did, ...(v.seen ? { seen: true as const } : {}) } : undefined;
}
