import type { HelpTopic } from '../core/registry';
import { interactivesEnabled, ix } from '../features/flags';

export const flowHelp: HelpTopic[] = [
  {
    id: 'clip-flow',
    title: 'Clip flow: what plays after what (state machine)',
    section: 'Animating',
    media: 'clip-flow.png',
    summary: 'Say which clip plays first and what follows what, like idle until jump, then land, then idle again. ' + ix('Games and Interactives play it for you.', 'Games play it for you.'),
    keywords: ['state machine', 'state graph', 'states', 'transitions', 'animation tree', 'animator', 'clips', 'trigger', 'idle', 'jump', 'Godot', ...(interactivesEnabled() ? ['Interactives'] : [])],
  },
  {
    id: 'clip-flow-inputs',
    title: 'Clip flow inputs: speed, on the ground, health',
    section: 'Animating',
    media: 'clip-flow-inputs.mp4',
    summary: 'Let a character react: run faster as speed goes up, jump only when on the ground, play the hurt clip from any clip.',
    keywords: ['inputs', 'conditions', 'parameters', 'state machine', 'any state', 'any clip', 'blend', 'fade', 'crossfade', 'speed', 'grounded', 'health', 'hurt', 'animator', 'Godot', ...(interactivesEnabled() ? ['Interactives'] : [])],
  },
];
