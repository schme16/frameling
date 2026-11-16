// The one thing the clone stamp asks: when you lift the pen and start another stroke, does the copy carry on in step (aligned) or
// start from the spot you chose again? Both are what people expect from some other program, so it is asked once, right after the
// first stroke (the hand is off the pen then), and remembered. Changeable in Preferences > Behaviour and in the stamp's options.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export const CLONE_ALIGN_CHOICE = 'clone.align';
export type CloneAlign = 'aligned' | 'restart';

registerChoice<CloneAlign>({
  id: CLONE_ALIGN_CHOICE,
  title: choiceWord('choice.clone.align.title'),
  question: choiceWord('choice.clone.align.question'),
  category: 'Drawing',
  help: 'clone-stamp',
  default: 'aligned',
  options: [
    { value: 'aligned', label: choiceWord('choice.clone.align.aligned.label'), detail: choiceWord('choice.clone.align.aligned.detail'), did: choiceWord('choice.clone.align.aligned.did') },
    { value: 'restart', label: choiceWord('choice.clone.align.restart.label'), detail: choiceWord('choice.clone.align.restart.detail'), did: choiceWord('choice.clone.align.restart.did') },
  ],
});
