// Clip flow commands and its panel.
import type { Command } from '../core/registry';
import { showPanel } from '../ui/dock';
import { FLOW_ANY } from '../core/format';
import { tl } from '../timeline/state';
import { addFlowInput, connectClips, startTrying, stopTrying, tryingClip } from './ops';

export const flowCommands: Command[] = [
  {
    id: 'flow.open',
    label: 'Clip flow (state machine)...',
    category: 'Animate',
    description: 'Say which clip plays first and what follows what: idle until jump, jump then land.',
    keywords: ['state machine', 'state graph', 'animation tree', 'transitions', 'states', 'clips', 'animator', 'blend tree'],
    help: 'clip-flow',
    run: () => showPanel('clip-flow'),
  },
  {
    id: 'flow.try',
    label: 'Try the clip flow',
    category: 'Animate',
    description: 'Plays the first clip, then follows the clip flow as clips end. Fire triggers from the Clip flow panel.',
    keywords: ['state machine', 'preview', 'test', 'play states'],
    help: 'clip-flow',
    enabled: (s) => s.doc.clips.length > 0,
    checked: () => !!tryingClip(),
    run: () => (tryingClip() ? stopTrying() : startTrying()),
  },
  {
    id: 'flow.addToggle',
    label: 'Add a clip flow input: on/off',
    category: 'Animate',
    description: 'A named switch the game sets (grounded, hurt), so arrows can check it.',
    keywords: ['state machine', 'input', 'boolean', 'parameter', 'condition', 'switch', 'grounded'],
    help: 'clip-flow',
    run: () => {
      addFlowInput('toggle');
      showPanel('clip-flow');
    },
  },
  {
    id: 'flow.addNumber',
    label: 'Add a clip flow input: number',
    category: 'Animate',
    description: 'A named number the game sets (speed, health), so arrows can check it.',
    keywords: ['state machine', 'input', 'number', 'float', 'parameter', 'condition', 'speed', 'health'],
    help: 'clip-flow',
    run: () => {
      addFlowInput('number');
      showPanel('clip-flow');
    },
  },
  {
    id: 'flow.fromAny',
    label: 'Play the picked clip from any clip',
    category: 'Animate',
    description: 'Draws an arrow from "Any clip" to the clip picked on the timeline, so it can play from anywhere (a hurt clip).',
    keywords: ['state machine', 'any state', 'from anywhere', 'interrupt', 'hurt', 'transition'],
    help: 'clip-flow',
    enabled: (s) => !!tl().clipId && s.doc.clips.some((c) => c.id === tl().clipId),
    run: () => {
      const id = tl().clipId;
      if (id) connectClips(FLOW_ANY, id);
      showPanel('clip-flow');
    },
  },
];
