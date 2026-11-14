// The view commands for turning and flipping: how you look at the page, never what is on it.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { flipped, getTurn, isTurned, resetTurn, setTurn, turnedBy } from './turn';

/** The menus read ticks from the store, so nudge it after the view changes. */
const nudge = () => store().setUi({});

registerCommands([
  {
    id: 'view.flip',
    label: 'Flip view',
    category: 'View',
    keys: ['Mod+Alt+H'],
    description: 'Mirror the screen left to right, to spot a drawing that is off balance. Only the view: your drawing and exports stay as they are.',
    help: 'turn-flip-view',
    keywords: ['mirror', 'flip canvas', 'horizontal', 'check', 'balance', 'reverse', 'flip horizontal'],
    checked: () => getTurn().flip,
    run: () => {
      setTurn(flipped(getTurn()));
      nudge();
    },
  },
  {
    id: 'view.turnLeft',
    label: 'Turn view left',
    category: 'View',
    keys: ['Alt+,'],
    description: 'Turn the page a little anticlockwise (15 degrees), to reach a stroke comfortably. Only the view.',
    help: 'turn-flip-view',
    keywords: ['rotate', 'rotate canvas', 'turn canvas', 'anticlockwise', 'counterclockwise', 'angle'],
    run: () => {
      setTurn(turnedBy(getTurn(), -1));
      nudge();
    },
  },
  {
    id: 'view.turnRight',
    label: 'Turn view right',
    category: 'View',
    keys: ['Alt+.'],
    description: 'Turn the page a little clockwise (15 degrees), to reach a stroke comfortably. Only the view.',
    help: 'turn-flip-view',
    keywords: ['rotate', 'rotate canvas', 'turn canvas', 'clockwise', 'angle'],
    run: () => {
      setTurn(turnedBy(getTurn(), 1));
      nudge();
    },
  },
  {
    id: 'view.resetTurn',
    label: 'Reset view turn',
    category: 'View',
    keys: ['Mod+Shift+0'],
    description: 'Put the page back straight and unflipped.',
    help: 'turn-flip-view',
    keywords: ['unflip', 'straighten', 'reset rotation', 'upright', 'reset flip'],
    enabled: () => isTurned(getTurn()),
    run: () => {
      resetTurn();
      nudge();
    },
  },
]);
