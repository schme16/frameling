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
  title: 'Camera move',
  summary: 'Pan a camera across a valley, with far hills that drift slower.',
  minutes: 3,
  icon: 'camera',
  badge: { id: 'director', name: 'Director', icon: 'camera', color: '--sky' },
  features: ['camera'],
  requires: ['first-animation'],
  finish: "That's a real camera move with parallax. Exports always see what the camera sees.",
  prepare: () => (isValley(store().get()) && !camOf(store().get()) ? true : freshPage(makeValleyScene)),
  ready: isValley,
  steps: [
    {
      id: 'add',
      say: 'Add a camera: Animate > Add a camera.',
      why: 'The camera is a layer of its own. Its frame shows what an export will show.',
      target: SEL.panel,
      enter: () => showPanel('camera'),
      done: (c) => !!camOf(c.state),
      show: 'camera.add',
      hint: 'The Camera panel on the right has an Add a camera button too.',
      help: 'camera',
    },
    {
      id: 'move',
      say: 'This is the last frame. Drag the camera frame to the right, over the house.',
      why: 'Moving the camera on another frame gives that frame a camera key of its own.',
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
      hint: 'Press inside the camera frame (the box with the dark edge) and drag.',
      help: 'camera',
    },
    {
      id: 'glide',
      say: 'Now make it glide: on frame 1, press Ctrl+Shift+T for in-betweens.',
      why: 'Without in-betweens the camera would jump at the last frame. With them it pans smoothly.',
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
      hint: 'Or right-click the camera key on frame 1 in the timeline and choose Make in-betweens.',
      help: 'tweens',
    },
    {
      id: 'depth',
      say: 'Push the Far hills back: in the Camera panel, set their distance to 3.',
      why: 'Far things drift slower than near ones as the camera passes. That is called parallax.',
      target: SEL.depths,
      done: (c) => c.state.doc.layers.some((l) => (l.depth ?? 0) >= 1),
      show: () => {
        const far = store().get().doc.layers.find((l) => l.name === 'Far hills') ?? store().get().doc.layers[0];
        if (far) setDepth(far.id, 3);
      },
      hint: 'Each layer has a box under "Distance from the camera" in the Camera panel. 0 is right on the stage.',
      help: 'camera',
    },
    {
      id: 'look',
      say: 'Press Shift+C to look through the camera.',
      target: SEL.canvas,
      done: (c) => lookingThrough(c.state),
      show: 'camera.lookThrough',
      hint: 'View > Look through the camera does the same. Press it again to see the whole stage.',
      help: 'camera',
    },
    {
      id: 'play',
      say: 'Press play. Lights, camera, action!',
      target: SEL.play,
      enter: () => store().setUi({ frame: 0 }),
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: 'The big triangle in the timeline, or press Enter.',
    },
  ],
};
