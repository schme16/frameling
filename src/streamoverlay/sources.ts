// What the stream overlay may show, and where each piece comes from. The overlay is on camera, so this is built from the
// bottom up: each piece is read from the one place that already holds it, turned into plain facts (a word, a time, a
// count), and nothing else is ever put on the list. src/shared/streamOverlay.ts checks it all again before it is served.
//
//   Quill        quillMoment (src/quillreacts/react.ts): a reaction, or a sign the streamer said yes to. Never the question.
//   Dare         dareScreen (src/dares/fx.ts): the banner, the countdown and a chip for each lasting dare.
//   Prompt       the slip in the streamer's hand (src/promptjar/jar.ts), only once the streamer lets it through. Never the jar.
//   Vote         overlayVote below. THE SEAM: the chat votes feature (src/votes) calls `overlayVote.set(fromVoteView(view))`
//                whenever its screen changes, and `overlayVote.set(null)` when it is closed. Until it does, there is no vote.
//   A test       overlayTest, for "Show a test on the stream overlay": made-up words, so nobody has to wait for chat.
//   Colours      the streamer's theme.
import { cssVar, subscribeTheme } from '../canvas/theme';
import { currentChoice } from '../core/choices';
import { dareScreen, type Held } from '../dares/fx';
import { jar } from '../promptjar/jar';
import { jarShown } from '../promptjar/card';
import { quillMoment } from '../quillreacts/react';
import { streamSafe, subscribeStreamSafe } from '../core/streamSafe';
import { createStore } from '../ui/mini';
import { getPrefs, subscribePrefs } from '../ui/prefs';
import { emptyOverlay, type OverlayState } from '../shared/streamOverlay';
import { noteStreamMark } from '../features/streamMarks';

/** A vote, as the overlay takes it. The shape of the votes feature's own view, so the adapter below is a few lines. */
export interface OverlayVoteInput {
  status: 'open' | 'ended';
  question: string;
  options: string[];
  counts: number[];
  endsAt: number | null;
  /** The winning option's index, or -1 (none, or a tie). */
  winner: number;
}

export const overlayVote = createStore<OverlayVoteInput | null>(null);

/** The votes feature's VoteView (and its outcome) as the overlay takes it. Counts and words only. */
export function fromVoteView(v: { status: 'open' | 'ended'; question: string; options: string[]; counts: number[]; endsAt: number | null; outcome?: { kind: string; index?: number } }): OverlayVoteInput {
  return { status: v.status, question: v.question, options: v.options, counts: v.counts, endsAt: v.endsAt, winner: v.outcome?.kind === 'winner' && typeof v.outcome.index === 'number' ? v.outcome.index : -1 };
}

/** A made-up moment, for the test. Nothing from anyone. */
export const overlayTest = createStore<{ until: number } | null>(null);
export const TEST_MS = 7000;

let testTimer: ReturnType<typeof setTimeout> | undefined;
/** Shows a made-up Quill, banner and prompt on the overlay for a few seconds. */
export function startOverlayTest(): void {
  clearTimeout(testTimer);
  noteStreamMark('overlayTest');
  const until = Date.now() + TEST_MS;
  overlayTest.set({ until });
  testTimer = setTimeout(() => overlayTest.set((t) => (t && t.until === until ? null : t)), TEST_MS + 50);
}

/** True when the overlay should show Quill: the streamer's choice, and Show Quill is on. */
const quillWanted = (): boolean => currentChoice('streamoverlay.quill') !== 'hide' && getPrefs().showQuill;

/**
 * Has the streamer let this slip go to a screen other people see? Sent straight away only when they chose so (and
 * Stream-safe is off). Otherwise it waits for "Show on stream" or, with Stream-safe on, "Show it".
 */
export function promptMayShow(slipId: number, shownId: number | null, safe: boolean, mode: string): boolean {
  if (shownId === slipId) return true;
  return mode === 'now' && !safe;
}

let overSince: number | null = null;

const held = (list: Held[], id: string): Held | undefined => list.find((h) => h.id === id);

/** What the overlay should show right now. Pure but for the clock and the stores it reads. */
export function buildOverlay(now: number = Date.now()): OverlayState {
  const out = emptyOverlay();
  const bg = cssVar('--canvas-bg', '#121019');
  out.theme = {
    dark: isDark(bg),
    text: hex(cssVar('--text', '#f4efe6'), '#f4efe6'),
    raised: hex(cssVar('--raised', '#322d43'), '#322d43'),
    accent: hex(cssVar('--accent', '#9b7bff'), '#9b7bff'),
    line: hex(cssVar('--line', '#4a4360'), '#4a4360'),
  };

  const test = overlayTest.get();
  if (test && test.until > now) {
    out.quill = { id: test.until, anim: 'wave', words: 'The overlay is working!', sign: false, until: test.until };
    out.banner = { text: 'This is a test banner', startedAt: test.until - TEST_MS, endsAt: test.until };
    out.prompt = { id: test.until, text: 'A test prompt: draw a hedgehog' };
    return out;
  }

  const q = quillMoment.get();
  if (q && quillWanted() && q.until > now) out.quill = { id: q.id, anim: q.anim, words: q.words, sign: q.sign, until: q.until };

  const d = dareScreen.get();
  const banner = held(d.held, 'dare.challenge');
  if (d.banner && banner) out.banner = { text: d.banner.text, startedAt: banner.startedAt, endsAt: banner.endsAt };
  const count = held(d.held, 'dare.countdown');
  if (d.countdown) {
    if (d.countdown.over) {
      overSince ??= now;
      out.countdown = { text: d.countdown.text, endsAt: overSince, over: true, until: overSince + 2500 };
    } else if (count) {
      overSince = null;
      out.countdown = { text: d.countdown.text, endsAt: count.endsAt, over: false, until: count.endsAt + 2500 };
    }
  } else {
    overSince = null;
  }
  out.chips = d.held.filter((h) => h.resource === 'view' || h.resource === 'colour').map((h) => ({ label: h.label, endsAt: h.endsAt }));

  const hand = jar.get().hand;
  if (hand && promptMayShow(hand.id, jarShown.get(), streamSafe(), currentChoice('streamoverlay.prompt'))) out.prompt = { id: hand.id, text: hand.text };

  const v = overlayVote.get();
  if (v) out.vote = { status: v.status, question: v.question, options: v.options.map((label, i) => ({ label, votes: v.counts[i] ?? 0 })), endsAt: v.endsAt, winner: v.winner };
  return out;
}

const hex = (c: string, fallback: string): string => (/^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : fallback);
function isDark(c: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c.trim());
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** Calls `fn` whenever anything the overlay shows may have changed. Returns the way to stop. */
export function subscribeSources(fn: () => void): () => void {
  const offs = [quillMoment.subscribe(fn), dareScreen.subscribe(fn), jar.subscribe(fn), jarShown.subscribe(fn), overlayVote.subscribe(fn), overlayTest.subscribe(fn), subscribeStreamSafe(fn), subscribeTheme(fn), subscribePrefs(fn)];
  return () => offs.forEach((o) => o());
}
