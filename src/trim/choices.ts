// Draw on's remembered choice (see core/choices.ts). Preferences > Behaviour lists it. It is only asked when a shape is
// made of several separate outlines, since for one line both answers look the same.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type OrderChoice = 'together' | 'inOrder';

registerChoice<OrderChoice>({
  id: 'trim.order',
  title: choiceWord('choice.trim.order.title'),
  question: choiceWord('choice.trim.order.question'),
  category: 'Animation',
  default: 'together',
  help: 'You can change it for a shape any time in the Draw on panel. Drawing together fits a set of rings or a signature; one after another fits a path that goes round a map.',
  options: [
    { value: 'together', label: choiceWord('choice.trim.order.together.label'), detail: choiceWord('choice.trim.order.together.detail'), did: choiceWord('choice.trim.order.together.did') },
    { value: 'inOrder', label: choiceWord('choice.trim.order.inOrder.label'), detail: choiceWord('choice.trim.order.inOrder.detail'), did: choiceWord('choice.trim.order.inOrder.did') },
  ],
});
