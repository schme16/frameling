// The one thing a live review asks that has two reasonable answers: what to do with the comments you have not kept when the
// review ends. Asked once, then remembered, and changed any time in Preferences > Behaviour.
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
  default: 'look',
  // Closing the question never loses anybody's words: they stay in the card until you decide.
  dismiss: 'look',
  category: 'Streaming',
  help: 'live-review',
});
