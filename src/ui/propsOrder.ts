// Which section leads Properties. Colours first is the default (the colours you draw with stay in one place); the
// other answer puts the sections about what you picked first. A quiet choice: it is never asked, only changed in
// Preferences > Behaviour.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type PropsOrder = 'colours' | 'selection';
export const PROPS_ORDER_CHOICE = 'props.order';
/** The Properties section that holds the fill and stroke colours. */
export const COLOURS: string = 'colors';

registerChoice<PropsOrder>({
  id: PROPS_ORDER_CHOICE,
  title: choiceWord('choice.props.order.title'),
  question: choiceWord('choice.props.order.question'),
  category: 'View',
  default: 'colours',
  silent: true,
  help: 'properties',
  options: [
    { value: 'colours', label: choiceWord('choice.props.order.colours.label'), detail: choiceWord('choice.props.order.colours.detail') },
    { value: 'selection', label: choiceWord('choice.props.order.selection.label'), detail: choiceWord('choice.props.order.selection.detail') },
  ],
});
