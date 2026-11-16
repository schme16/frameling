// Two questions about paper, both asked once and then remembered (Preferences > Behaviour lists them):
// picking a paper on a brush that keeps its own, and using a saved brush whose paper is not the sheet's.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

/** Which paper a pick changes, when the brush you are on keeps its own. */
export const PAPER_PINNED_CHOICE = 'paper.pinned';
/** Whether using a brush saved on another paper moves the sheet to it. */
export const PAPER_SAVED_CHOICE = 'paper.saved';

registerChoice<'brush' | 'sheet'>({
  id: PAPER_PINNED_CHOICE,
  title: choiceWord('choice.paper.pinned.title'),
  question: choiceWord('choice.paper.pinned.question'),
  category: 'Drawing',
  help: 'paper',
  default: 'brush',
  options: [
    { value: 'brush', label: choiceWord('choice.paper.pinned.brush.label'), detail: choiceWord('choice.paper.pinned.brush.detail'), did: choiceWord('choice.paper.pinned.brush.did') },
    { value: 'sheet', label: choiceWord('choice.paper.pinned.sheet.label'), detail: choiceWord('choice.paper.pinned.sheet.detail'), did: choiceWord('choice.paper.pinned.sheet.did') },
  ],
});

registerChoice<'sheet' | 'keep'>({
  id: PAPER_SAVED_CHOICE,
  title: choiceWord('choice.paper.saved.title'),
  question: choiceWord('choice.paper.saved.question'),
  category: 'Drawing',
  help: 'paper',
  default: 'sheet',
  options: [
    { value: 'sheet', label: choiceWord('choice.paper.saved.sheet.label'), detail: choiceWord('choice.paper.saved.sheet.detail'), did: choiceWord('choice.paper.saved.sheet.did') },
    { value: 'keep', label: choiceWord('choice.paper.saved.keep.label'), detail: choiceWord('choice.paper.saved.keep.detail'), did: choiceWord('choice.paper.saved.keep.did') },
  ],
});
