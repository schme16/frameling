// How quests show up in the rest of the app: commands (palette, menus), the Quests panel and the help topic.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerHelp, registerPanel } from '../core/registry';
import { showPanel } from '../ui/dock';
import { cardState, toggleTuck, unpinCard } from './cardState';
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
    id: 'quests.tuckCard',
    label: 'Tuck the quest card away, or bring it back',
    category: 'Help',
    description: 'Puts the quest card out of the way as a small bar, and one more press brings it straight back.',
    help: 'quest-card',
    keys: ['Alt+Q'],
    keywords: ['quest', 'hide', 'card', 'guide', 'move', 'out of the way', 'minimise'],
    enabled: () => !!questProgress.get().active,
    run: () => toggleTuck(),
  },
  {
    id: 'quests.cardHome',
    label: 'Let the quest card find its own place',
    category: 'Help',
    description: 'After you drag the quest card somewhere, this lets it choose a spot beside what the step points at again.',
    help: 'quest-card',
    keywords: ['quest', 'card', 'guide', 'move', 'reset', 'drag'],
    enabled: () => !!questProgress.get().active && !!cardState.get().pinned,
    run: () => unpinCard(),
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

// The card's own page: where it sits, how to move it, how to tuck it away.
registerHelp({
  id: 'quest-card',
  order: 6,
  title: 'The quest card',
  section: 'Getting started',
  media: 'quest-card.mp4',
  summary: 'It sits beside what a step points at, never over it. Drag it anywhere, or tuck it away for a moment.',
  keywords: ['quest', 'card', 'guide', 'move', 'drag', 'tuck', 'hide', 'out of the way', 'covering', 'bar', 'small window'],
});
