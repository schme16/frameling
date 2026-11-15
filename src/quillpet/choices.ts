// The one question his presents raise: should he carry on making them? Asked after the first one, never before, so
// the first present is still a surprise. Changeable any time in Preferences > Behaviour.
import { registerChoice } from '../core/choices';
import { PRESENTS_CHOICE } from './gifts';
import { LATELY_CHOICE } from './welcome';
import { choiceWord } from '../words/choices';

export function registerPresentChoice(): void {
  registerChoice<'yes' | 'no'>({
    id: PRESENTS_CHOICE,
    title: choiceWord('choice.quill.presents.title'),
    question: choiceWord('choice.quill.presents.question'),
    options: [
      { value: 'yes', label: choiceWord('choice.quill.presents.yes.label'), detail: choiceWord('choice.quill.presents.yes.detail') },
      { value: 'no', label: choiceWord('choice.quill.presents.no.label'), detail: choiceWord('choice.quill.presents.no.detail') },
    ],
    default: 'yes',
    category: 'Quill',
    quill: true,
    help: 'quill-presents',
  });
}

/**
 * Whether he gets up to things when you're out. A preference more than a question, so it's never asked: it sits in
 * Preferences > Behaviour with its usual answer, and a room kept exactly as you left it is one click away.
 */
export function registerLatelyChoice(): void {
  registerChoice<'yes' | 'no'>({
    id: LATELY_CHOICE,
    title: choiceWord('choice.quill.lately.title'),
    question: choiceWord('choice.quill.lately.question'),
    options: [
      { value: 'yes', label: choiceWord('choice.quill.lately.yes.label'), detail: choiceWord('choice.quill.lately.yes.detail') },
      { value: 'no', label: choiceWord('choice.quill.lately.no.label'), detail: choiceWord('choice.quill.lately.no.detail') },
    ],
    default: 'yes',
    category: 'Quill',
    silent: true,
    help: 'quill-pet',
  });
}
