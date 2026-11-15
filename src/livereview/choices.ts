// The one thing a live review asks that has two reasonable answers: do a reviewer's comments go straight into your drawing, or
// wait in the card until you keep them. "Add them as they come" is the usual answer and is used without asking; the question
// is put only when comments are still waiting as the review ends (they were covered, or you chose to see them first).
// Changed any time in Preferences > Behaviour, or with the checkbox on the card.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type KeepChoice = 'all' | 'none' | 'look';

registerChoice<KeepChoice>({
  id: 'review.keep',
  title: choiceWord('choice.review.keep.title'),
  question: choiceWord('choice.review.keep.question'),
  options: [
    { value: 'all', label: choiceWord('choice.review.keep.all.label'), detail: choiceWord('choice.review.keep.all.detail'), did: choiceWord('choice.review.keep.all.did') },
    { value: 'none', label: choiceWord('choice.review.keep.none.label'), detail: choiceWord('choice.review.keep.none.detail'), did: choiceWord('choice.review.keep.none.did') },
    { value: 'look', label: choiceWord('choice.review.keep.look.label'), detail: choiceWord('choice.review.keep.look.detail'), did: choiceWord('choice.review.keep.look.did') },
  ],
  default: 'all',
  // Closing the question never loses anybody's words: they stay in the card until you decide.
  dismiss: 'look',
  category: 'Streaming',
  help: 'live-review',
});
