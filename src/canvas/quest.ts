// "Turn the page": hold Alt and drag to turn the view like a sheet on a desk, then straighten it. Listed in
// src/quests/library.ts with the other later quests. It is about the view only, so it needs no page of its own.
import { store } from '../core/store';
import type { Quest } from '../quests/types';
import { getTurn, isTurned } from './turn';
// The steps run the turn commands.
import './turnCommands';

const turned = () => isTurned(getTurn());
const pickBrush = () => store().setUi({ tool: 'brush' });

export const TURN_QUEST: Quest = {
  id: 'turn-the-page',
  title: 'Turn the page',
  summary: 'Turn the canvas to any angle, the way you turn a sheet of paper, then put it straight again.',
  minutes: 1,
  icon: 'rotate',
  group: 'drawing',
  badge: { id: 'page-turner', name: 'Page Turner', icon: 'rotate', color: '--sky' },
  requires: [],
  finish: 'Turn it whenever a stroke feels awkward. It only changes how you look at the page, never the drawing or what you export.',
  steps: [
    {
      id: 'turn',
      say: 'Hold Alt and drag round the middle of the canvas, with the Brush or Pencil. The page turns with your pointer.',
      why: 'Painters turn the paper to reach a stroke comfortably. Alt and a plain click still picks a colour on a pixel layer. Hold Shift as you drag to turn in neat 15 degree steps.',
      target: '.cv-root',
      enter: pickBrush,
      done: () => turned(),
      show: 'view.turnRight',
      hint: 'Press Alt, then drag in a slow circle around the middle of the canvas. Alt and . (full stop) turns it a little too.',
      help: 'turn-flip-view',
    },
    {
      id: 'straight',
      say: 'Press Straighten on the note at the top of the canvas to put the page back.',
      why: 'The note stays while the page is turned, so you never mistake a turned view for a crooked drawing. Ctrl+Shift+0 does the same.',
      target: '.tv-chip-reset',
      done: () => !turned(),
      show: 'view.resetTurn',
      hint: 'It is the button at the top of the canvas.',
      help: 'turn-flip-view',
    },
  ],
};
