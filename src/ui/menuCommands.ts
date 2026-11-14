// Changing the menus: the commands (palette and View menu) and the one question about new entries.
import { registerChoice } from '../core/choices';
import { registerCommands } from '../core/registry';
import { getMenuEdits, setMenuEdits } from './menuState';
import { isUnchanged } from './menuEdits';
import { openPrefs } from './overlays';
import { toast } from './toast';

/** What happens to a menu you changed when a newer Frameling adds something to it. */
export const NEW_ENTRIES_CHOICE = 'menus.newEntries';

registerChoice({
  id: NEW_ENTRIES_CHOICE,
  title: 'New things in a menu you changed',
  question: 'When Frameling adds something new to a menu you have changed, where should it go?',
  category: 'Menus',
  help: 'change-the-menus',
  default: 'add',
  // It is a setting more than a question: the usual answer is used, and Preferences > Behaviour changes it.
  silent: true,
  options: [
    {
      value: 'add',
      label: 'Put it in the menu',
      detail: 'It goes next to the entry it follows. Nothing you moved or took out comes back.',
    },
    {
      value: 'leave',
      label: 'Leave it out',
      detail: 'Your menus stay exactly as you made them. The new thing is still in the command search.',
    },
  ],
});

registerCommands([
  {
    id: 'view.changeMenus',
    label: 'Change the menus...',
    category: 'View',
    description: 'Move, rename, take out and add menu entries, and make menus of your own.',
    help: 'change-the-menus',
    keywords: ['menu bar', 'customise', 'customize', 'edit menus', 'rearrange', 'reorder', 'add to menu', 'remove from menu', 'my menu', 'submenu', 'hide menu'],
    run: () => openPrefs('menus'),
  },
  {
    id: 'view.menusReset',
    label: 'Put the menus back',
    category: 'View',
    description: 'Every menu back to how it came with Frameling, and your own menus gone.',
    help: 'change-the-menus',
    keywords: ['reset menus', 'default menus', 'restore menus', 'undo menu changes'],
    enabled: () => !isUnchanged(getMenuEdits()),
    run: () => {
      const before = getMenuEdits();
      setMenuEdits({ v: 1 });
      toast('The menus are back the way they came.', {
        kind: 'success',
        action: {
          label: 'Undo',
          id: 'menus-undo',
          run: () => setMenuEdits(before),
        },
      });
    },
  },
]);
