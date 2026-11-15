// The one question his presents raise: should he carry on making them? Asked after the first one, never before, so
// the first present is still a surprise. Changeable any time in Preferences > Behaviour.
import { registerChoice } from '../core/choices';
import { PRESENTS_CHOICE } from './gifts';
import { YOURS_CHOICE } from './made';
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

/** Whether his room shows what you have made. A preference, never a question: it is on, and this is how to turn it off. */
export function registerYoursChoice(): void {
  registerChoice<'show' | 'hide'>({
    id: YOURS_CHOICE,
    title: choiceWord('choice.quill.yours.title'),
    question: choiceWord('choice.quill.yours.question'),
    options: [
      { value: 'show', label: choiceWord('choice.quill.yours.show.label'), detail: choiceWord('choice.quill.yours.show.detail') },
      { value: 'hide', label: choiceWord('choice.quill.yours.hide.label'), detail: choiceWord('choice.quill.yours.hide.detail') },
    ],
    default: 'show',
    category: 'Quill',
    silent: true,
    help: 'quill-yours',
  });
}
