// Quests: guided "do this, then this" lessons that tick themselves off. Importing this registers the catalog (names and
// badges, for the welcome sheet and the panel), the Quests panel, the commands and the help topic. The steps, the engine
// and the guide bar load when a quest starts (boot.ts).
import './catalog';
import './commands';

export { allQuests, getQuest, loadQuests, questProgress, registerQuest, startQuest, stopQuest } from './registry';
export type { Quest, QuestInfo, QuestStep, QuestProgress } from './types';
