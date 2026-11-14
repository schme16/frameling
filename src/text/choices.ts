// The text area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import type { ChoiceDef } from '../core/choices';
import type { SwapScope } from './fontSwap';
import type { ClickAway } from './pixel/session';

const fontSwapScope: ChoiceDef<SwapScope> = {
  id: 'text.fontSwapScope',
  title: 'Swap fonts changes',
  question: 'When you swap fonts, which text should change?',
  category: 'Draw',
  silent: true,
  default: 'missing',
  help: 'Where the Swap fonts window starts: only the fonts this computer does not have, or any font in the list. The buttons in the window change it. With no missing fonts it starts on every font.',
  options: [
    { value: 'missing', label: 'Only the missing fonts', detail: 'Fonts that are here are left alone, so a swap fixes what is broken and nothing else.' },
    { value: 'all', label: 'Every font', detail: 'Any font in the list can be swapped for another.' },
  ],
};

const pixelClickAway: ChoiceDef<ClickAway> = {
  id: 'text.pixelClickAway',
  title: 'Clicking away from pixel text',
  question: 'When you are typing pixel text and click somewhere else on the picture, what should happen?',
  category: 'Draw',
  silent: true,
  default: 'finish',
  help: 'Whether a click outside the words you are typing just finishes them, or finishes them and starts new words where you clicked. A click inside the words always moves the caret.',
  options: [
    { value: 'finish', label: 'Just finish the words', detail: 'The click puts the pixels in the layer and nothing more. Click again to start new words.' },
    { value: 'new', label: 'Finish and start new words there', detail: 'Handy for labelling lots of things in a row: click, type, click the next place, type.' },
  ],
};

export const textChoices = [fontSwapScope, pixelClickAway];
