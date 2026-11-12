// The list of quests, and the shared progress store the welcome sheet and the panel read. Nothing here touches the
// app, so anything can import it without dragging the engine along.
import { createStore } from '../ui/mini';
import { ownedUndo } from '../core/owners';
import { FRESH_PROGRESS, type Quest, type QuestProgress } from './types';

const quests = new Map<string, Quest>();

export function registerQuest(q: Quest): void {
  quests.set(q.id, q);
  ownedUndo(() => {
    if (quests.get(q.id) === q) quests.delete(q.id);
  });
}
export function getQuest(id: string): Quest | undefined {
  return quests.get(id);
}
/** Says whether a quest can be offered. The features code sets it: a quest that needs a feature that is off is left out. */
let available: (q: Quest) => boolean = () => true;
export function setQuestAvailability(fn: ((q: Quest) => boolean) | null): void {
  available = fn ?? (() => true);
}
/** Every quest that can be offered now. */
export function allQuests(): Quest[] {
  return [...quests.values()].filter(available);
}

export const questProgress = createStore<QuestProgress>({ ...FRESH_PROGRESS });

/** The runtime plugs this in when it loads, so the welcome sheet can start a quest without importing the runtime. */
type Starter = (id: string) => boolean;
let starter: Starter | null = null;
export function setStarter(fn: Starter | null): void {
  starter = fn;
}

/** Starts (or restarts) a quest. False when there's no such quest. */
export function startQuest(id: string): boolean {
  const q = quests.get(id);
  if (!q || !available(q)) return false;
  return starter ? starter(id) : false;
}

let stopper: (() => void) | null = null;
export function setStopper(fn: (() => void) | null): void {
  stopper = fn;
}
export function stopQuest(): void {
  stopper?.();
}

/** A quest is open when everything it needs has been finished. */
export function isUnlocked(q: Quest, p: QuestProgress = questProgress.get()): boolean {
  return (q.requires ?? []).every((id) => p.completed.includes(id));
}
