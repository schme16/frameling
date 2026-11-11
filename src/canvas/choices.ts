// The canvas area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';

export type WheelMode = 'zoom' | 'scroll';
export type SpaceTapMode = 'play' | 'pan-only';

registerChoice<WheelMode>({
  id: 'canvas.wheel',
  title: 'Mouse wheel',
  question: 'What should the mouse wheel do over the canvas?',
  category: 'Canvas',
  silent: true,
  default: 'zoom',
  help: 'Pinching on a trackpad always zooms.',
  options: [
    { value: 'zoom', label: 'Zoom', detail: 'The wheel zooms towards the cursor. Shift+wheel scrolls sideways.' },
    { value: 'scroll', label: 'Scroll', detail: 'The wheel moves the drawing up and down. Hold Ctrl to zoom.' },
  ],
});

registerChoice<SpaceTapMode>({
  id: 'canvas.spaceTap',
  title: 'Tapping Space',
  question: 'Should a quick tap of Space play and pause your animation?',
  category: 'Canvas',
  default: 'play',
  help: 'Holding Space and dragging always moves the drawing around.',
  options: [
    { value: 'play', label: 'Play or pause', detail: 'A quick tap plays. Holding Space and dragging still pans.' },
    { value: 'pan-only', label: 'Only for panning', detail: 'Space does nothing unless you hold it and drag.' },
  ],
});
