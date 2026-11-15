// Where Quill is. There is one of him, so only one place draws him at a time: whoever holds the highest claim.
//
// Every place that wants him (a toast, a quest, the pen check, onboarding, his own house) asks here instead of drawing
// him unconditionally. The ask is a **claim**, kept for as long as the place is on screen. The house holds the lowest
// claim, so he leaves it the moment anything else wants him and goes home when that lets go.
//
// The rule is held in three places so it can't quietly decay: `<Quill>` takes a required `surface` (a place that
// forgets one doesn't compile), this module only ever names one holder, and test/ui/quill-one-of-him.test.tsx fails if
// two surfaces hold at once or if a new place draws him without a claim.
import { useLayoutEffect } from 'react';
import { createStore } from '../mini';

/**
 * The places he can be, lowest claim first. Plain words for what each one is:
 * - house: his own panel, where he lives.
 * - ambient: a decoration that just sits there (the pixel bar, a preview corner).
 * - empty: the "nothing here yet" note in a list or a dialog.
 * - panel: a note inside a panel or page that stays open (quests list, a check page, a chooser).
 * - dialog: a question or a message in a dialog.
 * - quest: the lesson he's guiding, and its celebration.
 * - toast: a little message in the corner.
 * - check: the pen check, which talks you through a fault.
 * - onboarding: the first-run tour.
 * - hello: the welcome, the about box, and his goodbye. Nothing outranks these.
 */
export const SURFACES = ['house', 'ambient', 'empty', 'panel', 'dialog', 'quest', 'toast', 'check', 'onboarding', 'hello'] as const;
export type QuillSurface = (typeof SURFACES)[number];

/** How much each place wants him. Higher wins. The list order is the order, so there is one place to change it. */
export const PRIORITY: Record<QuillSurface, number> = Object.fromEntries(SURFACES.map((s, i) => [s, i])) as Record<QuillSurface, number>;

interface Claim {
  surface: QuillSurface;
  /** Who asked first, so two places of the same rank never both get him: the earlier one keeps him. */
  seq: number;
  /** A place and the Quill drawn inside it ask under the same key, so they count as one claim. */
  count: number;
}

const claims = new Map<string, Claim>();
let seq = 0;

/** The key of whoever holds him now, or null when nobody has asked. */
export const holder = createStore<string | null>(null);

/** A place's key: its surface, plus an id when several of the same kind can be open (two toasts). */
export const claimKey = (surface: QuillSurface, id = ''): string => (id ? `${surface}:${id}` : surface);

function decide(): void {
  let best: string | null = null;
  let bestClaim: Claim | null = null;
  for (const [key, c] of claims) {
    if (!bestClaim || PRIORITY[c.surface] > PRIORITY[bestClaim.surface] || (c.surface === bestClaim.surface && c.seq < bestClaim.seq)) {
      best = key;
      bestClaim = c;
    }
  }
  holder.set(best);
}

/** Asks for him. Gives back the way to let go. Asking twice under one key is one claim, let go when both have. */
export function claimQuill(surface: QuillSurface, id = ''): () => void {
  const key = claimKey(surface, id);
  const have = claims.get(key);
  if (have) have.count++;
  else claims.set(key, { surface, seq: seq++, count: 1 });
  decide();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const c = claims.get(key);
    if (!c) return;
    if (--c.count <= 0) claims.delete(key);
    decide();
  };
}

/** Everyone currently asking, highest claim first. Only the first of these holds him. For tests and the debug view. */
export function claimsNow(): string[] {
  return [...claims.entries()]
    .sort(([, a], [, b]) => PRIORITY[b.surface] - PRIORITY[a.surface] || a.seq - b.seq)
    .map(([key]) => key);
}

/** For tests: forget every claim. */
export function resetClaims(): void {
  claims.clear();
  holder.set(null);
}

export interface ClaimOptions {
  /** Distinguishes several of one kind of place (a toast's own id). */
  id?: string;
  /** False when this place isn't asking for him right now (a toast with no Quill in it). Default true. */
  wanted?: boolean;
}

/**
 * Keeps a claim for as long as the component is on screen and wants him, and says whether he's this place's to draw.
 * The claim is made before the screen paints, so a place that loses him never flashes him first.
 */
export function useQuillClaim(surface: QuillSurface, { id = '', wanted = true }: ClaimOptions = {}): boolean {
  useLayoutEffect(() => {
    if (!wanted) return;
    return claimQuill(surface, id);
  }, [surface, id, wanted]);
  const key = claimKey(surface, id);
  return holder.use((h) => h === key) && wanted;
}

/** True when someone else holds him: a place that wants him can say so ("he's out helping") rather than sit empty. */
export function useQuillElsewhere(surface: QuillSurface, id = ''): boolean {
  const key = claimKey(surface, id);
  return holder.use((h) => h !== null && h !== key);
}
