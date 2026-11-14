// Asked the first time a clip flow gets an "Any clip" arrow next to arrows of its own, then remembered.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const flowChoices: ChoiceDef<'any' | 'own'>[] = [
  {
    id: 'flow.anyFirst',
    title: choiceWord('choice.flow.anyFirst.title'),
    question: choiceWord('choice.flow.anyFirst.question'),
    options: [
      { value: 'any', label: choiceWord('choice.flow.anyFirst.any.label'), detail: choiceWord('choice.flow.anyFirst.any.detail'), did: choiceWord('choice.flow.anyFirst.any.did') },
      { value: 'own', label: choiceWord('choice.flow.anyFirst.own.label'), detail: choiceWord('choice.flow.anyFirst.own.detail'), did: choiceWord('choice.flow.anyFirst.own.did') },
    ],
    default: 'any',
    category: 'Timeline',
    help: 'clip-flow',
  },
];
