// The one question his presents raise: should he carry on making them? Asked after the first one, never before, so
// the first present is still a surprise. Changeable any time in Preferences > Behaviour.
import { registerChoice } from '../core/choices';
import { PRESENTS_CHOICE } from './gifts';
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
