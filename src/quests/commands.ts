// How quests show up in the rest of the app: commands (palette, menus), the Quests panel and the help topic.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerHelp, registerPanel } from '../core/registry';
import { showPanel } from '../ui/dock';
import { questProgress, stopQuest } from './registry';

registerCommands([
  {
    id: 'quests.open',
    label: 'Open the Quests panel',
    category: 'Help',
    description: 'Short guided lessons that teach by doing. Each one earns a badge.',
    help: 'quests',
    keywords: ['tutorial', 'lesson', 'learn', 'guide', 'badge', 'first animation'],
    run: () => showPanel('quests'),
  },
  {
    id: 'quests.resume',
    label: 'Carry on with my quest',
    category: 'Help',
    description: 'Pick up the quest you put down, from the step you were on.',
    help: 'quests',
    keywords: ['tutorial', 'continue', 'resume'],
    enabled: () => !!questProgress.get().paused,
    run: () => void import('./boot').then((b) => b.resumeQuest()),
  },
  {
    id: 'quests.stop',
    label: 'Put this quest down for now',
    category: 'Help',
    description: 'Hide the guide. You can carry on later.',
    help: 'quests',
    enabled: () => !!questProgress.get().active,
    run: () => stopQuest(),
  },
]);

registerPanel({ id: 'quests', title: 'Quests', icon: 'quest', component: lazyPanel(() => import('./QuestsPanel').then((m) => m.QuestsPanel)), zone: 'right', order: 85, help: 'quests' });

// The UI shell registered a placeholder topic with this id. Registering after it (features.ts imports this last)
// replaces it.
registerHelp({
  id: 'quests',
  order: 5,
  title: 'Quests',
  section: 'Getting started',
  media: 'quests-first-steps.mp4',
  summary: 'Short guided lessons that teach by doing, with a badge at the end of each.',
  keywords: ['tutorial', 'guide', 'lesson', 'learn', 'first animation', 'badge', 'show me', 'onboarding', 'quest groups'],
});
