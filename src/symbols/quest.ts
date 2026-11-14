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
import { questWord } from '../words/quests';

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
  title: questWord('quest.first-tween.title'),
  summary: questWord('quest.first-tween.summary'),
  minutes: 2,
  icon: 'tween',
  badge: { id: 'smooth-mover', name: questWord('quest.first-tween.badge'), icon: 'tween', color: '--sky' },
  requires: ['first-animation'],
  finish: questWord('quest.first-tween.finish'),
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'draw',
      say: questWord('quest.first-tween.draw.say'),
      why: questWord('quest.first-tween.draw.why'),
      target: SEL.canvas,
      enter: () => store().setUi({ tool: 'brush', frame: 0 }),
      done: (c) => hasInkAt(c.state.doc, 0),
      show: () => void drawDemoBall(-120),
      hint: questWord('quest.first-tween.draw.hint'),
      help: 'drawing-basics',
    },
    {
      id: 'tween',
      say: questWord('quest.first-tween.tween.say'),
      why: questWord('quest.first-tween.tween.why'),
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
      hint: questWord('quest.first-tween.tween.hint'),
      help: 'tweens',
    },
    {
      id: 'move',
      say: questWord('quest.first-tween.move.say'),
      why: questWord('quest.first-tween.move.why'),
      target: SEL.canvas,
      done: (c) => tweenMoves(c.state.doc),
      show: () => void updateInstances('Move', (s) => void (s.transform.x += 360)),
      hint: questWord('quest.first-tween.move.hint'),
      help: 'tweens',
    },
    {
      id: 'ease',
      say: questWord('quest.first-tween.ease.say'),
      why: questWord('quest.first-tween.ease.why'),
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
      hint: questWord('quest.first-tween.ease.hint'),
      help: 'easing',
    },
    {
      id: 'play',
      say: questWord('quest.first-tween.play.say'),
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.first-tween.play.hint'),
    },
  ],
};
