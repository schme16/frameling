// How quests show up in the rest of the app: commands (palette, menus), the Quests panel and the help topic.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerHelp, registerPanel } from '../core/registry';
import { showPanel } from '../ui/dock';
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
  body: `A quest is a little lesson with a handful of steps. You do each step in the real app, and Frameling ticks it off by itself.

## How it works

A small bar appears at the bottom left with what to do next, and a soft gold ring shows you where. [Quill](help:meet-quill) reads each step out in a speech bubble and points while the ring is showing. The dots show how far along you are.

- **Show me** does the step for you, so you can watch how it is done. You can undo it like anything else.
- **Skip** moves on without doing the step.
- The cross puts the quest down for now. Open the **Quests** panel (or press the command palette and type "quest") and choose **Continue** to carry on from the same step.
- If you wait a while, the bar adds a quiet hint.

## The quests

The panel sorts them under five headings, each with how many you have done (like 1/3).

**Getting started**
- **Your first animation in 60 seconds** (Flipbooker). Draw, copy to the next frame, change it a little, press play. Onion skin is on for you.
- **Bouncing ball** (Squash & Stretch). Scrub the example, find the squash and change how long it is held.
- **Fill it in** (Paint Pot). The paint bucket and Close gaps.

**Drawing and pixel art**
- **Pixel pal**, **Shade and shine** and **Tiles**: a tiny sprite, shading with the palette, and a seamless tile painted into a level.
- **Say it with text** (Wordsmith). Letters that [pop in and wave](help:text-animators).

**Motion**
- **Your first tween** (Smooth Mover). Draw once, let Frameling draw the frames between.
- **Camera move** (Director). A [camera](help:camera) pan with far hills that drift slower.

**Rigging and effects**
- **Bones and a pose** (Puppeteer). Give an arm [bones](help:rig-bones) and make it wave.
- **Make it glow** (Lamplighter). A [glow](help:effects), the Add [blend mode](help:blend-modes) and a flicker.
- **Particle party** (Confetti Cannon). [Particles](help:particles) from a preset, made your own.

**Sharing**
- **Share it** (Showtime). Open Export and choose Animated GIF. Nothing is saved.

The first quest opens the others. If you said you're here for game sprites, **Pixel pal** is your first quest instead, and for tiles and levels it's **Tiles**; both are open from the start. If you already know your way around, **Try it anyway** is there on every locked one.

## Little things

- Quests that need a particular drawing (the ball, a lantern, a valley) ask before they replace what is open, and offer to save first.
- Your badges and place are remembered on this computer.
- With less motion asked for, the badge is a still card instead of confetti. Turn sounds on in Preferences for a soft chime.
- **Start the quests over** at the bottom of the panel forgets your badges.`,
});
