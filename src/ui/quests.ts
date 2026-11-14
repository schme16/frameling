// Quests, as the UI shell sees them. The quests themselves, their engine and the guide bar live in src/quests; this
// keeps the names the welcome sheet imports pointing at the real thing.
// Loading the catalog here means the welcome sheet always finds its quest's card. Starting one loads the steps and the
// engine (src/quests/boot.ts) on the way.
import '../quests/catalog';
export { allQuests, getQuest, isUnlocked, loadQuests, questProgress, registerQuest, startQuest, stopQuest } from '../quests/registry';
export type { Quest, QuestInfo, QuestProgress, QuestStep } from '../quests/types';
