// History: the panel that lists every step you have taken, to go back to any of them in one click, and the commands
// that go back or forward ten steps at a time. The steps themselves live in core/store.ts; the logic is in model.ts.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerPanel } from '../core/registry';
import { store } from '../core/store';
import { registerPanelInfo } from '../ui/panelInfo';
import './help';
import { BIG_JUMP, buildRows, targetByOffset } from './model';

registerPanel({ id: 'history', title: 'History', icon: 'history', component: lazyPanel(() => import('./HistoryPanel').then((m) => m.HistoryPanel)), zone: 'right', order: 88, help: 'history' });
registerPanelInfo('history', {
  blurb: 'Every step you have taken, newest first. Click one to go back to it, or keep it as a version.',
  group: 'more',
  keywords: ['undo', 'redo', 'steps', 'history', 'go back', 'time machine', 'versions'],
});

/** Goes `by` steps (negative is back) from where you are, in one go. */
function jumpBy(by: number): void {
  const { done, undone } = store().historyList();
  const target = targetByOffset(buildRows(done, undone), by);
  if (target !== undefined) store().jumpToStep(target);
}

registerCommands([
  {
    id: 'history.back',
    label: `Go back ${BIG_JUMP} steps`,
    category: 'Edit',
    keys: ['Mod+Alt+Z'],
    description: `Undo ${BIG_JUMP} steps at once (fewer if there are not that many). Redo brings them back.`,
    help: 'history',
    keywords: ['undo', 'many', 'steps', 'history', 'jump', 'back'],
    enabled: () => store().canUndo(),
    run: () => jumpBy(-BIG_JUMP),
  },
  {
    id: 'history.forward',
    label: `Go forward ${BIG_JUMP} steps`,
    category: 'Edit',
    keys: ['Mod+Alt+Shift+Z'],
    description: `Redo ${BIG_JUMP} steps at once (fewer if there are not that many).`,
    help: 'history',
    keywords: ['redo', 'many', 'steps', 'history', 'jump', 'forward'],
    enabled: () => store().canRedo(),
    run: () => jumpBy(BIG_JUMP),
  },
]);
