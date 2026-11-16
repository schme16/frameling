// The two behaviours of the Transform tool where people reasonably differ. Both are preferences, not questions: nothing
// pops up mid-drag, and they are changed in Preferences > Behaviour.
import { currentChoice, registerChoice } from '../core/choices';
import type { Resample } from './pixels';
import { choiceWord } from '../words/choices';

export type SkewKey = 'ctrl' | 'shift';

registerChoice<SkewKey>({
  id: 'transform.skewKey',
  title: choiceWord('choice.transform.skewKey.title'),
  question: choiceWord('choice.transform.skewKey.question'),
  category: 'Drawing',
  silent: true,
  default: 'ctrl',
  help: 'transform',
  options: [
    { value: 'ctrl', label: choiceWord('choice.transform.skewKey.ctrl.label'), detail: choiceWord('choice.transform.skewKey.ctrl.detail') },
    { value: 'shift', label: choiceWord('choice.transform.skewKey.shift.label'), detail: choiceWord('choice.transform.skewKey.shift.detail') },
  ],
});

registerChoice<Resample>({
  id: 'transform.resample',
  title: choiceWord('choice.transform.resample.title'),
  question: choiceWord('choice.transform.resample.question'),
  category: 'Pixel art',
  silent: true,
  default: 'crisp',
  help: 'transform',
  options: [
    { value: 'crisp', label: choiceWord('choice.transform.resample.crisp.label'), detail: choiceWord('choice.transform.resample.crisp.detail') },
    { value: 'plain', label: choiceWord('choice.transform.resample.plain.label'), detail: choiceWord('choice.transform.resample.plain.detail') },
  ],
});

export const skewKey = (): SkewKey => currentChoice<SkewKey>('transform.skewKey');
export const resampleWay = (): Resample => currentChoice<Resample>('transform.resample');

/** Whether the pointer's keys ask for a slant when dragging an edge. */
export function wantsSkew(e: { shift: boolean; mod: boolean }, key: SkewKey = skewKey()): boolean {
  return key === 'shift' ? e.shift : e.mod;
}
