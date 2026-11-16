// The commands for lines that draw themselves, and the Draw on panel.
import { registerCommands, registerPanel } from '../core/registry';
import { lazyPanel } from '../core/lazy';
import { store } from '../core/store';
import { drawPickedLine, showWholeLine } from './ops';

const HELP = 'draw-on';
const KEYWORDS = ['trim', 'trim path', 'trim paths', 'draw on', 'write on', 'draw itself', 'stroke on', 'line draws', 'reveal', 'wipe', 'progress ring', 'signature', 'self drawing', 'start end offset', 'lottie trim', 'dash offset'];

registerPanel({
  id: 'draw-on',
  title: 'Draw on',
  icon: 'draw-on',
  component: lazyPanel(() => import('./TrimPanel').then((m) => m.TrimPanel)),
  zone: 'right',
  order: 36,
  startsAway: true,
  help: HELP,
});

const somethingPicked = (s: ReturnType<ReturnType<typeof store>['get']>): boolean => s.ui.selection.length > 0;

registerCommands([
  {
    id: 'trim.drawOn',
    label: 'Make the line draw itself',
    category: 'Animation',
    keys: ['Mod+Alt+W'],
    description: 'Picked brush lines and outlines start hidden on this frame and draw themselves in by the next key (a second later, if there is none yet). Drag the End slider on either key to change it.',
    help: HELP,
    keywords: KEYWORDS,
    enabled: somethingPicked,
    run: () => drawPickedLine('on'),
  },
  {
    id: 'trim.drawOff',
    label: 'Make the line erase itself',
    category: 'Animation',
    description: 'Picked brush lines and outlines start whole on this frame and rub themselves out, from their start, by the next key.',
    help: HELP,
    keywords: [...KEYWORDS, 'erase', 'undraw', 'draw off', 'rub out'],
    enabled: somethingPicked,
    run: () => drawPickedLine('off'),
  },
  {
    id: 'trim.whole',
    label: 'Show the whole line (take the draw on off)',
    category: 'Animation',
    description: 'Takes Start, End and Offset off the picked lines on every key, so all of each line shows again.',
    help: HELP,
    keywords: [...KEYWORDS, 'reset trim', 'remove trim', 'full line'],
    enabled: somethingPicked,
    run: () => showWholeLine(),
  },
]);
