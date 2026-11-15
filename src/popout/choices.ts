// The picture window's two remembered choices (see core/choices.ts). Preferences > Behaviour lists them. They are only asked
// when they matter: a drawing with no camera never asks about the camera, one with no marks never asks about marks.
import { registerChoice } from '../core/choices';
import type { CameraChoice, MarksChoice } from './show';
import { choiceWord } from '../words/choices';
import type { BackgroundChoice, CaptureSizeChoice } from './capture';

export type CaptureCursorChoice = 'hide' | 'show';

registerChoice<CameraChoice>({
  id: 'popout.camera',
  title: choiceWord('choice.popout.camera.title'),
  question: choiceWord('choice.popout.camera.question'),
  category: 'Canvas',
  default: 'camera',
  help: 'canvas-popout',
  options: [
    { value: 'camera', label: choiceWord('choice.popout.camera.camera.label'), detail: choiceWord('choice.popout.camera.camera.detail'), did: choiceWord('choice.popout.camera.camera.did') },
    { value: 'same', label: choiceWord('choice.popout.camera.same.label'), detail: choiceWord('choice.popout.camera.same.detail'), did: choiceWord('choice.popout.camera.same.did') },
  ],
});

registerChoice<MarksChoice>({
  id: 'popout.marks',
  title: choiceWord('choice.popout.marks.title'),
  question: choiceWord('choice.popout.marks.question'),
  category: 'Canvas',
  default: 'hide',
  help: 'canvas-popout',
  options: [
    { value: 'hide', label: choiceWord('choice.popout.marks.hide.label'), detail: choiceWord('choice.popout.marks.hide.detail'), did: choiceWord('choice.popout.marks.hide.did') },
    { value: 'show', label: choiceWord('choice.popout.marks.show.label'), detail: choiceWord('choice.popout.marks.show.detail'), did: choiceWord('choice.popout.marks.show.did') },
  ],
});

// The capture view (a clean window for a streaming program to capture). The background is asked once, the first time the
// view opens: a key colour or a plain dark one are both reasonable. Size and pointer are preferences that start sensible.
registerChoice<BackgroundChoice>({
  id: 'popout.captureBackground',
  title: choiceWord('choice.popout.captureBackground.title'),
  question: choiceWord('choice.popout.captureBackground.question'),
  category: 'Canvas',
  default: 'green',
  help: 'stream-capture',
  options: [
    { value: 'green', label: choiceWord('choice.popout.captureBackground.green.label'), detail: choiceWord('choice.popout.captureBackground.green.detail'), did: choiceWord('choice.popout.captureBackground.green.did') },
    { value: 'blue', label: choiceWord('choice.popout.captureBackground.blue.label'), detail: choiceWord('choice.popout.captureBackground.blue.detail'), did: choiceWord('choice.popout.captureBackground.blue.did') },
    { value: 'magenta', label: choiceWord('choice.popout.captureBackground.magenta.label'), detail: choiceWord('choice.popout.captureBackground.magenta.detail'), did: choiceWord('choice.popout.captureBackground.magenta.did') },
    { value: 'dark', label: choiceWord('choice.popout.captureBackground.dark.label'), detail: choiceWord('choice.popout.captureBackground.dark.detail'), did: choiceWord('choice.popout.captureBackground.dark.did') },
    { value: 'black', label: choiceWord('choice.popout.captureBackground.black.label'), detail: choiceWord('choice.popout.captureBackground.black.detail'), did: choiceWord('choice.popout.captureBackground.black.did') },
    { value: 'white', label: choiceWord('choice.popout.captureBackground.white.label'), detail: choiceWord('choice.popout.captureBackground.white.detail'), did: choiceWord('choice.popout.captureBackground.white.did') },
  ],
});

registerChoice<CaptureCursorChoice>({
  id: 'popout.captureCursor',
  title: choiceWord('choice.popout.captureCursor.title'),
  question: choiceWord('choice.popout.captureCursor.question'),
  category: 'Canvas',
  silent: true,
  default: 'hide',
  help: 'stream-capture',
  options: [
    { value: 'hide', label: choiceWord('choice.popout.captureCursor.hide.label'), detail: choiceWord('choice.popout.captureCursor.hide.detail') },
    { value: 'show', label: choiceWord('choice.popout.captureCursor.show.label'), detail: choiceWord('choice.popout.captureCursor.show.detail') },
  ],
});

registerChoice<CaptureSizeChoice>({
  id: 'popout.captureSize',
  title: choiceWord('choice.popout.captureSize.title'),
  question: choiceWord('choice.popout.captureSize.question'),
  category: 'Canvas',
  silent: true,
  default: 'free',
  help: 'stream-capture',
  options: [
    { value: 'free', label: choiceWord('choice.popout.captureSize.free.label'), detail: choiceWord('choice.popout.captureSize.free.detail') },
    { value: '1920x1080', label: choiceWord('choice.popout.captureSize.s1920x1080.label'), detail: choiceWord('choice.popout.captureSize.s1920x1080.detail') },
    { value: '1280x720', label: choiceWord('choice.popout.captureSize.s1280x720.label'), detail: choiceWord('choice.popout.captureSize.s1280x720.detail') },
    { value: '2560x1440', label: choiceWord('choice.popout.captureSize.s2560x1440.label'), detail: choiceWord('choice.popout.captureSize.s2560x1440.detail') },
    { value: '3840x2160', label: choiceWord('choice.popout.captureSize.s3840x2160.label'), detail: choiceWord('choice.popout.captureSize.s3840x2160.detail') },
    { value: '1080x1080', label: choiceWord('choice.popout.captureSize.s1080x1080.label'), detail: choiceWord('choice.popout.captureSize.s1080x1080.detail') },
    { value: '1080x1920', label: choiceWord('choice.popout.captureSize.s1080x1920.label'), detail: choiceWord('choice.popout.captureSize.s1080x1920.detail') },
  ],
});
