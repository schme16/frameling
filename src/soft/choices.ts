// The one thing soft paint asks: with Pixel perfect on, should a soft edge be dithered or smooth? Asked once, when a
// soft tool is first picked, then remembered (and changeable in Preferences > Behaviour).
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export const SOFT_EDGE_CHOICE = 'soft.edge';

registerChoice<'crisp' | 'smooth'>({
  id: SOFT_EDGE_CHOICE,
  title: choiceWord('choice.soft.edge.title'),
  question: choiceWord('choice.soft.edge.question'),
  category: 'Drawing',
  help: 'soft-paint',
  default: 'crisp',
  options: [
    { value: 'crisp', label: choiceWord('choice.soft.edge.crisp.label'), detail: choiceWord('choice.soft.edge.crisp.detail'), did: choiceWord('choice.soft.edge.crisp.did') },
    { value: 'smooth', label: choiceWord('choice.soft.edge.smooth.label'), detail: choiceWord('choice.soft.edge.smooth.detail'), did: choiceWord('choice.soft.edge.smooth.did') },
  ],
});
