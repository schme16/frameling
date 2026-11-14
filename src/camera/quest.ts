// "Camera move": add a camera to a valley, pan it, glide between the keys, push the far hills back for parallax and
// look through it. Listed in src/quests/library.ts with the other later quests.
import type { CameraDrawing, CameraLayer, Doc } from '../core/format';
import { getCommand } from '../core/registry';
import { store, type State } from '../core/store';
import type { Quest } from '../quests/types';
import { freshPage } from '../quests/actions';
import { showPanel } from '../ui/dock';
import { makeCameraPan } from '../templates/camera-pan';
import { lookingThrough, setDepth, setView, stageCamera } from './ops';
// The steps run the camera commands, which are registered while the Camera feature is on (the lesson is hidden when it is off).
import '../symbols/commands';
import { questWord } from '../words/quests';

/** The Camera and parallax example with its camera and distances taken out: the page the quest starts on. */
export function makeValleyScene(): Doc {
  const doc = makeCameraPan();
  doc.name = 'Camera move';
  for (const l of doc.layers) if (l.kind === 'camera') for (const c of l.cels) delete doc.drawings[c.drawingId];
  doc.layers = doc.layers.filter((l) => l.kind !== 'camera');
  for (const l of doc.layers) delete l.depth;
  return doc;
}

const isValley = (s: State) => ['Far hills', 'Near hills', 'Ground'].every((n) => s.doc.layers.some((l) => l.name === n));
const camOf = (s: State) => s.doc.layers.find((l): l is CameraLayer => l.kind === 'camera');

/** Two camera keys or more that look at different places. */
export function cameraMoves(s: State): boolean {
  const cam = camOf(s);
  if (!cam) return false;
  const views = cam.cels.map((c) => JSON.stringify((s.doc.drawings[c.drawingId] as CameraDrawing | undefined)?.view));
  return new Set(views).size >= 2;
}

const glides = (s: State) => !!camOf(s)?.cels.some((c) => c.tween);

const SEL = {
  canvas: '.cv-root',
  panel: ['.cam-panel'],
  depths: ['.cam-depths', '.cam-panel'],
  ruler: '.tl-ruler',
  play: '.tl-header .tl-play',
};

const lastFrame = () => store().get().doc.length - 1;
const pickCamera = () => {
  const cam = stageCamera();
  if (cam) store().setUi({ activeLayerId: cam.id });
};

export const CAMERA_QUEST: Quest = {
  id: 'camera-move',
  title: questWord('quest.camera-move.title'),
  summary: questWord('quest.camera-move.summary'),
  minutes: 3,
  icon: 'camera',
  badge: { id: 'director', name: questWord('quest.camera-move.badge'), icon: 'camera', color: '--sky' },
  features: ['camera'],
  requires: ['first-animation'],
  finish: questWord('quest.camera-move.finish'),
  prepare: () => (isValley(store().get()) && !camOf(store().get()) ? true : freshPage(makeValleyScene)),
  ready: isValley,
  steps: [
    {
      id: 'add',
      say: questWord('quest.camera-move.add.say'),
      why: questWord('quest.camera-move.add.why'),
      target: SEL.panel,
      enter: () => showPanel('camera'),
      done: (c) => !!camOf(c.state),
      show: 'camera.add',
      hint: questWord('quest.camera-move.add.hint'),
      help: 'camera',
    },
    {
      id: 'move',
      say: questWord('quest.camera-move.move.say'),
      why: questWord('quest.camera-move.move.why'),
      target: SEL.canvas,
      enter: () => {
        pickCamera();
        store().setUi({ frame: lastFrame(), tool: 'camera' });
      },
      done: (c) => cameraMoves(c.state),
      show: () => {
        if (store().get().ui.frame === 0) store().setUi({ frame: lastFrame() });
        setView({ x: 1150, y: 260 });
      },
      hint: questWord('quest.camera-move.move.hint'),
      help: 'camera',
    },
    {
      id: 'glide',
      say: questWord('quest.camera-move.glide.say'),
      why: questWord('quest.camera-move.glide.why'),
      target: [SEL.ruler, ...SEL.panel],
      enter: () => {
        pickCamera();
        store().setUi({ frame: 0 });
      },
      done: (c) => glides(c.state),
      show: () => {
        pickCamera();
        store().setUi({ frame: 0 });
        void getCommand('tween.make')?.run();
      },
      hint: questWord('quest.camera-move.glide.hint'),
      help: 'tweens',
    },
    {
      id: 'depth',
      say: questWord('quest.camera-move.depth.say'),
      why: questWord('quest.camera-move.depth.why'),
      target: SEL.depths,
      done: (c) => c.state.doc.layers.some((l) => (l.depth ?? 0) >= 1),
      show: () => {
        const far = store().get().doc.layers.find((l) => l.name === 'Far hills') ?? store().get().doc.layers[0];
        if (far) setDepth(far.id, 3);
      },
      hint: questWord('quest.camera-move.depth.hint'),
      help: 'camera',
    },
    {
      id: 'look',
      say: questWord('quest.camera-move.look.say'),
      target: SEL.canvas,
      done: (c) => lookingThrough(c.state),
      show: 'camera.lookThrough',
      hint: questWord('quest.camera-move.look.hint'),
      help: 'camera',
    },
    {
      id: 'play',
      say: questWord('quest.camera-move.play.say'),
      target: SEL.play,
      enter: () => store().setUi({ frame: 0 }),
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.camera-move.play.hint'),
    },
  ],
};
