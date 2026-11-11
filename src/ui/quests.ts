// Quests: short guided "do this, then this" lessons. The engine that plays them (spotlight, ticking steps off,
// celebrating) comes later; this is the registry and the types it will build on, with one stub quest so the
// welcome sheet has something to point at.
import type { State } from '../core/store';
import { createStore } from './mini';

export interface QuestStep {
  id: string;
  /** What the guide says, in plain words ("Pick the brush and draw a wobbly circle"). */
  say: string;
  /** Becomes true when the step is done, so the quest can tick it off by itself. */
  done?: (s: State) => boolean;
  /** CSS selector of the thing to point at (`[data-command="tools.brush"]`). */
  highlight?: string;
  /** Help topic to open for "Tell me more". */
  help?: string;
}

export interface Quest {
  id: string;
  title: string;
  /** One friendly sentence for the welcome card. */
  summary: string;
  /** Roughly how long it takes. */
  minutes: number;
  /** Icon name from the icon set. */
  icon: string;
  steps: QuestStep[];
  /** Said when the last step is done. */
  finish?: string;
}

const quests = new Map<string, Quest>();

export function registerQuest(q: Quest): void {
  quests.set(q.id, q);
}
export function getQuest(id: string): Quest | undefined {
  return quests.get(id);
}
export function allQuests(): Quest[] {
  return [...quests.values()];
}

export interface QuestProgress {
  /** The quest being played, or null. */
  active: string | null;
  /** Step ids done so far, per quest. */
  done: Record<string, string[]>;
}

export const questProgress = createStore<QuestProgress>({ active: null, done: {} });

/** Starts (or restarts) a quest. For now it only records that it started; the engine will pick that up. */
export function startQuest(id: string): boolean {
  if (!quests.has(id)) return false;
  questProgress.set((p) => ({ active: id, done: { ...p.done, [id]: [] } }));
  return true;
}

export function stopQuest(): void {
  questProgress.set((p) => ({ ...p, active: null }));
}

registerQuest({
  id: 'first-animation',
  title: 'Your first animation in 60 seconds',
  summary: 'Draw a little thing, draw it again a bit different, press play. That is animation!',
  minutes: 1,
  icon: 'sparkle',
  finish: 'You made something move. That is the whole trick, everything else is more of it.',
  steps: [
    { id: 'draw', say: 'Pick the brush and draw something simple, like a ball.', highlight: '[data-command="tools.brush"]', help: 'drawing-basics' },
    { id: 'next-frame', say: 'Go to the next frame.', highlight: '[data-command="timeline.nextFrame"]', help: 'timeline' },
    { id: 'draw-again', say: 'Draw the ball again, a little way along.', help: 'onion-skin' },
    { id: 'play', say: 'Press play and watch it go!', highlight: '[data-command="timeline.play"]' },
  ],
});
