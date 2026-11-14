// Core commands that belong to no single area: undo and redo.
import { registerCommands, registerHelpTopics } from './registry';
import { store } from './store';

registerCommands([
  {
    id: 'edit.undo',
    label: 'Undo',
    category: 'Edit',
    keys: ['Mod+Z'],
    description: 'Take back the last change.',
    help: 'undo',
    enabled: () => store().canUndo(),
    run: () => store().undo(),
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    category: 'Edit',
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    description: 'Put back the change you just undid.',
    help: 'undo',
    enabled: () => store().canRedo(),
    run: () => store().redo(),
  },
]);

registerHelpTopics([
  {
    id: 'undo',
    order: 2,
    media: 'undo.mp4',
    title: 'Undo and redo',
    section: 'Basics',
    summary: 'Every change can be taken back with Undo, and put back with Redo.',
    keywords: ['mistake', 'back', 'revert', 'go back', 'oops', 'take back'],
    body: `Made a mistake? Press **Ctrl+Z** (**Cmd+Z** on a Mac) to undo it. Press it again to keep going back.

Changed your mind? **Ctrl+Shift+Z** (or **Ctrl+Y**) puts the change back.

Whatever you had selected stays selected after Undo or Redo, as long as it is still there.

Want to see your steps, or go back a long way in one click? Open the [History panel](help:history).

Frameling remembers your last 300 changes. Dragging something counts as one change, however long you drag for.

**Want more, or fewer?** **Preferences, General, Undo steps** sets how many to keep, from 20 to 2000. Pixel art makes heavy steps (a step can hold a whole layer), so a very long history stops growing once it is holding a lot, always keeping the newest ones.`,
  },
]);
