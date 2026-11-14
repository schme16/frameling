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
];
