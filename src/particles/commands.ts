// Particles as commands: one per preset in the palette and the Effects menu, plus shuffle.
import type { Command } from '../core/registry';
import { showPanel } from '../ui/dock';
import { PARTICLE_PRESETS } from './model';
import { addParticles, selectedParticles, shuffleSeed } from './ops';

const add = (id: string) => () => {
  addParticles(id);
  showPanel('particles');
};

export const particlesCommands: Command[] = [
  ...PARTICLE_PRESETS.map(
    (p): Command => ({
      id: `particles.add.${p.id}`,
      label: `Add particles: ${p.label}`,
      category: 'Effects',
      description: p.description,
      help: 'particles',
      keywords: ['particles', 'emitter', 'particle system', 'fx', p.label.toLowerCase()],
      run: add(p.id),
    }),
  ),
  {
    id: 'particles.shuffle',
    label: 'Shuffle the selected particles',
    category: 'Effects',
    description: 'Same settings, a new random spread (a new seed).',
    help: 'particles',
    keywords: ['seed', 'random', 'particles'],
    enabled: () => selectedParticles().length > 0,
    run: shuffleSeed,
  },
];
