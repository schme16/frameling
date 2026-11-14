// Bone commands: palette, Frames and motion > Skeleton (rig) and keys.
import { lazyPanel } from '../core/lazy';
import { getCommand, registerCommand, type Command, type PanelDef } from '../core/registry';
import { store, type State } from '../core/store';
import { findLayer } from '../core/doc';
import { toast } from '../ui/toast';
import { requestOverlay } from '../canvas/controller';
import { attachLayer, autoAttach, bendLayer, currentRig, ensureRig, mirrorCurrentPose, resetPose, savePose, setPin, swapCurrentSides } from './ops';
import { deleteSelectedBone } from './tools';
import { rigUi, setRigUi } from './state';
import { artCoverage } from './coverage';
import { isRigLayer } from './pose';
import { normaliseActive, paintTarget, smoothActive } from './weightsTool';

export const rigPanel: PanelDef = { id: 'rig', title: 'Rig', commandLabel: 'Skeleton panel (Rig)', icon: 'rig', component: lazyPanel(() => import('./RigPanel').then((m) => m.RigPanel)), zone: 'right', order: 38, help: 'rig' };

const hasBones = (s: State) => !!currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length;
const say = (r: string | undefined, ok?: string) => {
  if (r) toast(r);
  else if (ok) toast(ok, { action: { label: 'Undo', run: () => store().undo() } });
};
const selectedBone = (s: State) => {
  const rig = currentRig(s.doc, s.ui.activeLayerId);
  const id = rigUi().selected;
  return rig && id ? rig.rig.bones.find((b) => b.id === id) : undefined;
};

