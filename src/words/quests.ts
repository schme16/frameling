// The words of the quests: each one's name, summary, badge and finishing line, and every step's instruction, reason
// and hint. They live in quests.json so they can be read and edited in one place (npm run words:apply). The quest
// steps and checks stay in code (src/quests/library.ts and the quest.ts beside each feature).
import data from './quests.json';
import { readWords, wordIds, type WordId } from './make';

export type QuestWordId = WordId<typeof data>;
// Marked pure so a build that has swapped every call for its words can leave this file out.
export const questWord = /* @__PURE__ */ readWords(data, 'src/words/quests.json');
export const questWordIds = (): QuestWordId[] => wordIds(data);
