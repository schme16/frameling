// Everything that plays a quest, as one lazily loaded chunk: the steps and their checks (library.ts), the engine and its
// runtime, and the guide bar, ring and cheers on the page. The start-up only has the catalog (catalog.ts) and the
// registry; `loadQuests()` (registry.ts) brings this in the first time a quest starts, resumes or the panel opens.
import './library';
import { mountQuestLayer } from './QuestLayer';

mountQuestLayer();

export { engine, playQuest, putDownQuest, resumeQuest } from './runtime';