export const rigCommands: Command[] = [
  {
    id: 'rig.addBones',
    label: 'Add a skeleton to this drawing',
    category: 'Rig',
    description: 'Makes a layer for the bones (if there is none yet) and picks the Bone tool, so you can draw the skeleton (the rig).',
    keywords: ['skeleton', 'armature', 'rig', 'bone', 'cut-out', 'puppet'],
    help: 'rig-bones',
    run: () => {
      ensureRig();
      store().setUi({ tool: 'bone' });
    },
  },
  {
    id: 'rig.autoAttach',
    label: 'Attach parts to bones',
    category: 'Rig',
    keys: ['Shift+A'],
    description: 'Every layer that is not attached yet follows the bone nearest its drawing.',
    keywords: ['bind', 'parent', 'skin', 'attach', 'cut-out', 'link'],
    help: 'rig-attach',
    enabled: hasBones,
    run: () => {
      const n = autoAttach();
      say(n ? undefined : 'Every layer with a drawing is already attached. Change one in the Rig panel.', n ? `Attached ${n} part${n === 1 ? '' : 's'} to the nearest bones.` : undefined);
    },
  },
  {
    id: 'rig.bendLayer',
    label: 'Bend this layer with the bones',
    category: 'Rig',
    description: 'The active layer bends smoothly with every bone near it, instead of moving with one (mesh deform).',
    keywords: ['mesh', 'deform', 'skin', 'weights', 'bend', 'smooth bind', 'warp'],
    help: 'rig-bend',
    enabled: (s) => {
      const l = findLayer(s.doc, s.ui.activeLayerId);
      return hasBones(s) && !!l && !isRigLayer(l) && l.kind !== 'tilemap';
    },
    run: () => {
      const { doc, ui } = store().get();
      const rig = currentRig();
      const l = findLayer(doc, ui.activeLayerId);
      if (!rig || !l) return;
      say(bendLayer(l.id, rig.id, artCoverage(doc, l, ui.frame)), `${l.name} now bends with the bones.`);
    },
  },
  {
    id: 'rig.paintWeights',
    label: 'Paint how much it bends',
    category: 'Rig',
    description: 'A soft brush for a bending layer: paint how strongly each part follows a bone (weight painting).',
    keywords: ['weights', 'weight paint', 'skin weights', 'influence', 'bend', 'heat map', 'skinning'],
    help: 'rig-weights',
    enabled: (s) => !!paintTarget(s.doc, s.ui.activeLayerId),
    run: () => store().setUi({ tool: 'weights' }),
  },
  {
    id: 'rig.smoothWeights',
    label: 'Smooth how it bends',
    category: 'Rig',
    description: 'Evens out the bending on the active layer once, so joints bend more softly (smooth weights).',
    keywords: ['smooth weights', 'blur weights', 'soften bend'],
    help: 'rig-weights',
    enabled: (s) => !!paintTarget(s.doc, s.ui.activeLayerId),
    run: () => say(smoothActive()),
  },
  {
    id: 'rig.normaliseWeights',
    label: 'Even out bending totals',
    category: 'Rig',
    description: 'Makes every point of the bending layer follow its bones by exactly 100% in total (normalise weights). Handy after deleting a bone.',
    keywords: ['normalize weights', 'normalise weights', 'fix weights', 'weights add up'],
    help: 'rig-weights',
    enabled: (s) => !!paintTarget(s.doc, s.ui.activeLayerId),
    run: () => say(normaliseActive(), 'Every point now follows its bones by 100% in total.'),
  },
  {
    id: 'rig.detachLayer',
    label: 'Detach this layer from the bones',
    category: 'Rig',
    keywords: ['unbind', 'unparent', 'detach'],
    help: 'rig-attach',
    enabled: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.bind,
    run: () => {
      const l = findLayer(store().get().doc, store().get().ui.activeLayerId);
      if (l?.bind) attachLayer(l.id, l.bind.rig, null);
    },
  },
  {
    id: 'rig.savePose',
    label: 'Save this pose',
    category: 'Rig',
    description: 'Keeps the pose at the playhead in the pose library, to use again on any frame.',
    keywords: ['pose library', 'store pose', 'keep pose'],
    help: 'rig-pose-library',
    enabled: hasBones,
    run: () => say(savePose(), 'Saved the pose in the Rig panel.'),
  },
  {
    id: 'rig.mirrorPose',
    label: 'Mirror pose',
    category: 'Rig',
    keys: ['Alt+M'],
    description: 'Swaps left and right: the left arm takes the right arm\'s pose and the other way round.',
    keywords: ['flip pose', 'mirror', 'swap sides', 'opposite'],
    help: 'rig-pose-library',
    enabled: hasBones,
    run: () => say(mirrorCurrentPose()),
  },
  {
    id: 'rig.swapSides',
    label: 'Swap left and right',
    category: 'Rig',
    description: 'The left limbs take the right limbs\' pose and the other way round, without flipping anything. For side-on characters: the second half of a walk.',
    keywords: ['swap legs', 'other foot', 'walk cycle', 'opposite pose', 'side view'],
    help: 'rig-pose-library',
    enabled: hasBones,
    run: () => say(swapCurrentSides()),
  },
  {
    id: 'rig.resetPose',
    label: 'Reset pose',
    category: 'Rig',
    description: 'Puts every bone back where it was drawn, on this frame.',
    keywords: ['rest pose', 'bind pose', 'setup pose', 't-pose', 'reset bones'],
    help: 'rig-posing',
    enabled: hasBones,
    run: () => say(resetPose()),
  },
  {
    id: 'rig.togglePin',
    label: 'Pin or unpin the bone',
    category: 'Rig',
    description: 'A pinned bone stays where it is while you move the others, like a foot planted on the floor.',
    keywords: ['pin', 'lock', 'plant', 'ik pin', 'stay'],
    help: 'rig-posing',
    enabled: (s) => !!selectedBone(s),
    run: () => {
      const rig = currentRig();
      const b = selectedBone(store().get());
      if (rig && b) setPin(rig.id, b.id, !b.pin);
      requestOverlay();
    },
  },
  {
    id: 'rig.deleteBone',
    label: 'Delete bone',
    category: 'Rig',
    help: 'rig-bones',
    enabled: (s) => !!selectedBone(s),
    run: () => void deleteSelectedBone(),
  },
  {
    id: 'rig.boneLook',
    label: 'Slim bones',
    category: 'Rig',
    description: 'Shows bones as slim rounded lines instead of the classic pointed shape.',
    keywords: ['bone style', 'bone look', 'display'],
    help: 'rig-bones',
    checked: () => rigUi().look === 'capsule',
    run: () => {
      setRigUi({ look: rigUi().look === 'capsule' ? 'kite' : 'capsule' });
      requestOverlay();
    },
  },
];

/** The command Delete was before the rig changed it, for putting it back when the feature goes. */
let originalDelete: Command | undefined;

// While the Bone or Pose tool is out with a bone picked, Delete removes the bone (not shapes on the layer).
export function takeOverDelete(): void {
  const del = getCommand('edit.delete');
  if (!del) return;
  originalDelete = del;
  const boneOut = (s: State) => (s.ui.tool === 'bone' || s.ui.tool === 'pose') && !!selectedBone(s);
  registerCommand({
    ...del,
    enabled: (s) => boneOut(s) || (del.enabled ? del.enabled(s) : true),
    run: () => (boneOut(store().get()) ? void deleteSelectedBone() : del.run()),
  });
}

/** Gives Delete back as it was. */
export function giveBackDelete(): void {
  if (originalDelete) registerCommand(originalDelete);
  originalDelete = undefined;
}
