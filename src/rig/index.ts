// Bones: skeletons, attaching layers, posing with IK and pins, bending meshes and the pose library. A feature that can be
// turned off (Preferences > Features). How a layer attached to a bone is moved or bent is registered for good by kind.ts,
// so a puppet still moves, exports and saves with the feature off; what goes is the Rig panel, the Bone, Pose and Weights
// tools, the commands, the choice about posing a new frame, the lesson, help and the puppet template.
import { defineFeature } from '../features/feature';
import './kind';
import { giveBackDelete, rigCommands, rigPanel, takeOverDelete } from './commands';
import { rigHelp } from './help';
import { newPoseChoice } from './ops';
import { setRigUi } from './state';
import { boneTool, poseTool } from './tools';
import { weightsTool } from './weightsTool';
import { layerOf, toolIs } from '../ui/panelInfo';
import type { Doc, Layer } from '../core/format';

/** Every layer a document holds: the stage's, the symbols' and the artboards'. */
function eachLayer(doc: Doc): Layer[] {
  return [...doc.layers, ...Object.values(doc.symbols ?? {}).flatMap((s) => s.layers), ...(doc.artboards ?? []).flatMap((a) => a.content?.layers ?? [])];
}

export const rigFeature = defineFeature({
  id: 'rig',
  name: 'Rig',
  about: 'Bones and skins to pose a character like a puppet.',
  optional: true,
  commands: rigCommands,
  panels: [rigPanel],
  tools: [boneTool, poseTool, weightsTool],
  help: rigHelp,
  choices: [newPoseChoice],
  templates: ['puppet'],
  sections: {
    rig: {
      blurb: 'Bones for puppet animation: build a skeleton, attach drawings and pose it.',
      group: 'properties',
      section: true,
      relevant: (s) => toolIs('bone', 'pose', 'weights')(s) || !!(layerOf(s) as { rig?: unknown } | undefined)?.rig,
      idle: 'Pick the Bone tool',
      keywords: ['bones', 'skeleton', 'puppet', 'pose'],
    },
  },
  // A bones layer, or a layer attached to a bone (the puppet stays in the file).
  usedBy: (doc) => eachLayer(doc).some((l) => ('rig' in l && !!l.rig) || !!l.bind),
  // The Delete key also removes a picked bone while the feature is on.
  activate: takeOverDelete,
  deactivate() {
    giveBackDelete();
    setRigUi({ selected: null });
  },
});
