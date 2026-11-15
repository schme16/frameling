// The canvas area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type WheelMode = 'zoom' | 'scroll';
export type WheelCtrl = 'same' | 'bigger';
export type ZoomSpeedChoice = 'slow' | 'normal' | 'fast';
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

registerChoice<WheelCtrl>({
  id: 'canvas.wheelCtrl',
  title: choiceWord('choice.canvas.wheelCtrl.title'),
  question: choiceWord('choice.canvas.wheelCtrl.question'),
  category: 'Canvas',
  silent: true,
  default: 'same',
  help: 'Alt still takes careful little steps, and a trackpad pinch always zooms.',
  options: [
    { value: 'same', label: choiceWord('choice.canvas.wheelCtrl.same.label'), detail: choiceWord('choice.canvas.wheelCtrl.same.detail') },
    { value: 'bigger', label: choiceWord('choice.canvas.wheelCtrl.bigger.label'), detail: choiceWord('choice.canvas.wheelCtrl.bigger.detail') },
  ],
});

registerChoice<ZoomSpeedChoice>({
  id: 'canvas.zoomSpeed',
  title: choiceWord('choice.canvas.zoomSpeed.title'),
  question: choiceWord('choice.canvas.zoomSpeed.question'),
  category: 'Canvas',
  silent: true,
  default: 'normal',
  help: 'Hold Alt for careful little steps while you scroll.',
  options: [
    { value: 'slow', label: choiceWord('choice.canvas.zoomSpeed.slow.label'), detail: choiceWord('choice.canvas.zoomSpeed.slow.detail') },
    { value: 'normal', label: choiceWord('choice.canvas.zoomSpeed.normal.label'), detail: choiceWord('choice.canvas.zoomSpeed.normal.detail') },
    { value: 'fast', label: choiceWord('choice.canvas.zoomSpeed.fast.label'), detail: choiceWord('choice.canvas.zoomSpeed.fast.detail') },
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
