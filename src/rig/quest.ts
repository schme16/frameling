// "Bones and a pose": add bones to a two-part arm, attach the parts, pose it on a later frame and play. Listed in
// src/quests/library.ts with the other later quests.
import { newDoc } from '../core/doc';
import type { Doc, Id, Layer, VectorDrawing } from '../core/format';
import { store, type State } from '../core/store';
import type { Quest } from '../quests/types';
import { freshPage } from '../quests/actions';
import { showPanel } from '../ui/dock';
import { INK, PEACH, SUNNY, addVectorLayer, ellipsePath, emptyOf, hold, pathShape, rectPath, vectorDrawing } from '../templates/build';
import { addBone, autoAttach, currentRig, ensureRig, setPose } from './ops';
import { isRigLayer } from './pose';
import { questWord } from '../words/quests';

const SHOULDER = { x: 260, y: 300 };
const ELBOW = { x: 430, y: 300 };
const HAND = { x: 590, y: 300 };

/** A noodle arm in two parts on their own layers, ready for bones: the page the quest starts on. */
export function makeArmScene(): Doc {
  const doc = emptyOf(newDoc({ name: 'Bones and a pose', width: 800, height: 600, fps: 12, length: 24 }));
  const capsule = (a: { x: number; y: number }, b: { x: number; y: number }, color: string) => [
    pathShape([rectPath(a.x, a.y - 30, b.x - a.x, 60)], color, { color: INK, width: 6 }),
    pathShape([ellipsePath(a.x, a.y, 34, 34)], color, { color: INK, width: 6 }),
  ];
  const upper = addVectorLayer(doc, 'Upper arm');
  hold(upper, vectorDrawing(doc, capsule(SHOULDER, ELBOW, PEACH)).id, 0, 24);
  const fore = addVectorLayer(doc, 'Forearm');
  hold(fore, vectorDrawing(doc, [...capsule(ELBOW, HAND, PEACH), pathShape([ellipsePath(HAND.x + 10, HAND.y, 40, 36)], SUNNY, { color: INK, width: 6 })]).id, 0, 24);
  doc.layers.forEach((l) => (l.onion = false));
  return doc;
}

const isArmScene = (s: State) => s.doc.layers.some((l) => l.name === 'Forearm') && s.doc.layers.some((l) => l.name === 'Upper arm');

const rigOf = (s: State) => s.doc.layers.find((l) => isRigLayer(l)) as (Layer & { rig: { bones: { id: Id }[] } }) | undefined;
const boneCount = (s: State) => rigOf(s)?.rig.bones.length ?? 0;
const attached = (s: State) => s.doc.layers.filter((l) => l.bind).length;

/** A pose key after the first frame that turns some bone. */
export function posedLater(s: State): boolean {
  const r = rigOf(s);
  if (!r) return false;
  return r.cels.some((c) => {
    if (c.start === 0) return false;
    const pose = (s.doc.drawings[c.drawingId] as VectorDrawing | undefined)?.pose;
    return !!pose && Object.values(pose).some((p) => Math.abs(p.r) > 4 || Math.hypot(p.x ?? 0, p.y ?? 0) > 4);
  });
}

function showBones(): void {
  const rigId = currentRig()?.id ?? ensureRig();
  const upper = addBone(rigId, SHOULDER, ELBOW, null, 'Upper arm');
  if (upper) addBone(rigId, ELBOW, HAND, upper, 'Forearm');
}

function showPose(): void {
  const r = currentRig();
  if (!r) return;
  if (store().get().ui.frame === 0) store().setUi({ frame: 12 });
  const [a, b] = r.rig.bones;
  setPose(r.id, { ...(a ? { [a.id]: { r: -50 } } : {}), ...(b ? { [b.id]: { r: -60 } } : {}) });
}

const SEL = {
  canvas: '.cv-root',
  rig: ['.rg-panel'],
  play: '.tl-header .tl-play',
  ruler: '.tl-ruler',
};

export const BONES_QUEST: Quest = {
  id: 'bones-and-pose',
  title: questWord('quest.bones-and-pose.title'),
  summary: questWord('quest.bones-and-pose.summary'),
  minutes: 3,
  icon: 'rig',
  badge: { id: 'puppeteer', name: questWord('quest.bones-and-pose.badge'), icon: 'rig', color: '--peach' },
  features: ['rig'],
  requires: ['first-animation'],
  finish: questWord('quest.bones-and-pose.finish'),
  prepare: () => (isArmScene(store().get()) ? true : freshPage(makeArmScene)),
  ready: isArmScene,
  steps: [
    {
      id: 'add',
      say: questWord('quest.bones-and-pose.add.say'),
      why: questWord('quest.bones-and-pose.add.why'),
      target: SEL.rig,
      enter: () => showPanel('rig'),
      done: (c) => !!rigOf(c.state),
      show: 'rig.addBones',
      hint: questWord('quest.bones-and-pose.add.hint'),
      help: 'rig-bones',
    },
    {
      id: 'draw',
      say: questWord('quest.bones-and-pose.draw.say'),
      why: questWord('quest.bones-and-pose.draw.why'),
      target: SEL.canvas,
      done: (c) => boneCount(c.state) >= 2,
      show: showBones,
      hint: questWord('quest.bones-and-pose.draw.hint'),
      help: 'rig-bones',
    },
    {
      id: 'attach',
      say: questWord('quest.bones-and-pose.attach.say'),
      why: questWord('quest.bones-and-pose.attach.why'),
      target: SEL.rig,
      done: (c) => attached(c.state) >= 2,
      show: () => void autoAttach(),
      hint: questWord('quest.bones-and-pose.attach.hint'),
      help: 'rig-attach',
    },
    {
      id: 'pose',
      say: questWord('quest.bones-and-pose.pose.say'),
      why: questWord('quest.bones-and-pose.pose.why'),
      target: [SEL.ruler, SEL.canvas],
      enter: () => store().setUi({ tool: 'pose' }),
      done: (c) => posedLater(c.state),
      show: showPose,
      hint: questWord('quest.bones-and-pose.pose.hint'),
      help: 'rig-posing',
    },
    {
      id: 'play',
      say: questWord('quest.bones-and-pose.play.say'),
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.bones-and-pose.play.hint'),
    },
  ],
};
