// "Your first tween": draw a thing, make in-betweens, move the end, pick an easing, play. Listed in
// src/quests/library.ts after Shade and shine.
import type { Doc, InstanceShape, VectorDrawing } from '../core/format';
import { getCommand } from '../core/registry';
import { store } from '../core/store';
import { isInstance } from '../core/symbols';
import type { Quest } from '../quests/types';
import { drawDemoBall, ensureBlankVectorPage } from '../quests/actions';
import { hasInkAt, hasVectorLayer } from '../quests/predicates';
import { setDocLength } from '../timeline/ops';
import { DEFAULT_EASE, updateInstances } from './ops';
// The steps run these commands, so they must be registered wherever the quest is.
import './commands';

const SEL = {
  canvas: '.cv-root',
  props: ['.sy-props .sy-select', '.sy-props'],
  play: '.tl-header .tl-play',
  tweenBar: '.tl-tween',
};

/** The first key with in-betweens on any layer, and the key after it. */
export function firstTween(doc: Doc): { from: InstanceShape | undefined; to: InstanceShape | undefined; ease: unknown } | null {
  for (const l of doc.layers) {
    const i = l.cels.findIndex((c) => c.tween);
    if (i < 0) continue;
    const a = l.cels[i];
    const b = l.cels[i + 1];
    const first = (id?: string) => ((id ? (doc.drawings[id] as VectorDrawing | undefined) : undefined)?.shapes ?? []).find(isInstance);
    return { from: first(a.drawingId), to: first(b?.drawingId), ease: a.tween!.ease };
  }
  return null;
}

/** Has the end key been moved, turned or resized away from the start? */
export function tweenMoves(doc: Doc): boolean {
  const t = firstTween(doc);
  if (!t?.from || !t.to) return false;
  const a = t.from.transform;
  const b = t.to.transform;
  return Math.hypot(a.x - b.x, a.y - b.y) > 4 || Math.abs(a.rotation - b.rotation) > 3 || Math.abs(a.scaleX - b.scaleX) > 0.05 || Math.abs(a.scaleY - b.scaleY) > 0.05;
}

export const FIRST_TWEEN: Quest = {
  id: 'first-tween',
  title: 'Your first tween',
  summary: 'Draw something once and let Frameling draw all the frames as it glides across.',
  minutes: 2,
  icon: 'tween',
  badge: { id: 'smooth-mover', name: 'Smooth Mover', icon: 'tween', color: '--sky' },
  requires: ['first-animation'],
  finish: 'Smooth! Try Draw a path in Symbol and motion next, to send it along a curve.',
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'draw',
      say: 'Draw something on the page: a ball, a star, a paper plane.',
      why: 'You only draw it once. Frameling does the rest.',
      target: SEL.canvas,
      enter: () => store().setUi({ tool: 'brush', frame: 0 }),
      done: (c) => hasInkAt(c.state.doc, 0),
      show: () => void drawDemoBall(-120),
      hint: 'Click and drag on the white page.',
      help: 'drawing-basics',
    },
    {
      id: 'tween',
      say: 'Press Ctrl+Shift+T to make in-betweens.',
      why: 'In-betweens are the frames between two poses. Animators call them tweens.',
      target: SEL.canvas,
      enter: () => {
        // Give the drawing room to move: hold it for 16 frames (only when it's still a single frame).
        const doc = store().get().doc;
        const l = doc.layers.find((x) => x.cels.length === 1 && x.cels[0].start === 0 && x.cels[0].length < 4);
        if (l) {
          store().update('Hold for 16 frames', (d) => void (d.layers.find((x) => x.id === l.id)!.cels[0].length = 16));
          if (store().get().doc.length < 16) setDocLength(16);
        }
        store().setUi({ frame: 0, activeLayerId: (l ?? doc.layers.find((x) => x.cels.length))?.id ?? store().get().ui.activeLayerId });
      },
      done: (c) => !!firstTween(c.state.doc),
      show: 'tween.make',
      hint: 'You can also right-click the drawing in the timeline and choose Make in-betweens.',
      help: 'tweens',
    },
    {
      id: 'move',
      say: 'This is the last frame. Drag your drawing somewhere else, so it has somewhere to go.',
      why: 'You can resize it with the corners or turn it with the round handle too.',
      target: SEL.canvas,
      done: (c) => tweenMoves(c.state.doc),
      show: () => void updateInstances('Move', (s) => void (s.transform.x += 360)),
      hint: 'With the Select tool, drag the drawing to the right.',
      help: 'tweens',
    },
    {
      id: 'ease',
      say: 'Pick how it moves. Try Bouncy in the Easing list.',
      why: 'Easing is how it speeds up and slows down. Watch the dots on the canvas bunch up where it goes slowly.',
      target: SEL.props,
      enter: () => {
        void getCommand('view.panel.symbol-props')?.run();
        store().setUi({ frame: 0 });
      },
      done: (c) => {
        const t = firstTween(c.state.doc);
        return !!t && t.ease !== DEFAULT_EASE;
      },
      show: 'tween.ease.bounceOut',
      hint: 'The Easing list is in the Symbol and motion panel.',
      help: 'easing',
    },
    {
      id: 'play',
      say: 'Press play and watch it glide!',
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: 'The big triangle in the timeline, or press Enter.',
    },
  ],
};
