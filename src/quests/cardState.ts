// What the person has done with the quest card: dragged it somewhere, or tucked it away for a moment. Plain state the
// card and the commands read. The dragged place is remembered for the rest of the quest, then forgotten.
import { createStore } from '../ui/mini';
import type { Spot } from './place';

export interface CardState {
  /** The quest these belong to. A different quest starts afresh. */
  quest: string | null;
  /** Where it was dragged to, or null to let it find its own place. */
  pinned: Spot | null;
  /** Put out of the way as a small bar. */
  tucked: boolean;
  /** Asked to open although there is no room: shown over whatever hides least. */
  peek: boolean;
}

const FRESH: CardState = { quest: null, pinned: null, tucked: false, peek: false };

export const cardState = createStore<CardState>(FRESH);

/** A quest began or changed: its card starts afresh. The same quest picked up again keeps its place. */
export function cardForQuest(id: string | null): void {
  cardState.set((s) => (s.quest === id ? s : { ...FRESH, quest: id }));
}

/** A new step: the card comes back by itself, the dragged place stays. */
export function cardForStep(): void {
  cardState.set((s) => (s.tucked || s.peek ? { ...s, tucked: false, peek: false } : s));
}

export function pinCard(spot: Spot): void {
  cardState.set((s) => ({ ...s, pinned: { left: Math.round(spot.left), top: Math.round(spot.top) } }));
}

/** Let the card find its own place again. */
export function unpinCard(): void {
  cardState.set((s) => (s.pinned ? { ...s, pinned: null } : s));
}

export function tuckCard(on: boolean): void {
  cardState.set((s) => (s.tucked === on && !s.peek ? s : { ...s, tucked: on, peek: false }));
}

export function toggleTuck(): void {
  tuckCard(!cardState.get().tucked);
}

/** Open the card from the small bar where it could not fit without covering something. */
export function peekCard(on: boolean): void {
  cardState.set((s) => (s.peek === on ? s : { ...s, peek: on }));
}
