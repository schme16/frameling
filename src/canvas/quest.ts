// "Turn the page": hold Alt and drag to turn the view like a sheet on a desk, then straighten it. Listed in
// src/quests/library.ts with the other later quests. It is about the view only, so it needs no page of its own.
import { store } from '../core/store';
import type { Quest } from '../quests/types';
import { getTurn, isTurned } from './turn';
// The steps run the turn commands.
import './turnCommands';
import { questWord } from '../words/quests';

const turned = () => isTurned(getTurn());
const pickBrush = () => store().setUi({ tool: 'brush' });

export const TURN_QUEST: Quest = {
  id: 'turn-the-page',
  title: questWord('quest.turn-the-page.title'),
  summary: questWord('quest.turn-the-page.summary'),
  minutes: 1,
  icon: 'rotate',
  group: 'drawing',
  badge: { id: 'page-turner', name: questWord('quest.turn-the-page.badge'), icon: 'rotate', color: '--sky' },
  requires: [],
  finish: questWord('quest.turn-the-page.finish'),
  steps: [
    {
      id: 'turn',
      say: questWord('quest.turn-the-page.turn.say'),
      why: questWord('quest.turn-the-page.turn.why'),
      target: '.cv-root',
      enter: pickBrush,
      done: () => turned(),
      show: 'view.turnRight',
      hint: questWord('quest.turn-the-page.turn.hint'),
      help: 'turn-flip-view',
    },
    {
      id: 'straight',
      say: questWord('quest.turn-the-page.straight.say'),
      why: questWord('quest.turn-the-page.straight.why'),
      target: '.tv-chip-reset',
      done: () => !turned(),
      show: 'view.resetTurn',
      hint: questWord('quest.turn-the-page.straight.hint'),
      help: 'turn-flip-view',
    },
  ],
};
