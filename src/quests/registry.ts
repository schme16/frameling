// The list of quests, and the shared progress store the welcome sheet and the panel read. Nothing here touches the
// app, so anything can import it without dragging the engine along.
import { createStore } from '../ui/mini';
import { ownedUndo } from '../core/owners';
import { localStorageOrNull, readSaved } from './saved';
import { FRESH_PROGRESS, type Quest, type QuestInfo, type QuestProgress } from './types';

// What is known of each quest. At start-up that is the catalog (names, icons, badges: `QuestInfo`); once the library
// has loaded, the whole `Quest` with its steps stands in for it.
const quests = new Map<string, QuestInfo>();

export function registerQuest(q: QuestInfo): void {
  quests.set(q.id, q);
  ownedUndo(() => {
    if (quests.get(q.id) === q) quests.delete(q.id);
  });
}
/** A quest to show (title, icon, badge...). It may not have its steps yet: see `getFullQuest`. */
export function getQuest(id: string): QuestInfo | undefined {
  return quests.get(id);
}
/** A quest with its steps, once the library has loaded (`loadQuests`) or when it was registered whole. */
export function getFullQuest(id: string): Quest | undefined {
  const q = quests.get(id);
  return q && 'steps' in q ? (q as Quest) : undefined;
}
/** Says whether a quest can be offered. The features code sets it: a quest that needs a feature that is off is left out. */
let available: (q: QuestInfo) => boolean = () => true;
export function setQuestAvailability(fn: ((q: QuestInfo) => boolean) | null): void {
  available = fn ?? (() => true);
}
/** Every quest that can be offered now. */
export function allQuests(): QuestInfo[] {
  return [...quests.values()].filter(available);
}

// What was finished or put down last time is known from the start, before the engine is there to read it.
export const questProgress = createStore<QuestProgress>({ ...FRESH_PROGRESS, ...readSaved(localStorageOrNull()) });

/** The runtime plugs this in when it loads, so the welcome sheet can start a quest without importing the runtime. */
type Starter = (id: string) => boolean;
let starter: Starter | null = null;
export function setStarter(fn: Starter | null): void {
  starter = fn;
}

/** Loads the quest steps and the engine that plays them (src/quests/boot.ts): the first time a quest starts or the panel opens. */
export function loadQuests(): Promise<void> {
  return import('./boot').then(() => undefined);
}

/** Starts (or restarts) a quest. False when there's no such quest. The steps and engine load first if they haven't yet. */
export function startQuest(id: string): boolean {
  const q = quests.get(id);
  if (!q || !available(q)) return false;
  if (starter) return starter(id);
  void loadQuests().then(() => starter?.(id));
  return true;
}

let stopper: (() => void) | null = null;
export function setStopper(fn: (() => void) | null): void {
  stopper = fn;
}
export function stopQuest(): void {
  stopper?.();
}

/** A quest is open when everything it needs has been finished. */
export function isUnlocked(q: QuestInfo, p: QuestProgress = questProgress.get()): boolean {
  return (q.requires ?? []).every((id) => p.completed.includes(id));
}
