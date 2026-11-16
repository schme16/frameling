// Animation is something a drawing asks for. This area holds the way in (Add animation), the way back out (Turn animation
// off), the one question about the Animate room, and the help. What a still picture hides is decided in
// src/core/animationGate.ts, and the rules for the file are in src/core/animation.ts.
import { addedWords, hasFrames, hiddenWords, isAnimated } from '../core/animation';
import { registerChoice, withChoice } from '../core/choices';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { choiceWord } from '../words/choices';
import { dock } from '../ui/dock';
import { toast } from '../ui/toast';
import { addAnimationNow, hideAnimationNow, whyNotNow } from './ops';
import './help';
import './settle';

export type OpenAnimateChoice = 'add' | 'offer';

registerChoice<OpenAnimateChoice>({
  id: 'animation.openAnimate',
  title: choiceWord('choice.animation.openAnimate.title'),
  question: choiceWord('choice.animation.openAnimate.question'),
  options: [
    { value: 'add', label: choiceWord('choice.animation.openAnimate.add.label'), did: choiceWord('choice.animation.openAnimate.add.did'), detail: choiceWord('choice.animation.openAnimate.add.detail') },
    { value: 'offer', label: choiceWord('choice.animation.openAnimate.offer.label'), did: choiceWord('choice.animation.openAnimate.offer.did'), detail: choiceWord('choice.animation.openAnimate.offer.detail') },
  ],
  default: 'add',
  category: 'Animating',
  help: 'animation-add',
});

/** Adds animation and says so, with a way back. */
export function addAnimationAndSay(): void {
  const added = addAnimationNow();
  if (!added) return;
  toast(addedWords(added), { kind: 'success', action: { label: 'Undo', id: 'undo-add-animation', run: () => store().undo() } });
}

/** Turns animation off and says plainly what happened to any frames. */
export function hideAnimationAndSay(): void {
  const had = hasFrames(store().get().doc);
  const hidden = hideAnimationNow();
  if (!hidden) return;
  toast(hiddenWords(hidden), { kind: had ? 'info' : 'success', action: { label: 'Undo', id: 'undo-hide-animation', run: () => store().undo() } });
}

registerCommands([
  {
    id: 'animation.add',
    label: 'Add animation',
    category: 'Animation',
    description: 'Give this drawing frames, a timeline, playback and onion skin.',
    keywords: ['animate', 'animation', 'frames', 'frame', 'timeline', 'flipbook', 'move', 'motion', 'play', 'second frame', 'new frame', 'onion skin', 'tween', 'frame rate', 'fps', 'make it move'],
    help: 'animation-add',
    enabled: (s) => !isAnimated(s.doc) && !whyNotNow(),
    reason: (s) => (isAnimated(s.doc) ? 'This drawing is already an animation.' : (whyNotNow() ?? undefined)),
    run: addAnimationAndSay,
  },
  {
    id: 'animation.remove',
    label: 'Turn animation off',
    category: 'Animation',
    description: 'Tuck the timeline and frame rate away. Your frames stay in the file.',
    keywords: ['still', 'still picture', 'single picture', 'one picture', 'hide timeline', 'no animation', 'remove animation', 'stop animating', 'tidy'],
    help: 'animation-add',
    enabled: (s) => isAnimated(s.doc) && !whyNotNow(),
    reason: (s) => (!isAnimated(s.doc) ? 'This drawing has no animation to turn off.' : (whyNotNow() ?? undefined)),
    run: hideAnimationAndSay,
  },
]);

// Picking the Animate room on a still picture: add animation (the usual), or leave the card where the timeline goes.
let lastRoom: string | null = null;
dock.subscribe(() => {
  const room = dock.get().workspaceId ?? null;
  const was = lastRoom;
  lastRoom = room;
  if (room !== 'animate' || was === null || was === 'animate') return;
  if (isAnimated(store().get().doc) || whyNotNow()) return;
  let added = false;
  withChoice<OpenAnimateChoice>(
    'animation.openAnimate',
    (v) => {
      if (v === 'add') added = addAnimationNow() !== null;
    },
    { gently: { undo: () => void (added && store().undo()) } },
  );
});
lastRoom = dock.get().workspaceId ?? null;
