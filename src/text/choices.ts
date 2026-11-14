// The text area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import type { ChoiceDef } from '../core/choices';
import type { SwapScope } from './fontSwap';

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

export const textChoices = [fontSwapScope];
