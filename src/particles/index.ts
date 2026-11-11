// Particles: emitters as shapes in vector drawings, worked out per frame from a seed (see model.ts).
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './commands';
import './help';

registerPanel({ id: 'particles', title: 'Particles', icon: 'particles', component: lazyPanel(() => import('./ParticlesPanel').then((m) => m.ParticlesPanel)), zone: 'right', order: 36, help: 'particles' });
