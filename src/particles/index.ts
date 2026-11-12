// Particles: emitters as shapes in vector drawings, worked out per frame from a seed (see model.ts). A feature that can
// be turned off (Preferences > Features). The shape kind (draw, hit, export, file reading) is registered for good by
// kind.ts, so a drawing that holds an emitter still draws, exports and saves with the feature off; what goes is the
// panel, the commands and the choice about where new particles go.
import { lazyPanel } from '../core/lazy';
import { defineFeature } from '../features/feature';
import './kind';
import { particlesCommands } from './commands';
import { particlesHelp } from './help';
import { particlesWhere } from './ops';

export const particlesFeature = defineFeature({
  id: 'particles',
  name: 'Particles',
  about: 'Sparks, snow, smoke and confetti that move on their own.',
  optional: true,
  commands: particlesCommands,
  panels: [{ id: 'particles', title: 'Particles', icon: 'particles', component: lazyPanel(() => import('./ParticlesPanel').then((m) => m.ParticlesPanel)), zone: 'right', order: 36, help: 'particles' }],
  help: particlesHelp,
  choices: [particlesWhere],
  templates: ['explosion-fx'],
  usedBy: (doc) => Object.values(doc.drawings).some((d) => d.kind === 'vector' && d.shapes.some((s) => s.type === 'particles')),
});
