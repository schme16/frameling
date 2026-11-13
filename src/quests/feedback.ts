// The little cheers: a one-word "Nice!" when a step is ticked, and the badge card (with confetti) when a quest is
// finished. Plain state the components read; the runtime fills it in from engine events.
import { lines } from '../ui/mascot/lines';
import { createStore } from '../ui/mini';
import type { Badge, Quest } from './types';

export interface Celebration {
  key: number;
  quest: Quest;
  badge: Badge | null;
  /** Show a still badge instead of confetti (people who asked for less motion). */
  still: boolean;
}

export interface Feedback {
  /** `did` is the Great work card: it stays until the person presses Next. Without one, the cheer fades by itself. */
  praise: { key: number; text: string; did?: string } | null;
  celebration: Celebration | null;
}

export const feedback = createStore<Feedback>({ praise: null, celebration: null });

const WORDS = lines('quests.praise');
const PIXEL_WORDS = lines('pixel.quest.praise');
let key = 0;
let praiseTimer: ReturnType<typeof setTimeout> | null = null;
let partyTimer: ReturnType<typeof setTimeout> | null = null;

/** `pixel`: the cheers for pixel quests (Chunky! Crisp!). `did`: what was just done, which makes it a card with a Next button. */
export function praise(pixel = false, did?: string): void {
  if (praiseTimer) clearTimeout(praiseTimer);
  const k = ++key;
  feedback.set((f) => ({ ...f, praise: { key: k, text: (pixel ? PIXEL_WORDS : WORDS)[k % (pixel ? PIXEL_WORDS : WORDS).length], did } }));
  // A card waits for Next; a bare cheer gets out of the way on its own.
  if (!did) praiseTimer = setTimeout(() => feedback.set((f) => ({ ...f, praise: null })), 1800);
}

/** The Great work card's Next button, and anything else that moves on. */
export function clearPraise(): void {
  if (praiseTimer) clearTimeout(praiseTimer);
  praiseTimer = null;
  feedback.set((f) => (f.praise ? { ...f, praise: null } : f));
}

export function celebrate(quest: Quest, badge: Badge | null, still: boolean, ms = 9000): void {
  if (partyTimer) clearTimeout(partyTimer);
  feedback.set((f) => ({ ...f, praise: null, celebration: { key: ++key, quest, badge, still } }));
  partyTimer = setTimeout(dismissCelebration, ms);
}

export function dismissCelebration(): void {
  if (partyTimer) clearTimeout(partyTimer);
  partyTimer = null;
  feedback.set((f) => (f.celebration ? { ...f, celebration: null } : f));
}
