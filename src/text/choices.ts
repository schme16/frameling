// The text area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import type { ChoiceDef } from '../core/choices';
import type { SwapScope } from './fontSwap';
import type { ClickAway } from './pixel/session';
import { choiceWord } from '../words/choices';

const fontSwapScope: ChoiceDef<SwapScope> = {
  id: 'text.fontSwapScope',
  title: choiceWord('choice.text.fontSwapScope.title'),
  question: choiceWord('choice.text.fontSwapScope.question'),
  category: 'Draw',
  silent: true,
  default: 'missing',
  help: 'Where the Swap fonts window starts: only the fonts this computer does not have, or any font in the list. The buttons in the window change it. With no missing fonts it starts on every font.',
  options: [
    { value: 'missing', label: choiceWord('choice.text.fontSwapScope.missing.label'), detail: choiceWord('choice.text.fontSwapScope.missing.detail') },
    { value: 'all', label: choiceWord('choice.text.fontSwapScope.all.label'), detail: choiceWord('choice.text.fontSwapScope.all.detail') },
  ],
};

const pixelClickAway: ChoiceDef<ClickAway> = {
  id: 'text.pixelClickAway',
  title: choiceWord('choice.text.pixelClickAway.title'),
  question: choiceWord('choice.text.pixelClickAway.question'),
  category: 'Draw',
  silent: true,
  default: 'finish',
  help: 'Whether a click outside the words you are typing just finishes them, or finishes them and starts new words where you clicked. A click inside the words always moves the caret.',
  options: [
    { value: 'finish', label: choiceWord('choice.text.pixelClickAway.finish.label'), detail: choiceWord('choice.text.pixelClickAway.finish.detail') },
    { value: 'new', label: choiceWord('choice.text.pixelClickAway.new.label'), detail: choiceWord('choice.text.pixelClickAway.new.detail') },
  ],
};

export const textChoices = [fontSwapScope, pixelClickAway];
