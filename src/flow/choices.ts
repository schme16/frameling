// Asked the first time a clip flow gets an "Any clip" arrow next to arrows of its own, then remembered.
import type { ChoiceDef } from '../core/choices';

export const flowChoices: ChoiceDef<'any' | 'own'>[] = [
  {
    id: 'flow.anyFirst',
    title: 'Any clip arrows and a clip\'s own arrows',
    question: 'Sometimes an "Any clip" arrow (like hurt) and a clip\'s own arrow (like run to jump) are ready at the same moment. Which should go first?',
    options: [
      { value: 'any', label: 'The Any clip arrow', detail: 'Hurt cuts in on whatever is playing, even if the clip had somewhere else to go.', did: 'Any clip arrows go first.' },
      { value: 'own', label: 'The clip\'s own arrow', detail: 'A clip finishes its own business first. Any clip arrows only go when nothing else is ready.', did: 'A clip\'s own arrows go first.' },
    ],
    default: 'any',
    category: 'Timeline',
    help: 'clip-flow',
  },
];
