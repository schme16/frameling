// The stream overlay, the parts the desktop side (src/main) and the page (src/streamoverlay) both need: the shape of
// what the overlay may show, and the one function that decides what gets through. No Electron, no browser, so it is
// tested alone.
//
// The overlay is a web page on camera. So it is built the other way round from everything else: it is not handed the
// app's state and asked to hide the private parts, it is handed a short list of plain facts (this word, this many
// seconds, this count) and nothing else can ride along. `cleanOverlayState` is the gate: unknown fields are dropped,
// every word is cut, boiled down and scrubbed of paths, web addresses, @names, e-mail addresses and anything that
// looks like a key, and the whole thing is checked again on the desktop side before it is ever served.
import { withoutLinksAndMentions } from '../audience/cleanText';
import { scrubPathsAlways } from '../core/streamSafePure';

/** Where the overlay lives on the door's server. The address is `/overlay/<token>/`. */
export const OVERLAY_PREFIX = '/overlay';
/** How often the page asks for what is going on, in ms. */
export const OVERLAY_POLL_MS = 400;
/** A state older than this is treated as empty: the app has stopped telling us (it hung or went), so the page must not keep showing the last thing. */
export const OVERLAY_STALE_MS = 15_000;

/** What Quill may be doing on the overlay. A reaction maps to one of these; anything else becomes `cheer`. */
export const OVERLAY_ANIMS = ['cheer', 'hop', 'eat', 'nuzzle', 'wave', 'holding', 'think'] as const;
export type OverlayAnim = (typeof OVERLAY_ANIMS)[number];

export interface OverlayQuill {
  /** Changes with each new reaction, so the page can tell a fresh one from the same one still going. */
  id: number;
  anim: OverlayAnim;
  words: string;
  /** True when the words are on a sign Quill is holding up. */
  sign: boolean;
  /** When he goes (epoch ms). */
  until: number;
}
export interface OverlayBanner {
  text: string;
  startedAt: number;
  endsAt: number;
}
export interface OverlayCountdown {
  text: string;
  /** When it reaches zero (epoch ms). */
  endsAt: number;
  /** It has reached zero and says "Time!". */
  over: boolean;
  /** When "Time!" goes (epoch ms), when `over`. */
  until: number;
}
export interface OverlayChip {
  label: string;
  endsAt: number;
}
export interface OverlayPrompt {
  /** Changes with each pull. */
  id: number;
  text: string;
}
/** A vote in progress, or just over. Counts only: no names, no marks. */
export interface OverlayVote {
  status: 'open' | 'ended';
  question: string;
  options: { label: string; votes: number }[];
  /** When it ends by itself (epoch ms), or null when the streamer ends it. */
  endsAt: number | null;
  /** The winning option's index when it ended with one, else -1. */
  winner: number;
}

/** The app's theme colours, so the overlay wears the same ones. Plain #rrggbb only. */
export interface OverlayTheme {
  dark: boolean;
  text: string;
  raised: string;
  accent: string;
  line: string;
}

export interface OverlayState {
  /** The streamer's theme, or null for the page's own colours. Not something to show, so it does not count as "something is happening". */
  theme: OverlayTheme | null;
  quill: OverlayQuill | null;
  banner: OverlayBanner | null;
  countdown: OverlayCountdown | null;
  chips: OverlayChip[];
  prompt: OverlayPrompt | null;
  vote: OverlayVote | null;
}

export const emptyOverlay = (): OverlayState => ({ theme: null, quill: null, banner: null, countdown: null, chips: [], prompt: null, vote: null });

export const WORDS_MAX = 120;
export const LABEL_MAX = 40;
export const OPTIONS_MAX = 6;
export const CHIPS_MAX = 3;

// Characters that draw nothing or turn the text round: control marks, zero-width marks, text-direction marks.
const INVISIBLE = /[\p{C}​-‏‪-‮⁠-⁯﻿]/gu;
const EMAILS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Frameling's own keys (the door key, and anything shaped like one), and any long unbroken run that looks like a secret.
const KEYS = /\bfld_[\w-]{6,}/g;
const LONG_RUNS = /[A-Za-z0-9_-]{24,}/g;

