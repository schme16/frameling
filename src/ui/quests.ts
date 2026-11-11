// Quests, as the UI shell sees them. The quests themselves, their engine and the guide bar live in src/quests; this
// keeps the names the welcome sheet imports pointing at the real thing.
// Loading the library and the runtime here means the welcome sheet always finds its quest and can start it.
import '../quests/library';
import '../quests/runtime';
export { allQuests, getQuest, isUnlocked, questProgress, registerQuest, startQuest, stopQuest } from '../quests/registry';
export type { Quest, QuestProgress, QuestStep } from '../quests/types';
