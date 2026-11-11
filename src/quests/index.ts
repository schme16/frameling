// Quests: guided "do this, then this" lessons that tick themselves off. Importing this registers the quests, the
// Quests panel, the commands and the help topic, and puts the guide bar on the page.
import './library';
import './commands';
import { mountQuestLayer } from './QuestLayer';

mountQuestLayer();

export { QuestEngine } from './engine';
export { allQuests, getQuest, questProgress, registerQuest, startQuest, stopQuest } from './registry';
export { playQuest, resumeQuest } from './runtime';
export type { Quest, QuestStep, QuestProgress } from './types';
