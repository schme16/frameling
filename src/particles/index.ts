// Particles: emitters as shapes in vector drawings, worked out per frame from a seed (see model.ts).
import { registerPanel } from '../core/registry';
import './commands';
import './help';
import { ParticlesPanel } from './ParticlesPanel';

registerPanel({ id: 'particles', title: 'Particles', icon: 'particles', component: ParticlesPanel, zone: 'right', order: 36, help: 'particles' });