/** Plain words for the overlay, cut to `max` characters. Anything not a string is ''. Pure. */
export function overlayText(raw: unknown, max: number = WORDS_MAX): string {
  if (typeof raw !== 'string') return '';
  // E-mail addresses first: the @ in one would otherwise be taken for a mention and leave half of it behind.
  const text = withoutLinksAndMentions(scrubPathsAlways(raw.slice(0, 600)).normalize('NFC').replace(EMAILS, ' '))
    .replace(KEYS, ' ')
    .replace(LONG_RUNS, ' ')
    .replace(/[\s ]+/g, ' ')
    .replace(INVISIBLE, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return Array.from(text).slice(0, max).join('').trim();
}

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Times further off than this are nonsense for a dare or a vote (a day), so the item is dropped. */
const FAR_MS = 24 * 3600 * 1000;
const sane = (t: number | null, now: number): t is number => t !== null && Math.abs(t - now) <= FAR_MS;

/**
 * Everything the overlay may carry, from whatever came in. Fields not listed here are never read, so they cannot get
 * through; an item that is wrong in any way is left out whole instead of repaired. `now` is the clock, for the sanity checks.
 */
export function cleanOverlayState(raw: unknown, now: number = Date.now()): OverlayState {
  const out = emptyOverlay();
  const o = obj(raw);
  if (!o) return out;

  const t = obj(o.theme);
  if (t && [t.text, t.raised, t.accent, t.line].every((c) => typeof c === 'string' && HEX.test(c))) {
    out.theme = { dark: t.dark === true, text: t.text as string, raised: t.raised as string, accent: t.accent as string, line: t.line as string };
  }

  const q = obj(o.quill);
  if (q) {
    const words = overlayText(q.words);
    const until = num(q.until);
    const anim = (OVERLAY_ANIMS as readonly unknown[]).includes(q.anim) ? (q.anim as OverlayAnim) : 'cheer';
    if (sane(until, now)) out.quill = { id: Math.trunc(num(q.id) ?? 0), anim, words, sign: q.sign === true, until };
  }

  const b = obj(o.banner);
  if (b) {
    const text = overlayText(b.text);
    const startedAt = num(b.startedAt);
    const endsAt = num(b.endsAt);
    if (text && sane(endsAt, now) && sane(startedAt, now)) out.banner = { text, startedAt, endsAt };
  }

  const c = obj(o.countdown);
  if (c) {
    const endsAt = num(c.endsAt);
    const until = num(c.until) ?? endsAt;
    if (sane(endsAt, now) && sane(until, now)) out.countdown = { text: overlayText(c.text, LABEL_MAX * 2), endsAt, over: c.over === true, until };
  }

  if (Array.isArray(o.chips)) {
    for (const x of o.chips.slice(0, CHIPS_MAX)) {
      const k = obj(x);
      const label = k ? overlayText(k.label, LABEL_MAX) : '';
      const endsAt = k ? num(k.endsAt) : null;
      if (label && sane(endsAt, now)) out.chips.push({ label, endsAt });
    }
  }

  const p = obj(o.prompt);
  if (p) {
    const text = overlayText(p.text);
    if (text) out.prompt = { id: Math.trunc(num(p.id) ?? 0), text };
  }

  const v = obj(o.vote);
  if (v && Array.isArray(v.options)) {
    const question = overlayText(v.question, 80);
    const options: OverlayVote['options'] = [];
    for (const x of v.options.slice(0, OPTIONS_MAX)) {
      const k = obj(x);
      const label = k ? overlayText(k.label, LABEL_MAX) : '';
      const votes = k ? num(k.votes) : null;
      if (!label || votes === null) {
        options.length = 0;
        break;
      }
      options.push({ label, votes: Math.max(0, Math.min(1_000_000, Math.trunc(votes))) });
    }
    const endsAt = v.endsAt === null || v.endsAt === undefined ? null : num(v.endsAt);
    if (options.length >= 2 && (v.status === 'open' || v.status === 'ended') && (endsAt === null || sane(endsAt, now))) {
      const w = num(v.winner);
      out.vote = { status: v.status, question, options, endsAt, winner: w !== null && Number.isInteger(w) && w >= 0 && w < options.length ? w : -1 };
    }
  }
  return out;
}

/** What is still true at `now`: a reaction, a countdown or a chip whose time has gone is dropped. The page and the server both use it. */
export function liveOverlay(s: OverlayState, now: number): OverlayState {
  return {
    theme: s.theme,
    quill: s.quill && s.quill.until > now ? s.quill : null,
    banner: s.banner && s.banner.endsAt > now ? s.banner : null,
    countdown: s.countdown && s.countdown.until > now ? s.countdown : null,
    chips: s.chips.filter((c) => c.endsAt > now),
    prompt: s.prompt,
    vote: s.vote,
  };
}

/** True when there is nothing at all to show. */
export const overlayIsEmpty = (s: OverlayState): boolean => !s.quill && !s.banner && !s.countdown && s.chips.length === 0 && !s.prompt && !s.vote;
