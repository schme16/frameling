// How quests show up in the rest of the app: commands (palette, menus), the Quests panel and the help topic.
import { registerCommands, registerHelp, registerPanel } from '../core/registry';
import { showPanel } from '../ui/dock';
import { QuestsPanel } from './QuestsPanel';
import { questProgress } from './registry';
import { putDownQuest, resumeQuest } from './runtime';

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
    run: () => void resumeQuest(),
  },
  {
    id: 'quests.stop',
    label: 'Put this quest down for now',
    category: 'Help',
    description: 'Hide the guide. You can carry on later.',
    help: 'quests',
    enabled: () => !!questProgress.get().active,
    run: () => putDownQuest(),
  },
]);

registerPanel({ id: 'quests', title: 'Quests', icon: 'sparkle', component: QuestsPanel, zone: 'right', order: 85, help: 'quests' });

// The UI shell registered a placeholder topic with this id. Registering after it (features.ts imports this last)
// replaces it.
registerHelp({
  id: 'quests',
  title: 'Quests',
  section: 'Getting started',
  media: 'quests-first-steps.mp4',
  summary: 'Short guided lessons that teach by doing, with a badge at the end of each.',
  keywords: ['tutorial', 'guide', 'lesson', 'learn', 'first animation', 'badge', 'show me', 'onboarding'],
  body: `A quest is a little lesson with a handful of steps. You do each step in the real app, and Frameling ticks it off by itself. Nothing is pretend: what you draw is your drawing.

## How it works

A small bar appears at the bottom left with what to do next, and a soft gold ring shows you where. The dots show how far along you are.

- **Show me** does the step for you, so you can watch how it is done. You can undo it like anything else.
- **Skip** moves on without doing the step.
- The cross puts the quest down for now. Open the **Quests** panel (or press the command palette and type "quest") and choose **Continue** to carry on from the same step.
- If you wait a while, the bar adds a quiet hint.

## The quests

- **Your first animation in 60 seconds** (Flipbooker). Draw something, copy it to the next frame, change it a little and press play. Onion skin is switched on for you, so you can see the last drawing as a faint ghost.
- **Bouncing ball** (Squash & Stretch). Open the example, scrub it, find the squashed frame and change how long a drawing is held.
- **Fill it in** (Paint Pot). Draw a closed shape, use the paint bucket, then try the Close gaps setting.
- **Pixel pal** (Pixel Pal). Make a tiny two-frame sprite on a pixel grid.
- **Share it** (Showtime). Open Export and choose Animated GIF. Nothing is saved, so there is nothing to undo.

The first quest opens the others. If you already know your way around, **Try it anyway** is there on every locked one.

## Little things

- Quests that need a particular drawing (the ball, a pixel page) ask before they replace what is open, and offer to save first.
- Your badges and place are remembered on this computer.
- If you have asked for less motion, the badge shows as a still card instead of confetti. Turn sounds on in Preferences for a soft chime.
- **Start the quests over** at the bottom of the panel forgets your badges.`,
});
