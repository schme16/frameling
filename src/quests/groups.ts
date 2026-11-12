// The headings the Quests panel sorts quests under. A quest can name its own group; otherwise it's looked up here.
import type { QuestInfo, QuestProgress } from './types';

export const QUEST_GROUPS = [
  { id: 'start', title: 'Getting started' },
  { id: 'drawing', title: 'Drawing and pixel art' },
  { id: 'motion', title: 'Motion' },
  { id: 'rigging', title: 'Rigging and effects' },
  { id: 'sharing', title: 'Sharing' },
  { id: 'more', title: 'More quests' },
] as const;

export type QuestGroupId = (typeof QUEST_GROUPS)[number]['id'];

const BY_QUEST: Record<string, QuestGroupId> = {
  'first-animation': 'start',
  'bouncing-ball': 'start',
  'fill-it-in': 'start',
  'pixel-pal': 'drawing',
  'shade-and-shine': 'drawing',
  tiles: 'drawing',
  'say-it-with-text': 'drawing',
  'first-tween': 'motion',
  'camera-move': 'motion',
  'bones-and-pose': 'rigging',
  'make-it-glow': 'rigging',
  'particle-party': 'rigging',
  'share-it': 'sharing',
};

export function questGroupOf(q: QuestInfo): QuestGroupId {
  return q.group ?? BY_QUEST[q.id] ?? 'more';
}

export interface QuestGroupView {
  id: QuestGroupId;
  title: string;
  quests: QuestInfo[];
  done: number;
}

/** Quests sorted under their headings, in heading order, keeping each quest's own order. Empty headings are left out. */
export function groupQuests(list: QuestInfo[], p: Pick<QuestProgress, 'completed'>): QuestGroupView[] {
  return QUEST_GROUPS.map((g) => {
    const quests = list.filter((q) => questGroupOf(q) === g.id);
    return { id: g.id, title: g.title, quests, done: quests.filter((q) => p.completed.includes(q.id)).length };
  }).filter((g) => g.quests.length > 0);
}
