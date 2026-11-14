// The clip flow (state graph): which clip plays first and what follows what, for games and Interactives. A feature
// that can be turned off (Preferences > Features). The flow itself stays in the document (`doc.flow`) either way.
import { lazyPanel } from '../core/lazy';
import { anyFlow } from '../core/scan';
import { defineFeature } from '../features/feature';
import { flowCommands } from './commands';
import { flowChoices } from './choices';
import { flowHelp } from './help';
import { stopTrying, tryingClip } from './ops';

export const flowFeature = defineFeature({
  id: 'flow',
  name: 'Clip flow',
  about: 'A map of how your clips lead into each other, for games.',
  optional: true,
  commands: flowCommands,
  panels: [{ id: 'clip-flow', title: 'Clip flow', icon: 'flow', component: lazyPanel(() => import('./FlowPanel').then((m) => m.FlowPanel)), zone: 'right', order: 38, help: 'clip-flow' }],
  help: flowHelp,
  choices: flowChoices,
  sections: {
    'clip-flow': { blurb: 'How your clips (idle, walk, jump) lead into each other, for games.', group: 'animate', keywords: ['state machine', 'clips', 'game', 'transitions'] },
  },
  usedBy: anyFlow,
  // A flow that is being tried out stops with the feature.
  deactivate() {
    if (tryingClip()) stopTrying();
  },
});
