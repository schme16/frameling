// The two behaviours of the Transform tool where people reasonably differ. Both are preferences, not questions: nothing
// pops up mid-drag, and they are changed in Preferences > Behaviour.
import { currentChoice, registerChoice } from '../core/choices';
import type { Resample } from './pixels';

export type SkewKey = 'ctrl' | 'shift';

registerChoice<SkewKey>({
  id: 'transform.skewKey',
  title: 'Slanting with the Transform tool',
  question: 'Which key turns an edge drag into a slant (a skew)?',
  category: 'Drawing',
  silent: true,
  default: 'ctrl',
  help: 'transform',
  options: [
    { value: 'ctrl', label: 'Ctrl (Cmd on a Mac)', detail: 'Hold Ctrl and drag the middle of a side. Shift stays free to keep proportions and to snap turns and slants to 15 degrees.' },
    { value: 'shift', label: 'Shift', detail: 'Hold Shift and drag the middle of a side. Shift no longer keeps proportions on a side; corners still do.' },
  ],
});

registerChoice<Resample>({
  id: 'transform.resample',
  title: 'Turning and slanting pixels',
  question: 'How should pixels be picked again when you turn or slant a pixel selection?',
  category: 'Pixel art',
  silent: true,
  default: 'crisp',
  help: 'transform',
  options: [
    { value: 'crisp', label: 'Crisp (rounds the steps)', detail: 'The art is doubled with Scale2x first, so diagonal lines come out smoother. Still no blending, so no new colours.' },
    { value: 'plain', label: 'Plain (nearest pixel)', detail: 'Each pixel just takes the colour of the pixel under it. Blockier, and exactly what a stretch does.' },
  ],
});

export const skewKey = (): SkewKey => currentChoice<SkewKey>('transform.skewKey');
export const resampleWay = (): Resample => currentChoice<Resample>('transform.resample');

/** Whether the pointer's keys ask for a slant when dragging an edge. */
export function wantsSkew(e: { shift: boolean; mod: boolean }, key: SkewKey = skewKey()): boolean {
  return key === 'shift' ? e.shift : e.mod;
}
