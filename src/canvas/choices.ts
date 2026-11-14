// The canvas area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type WheelMode = 'zoom' | 'scroll';
export type SpaceTapMode = 'play' | 'pan-only';

registerChoice<WheelMode>({
  id: 'canvas.wheel',
  title: choiceWord('choice.canvas.wheel.title'),
  question: choiceWord('choice.canvas.wheel.question'),
  category: 'Canvas',
  silent: true,
  default: 'zoom',
  help: 'Pinching on a trackpad always zooms.',
  options: [
    { value: 'zoom', label: choiceWord('choice.canvas.wheel.zoom.label'), detail: choiceWord('choice.canvas.wheel.zoom.detail') },
    { value: 'scroll', label: choiceWord('choice.canvas.wheel.scroll.label'), detail: choiceWord('choice.canvas.wheel.scroll.detail') },
  ],
});

registerChoice<SpaceTapMode>({
  id: 'canvas.spaceTap',
  title: choiceWord('choice.canvas.spaceTap.title'),
  question: choiceWord('choice.canvas.spaceTap.question'),
  category: 'Canvas',
  default: 'play',
  help: 'Holding Space and dragging always moves the drawing around.',
  options: [
    { value: 'play', label: choiceWord('choice.canvas.spaceTap.play.label'), detail: choiceWord('choice.canvas.spaceTap.play.detail') },
    { value: 'pan-only', label: choiceWord('choice.canvas.spaceTap.pan-only.label'), detail: choiceWord('choice.canvas.spaceTap.pan-only.detail') },
  ],
});
