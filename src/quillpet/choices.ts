// The one question his presents raise: should he carry on making them? Asked after the first one, never before, so
// the first present is still a surprise. Changeable any time in Preferences > Behaviour.
import { registerChoice } from '../core/choices';
import { PRESENTS_CHOICE } from './gifts';

export function registerPresentChoice(): void {
  registerChoice<'yes' | 'no'>({
    id: PRESENTS_CHOICE,
    title: "Quill's presents",
    question: 'Quill made you something out of a drawing you gave him. Would you like him to do that now and then?',
    options: [
      { value: 'yes', label: 'Yes, now and then', detail: 'He makes you one once in a while, as a quiet toast you can ignore. Never more than one a day.' },
      { value: 'no', label: 'No thank you', detail: 'He keeps the drawings you give him and makes nothing from them.' },
    ],
    default: 'yes',
    category: 'Quill',
    quill: true,
    help: 'quill-presents',
  });
}
