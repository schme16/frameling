// Draw on's remembered choice (see core/choices.ts). Preferences > Behaviour lists it. It is only asked when a shape is
// made of several separate outlines, since for one line both answers look the same.
import { registerChoice } from '../core/choices';

export type OrderChoice = 'together' | 'inOrder';

registerChoice<OrderChoice>({
  id: 'trim.order',
  title: 'A shape with several outlines drawing itself',
  question: 'This shape is made of several separate outlines. Should they all draw at the same time, or one after another like one long line?',
  category: 'Animation',
  default: 'together',
  help: 'You can change it for a shape any time in the Draw on panel. Drawing together fits a set of rings or a signature; one after another fits a path that goes round a map.',
  options: [
    { value: 'together', label: 'All at once', detail: 'Every outline draws at the same time, each by the same amount.', did: 'Made all the outlines draw at once.' },
    { value: 'inOrder', label: 'One after another', detail: 'The outlines draw in turn, as if they were one long line.', did: 'Made the outlines draw one after another.' },
  ],
});
