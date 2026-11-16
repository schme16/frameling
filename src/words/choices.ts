// The words of the "ask once, then remember" choices: each choice's name, question, answers and the toast for an
// unasked answer. They live in choices.json so they can be read and edited in one place (npm run words:apply).
import data from './choices.json';
import { readWords, wordIds, type WordId } from './make';

export type ChoiceWordId = WordId<typeof data>;
// Marked pure so a build that has swapped every call for its words can leave this file out.
export const choiceWord = /* @__PURE__ */ readWords(data, 'src/words/choices.json');
export const choiceWordIds = (): ChoiceWordId[] => wordIds(data);
