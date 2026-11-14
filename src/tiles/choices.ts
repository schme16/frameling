// The tile choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type AutoEdgesChoice = 'on' | 'off';
export const AUTO_EDGES = 'tiles.autoEdges';

registerChoice<AutoEdgesChoice>({
  id: AUTO_EDGES,
  title: choiceWord('choice.tiles.autoEdges.title'),
  question: choiceWord('choice.tiles.autoEdges.question'),
  category: 'Drawing',
  default: 'on',
  help: 'tile-terrains',
  options: [
    { value: 'on', label: choiceWord('choice.tiles.autoEdges.on.label'), detail: choiceWord('choice.tiles.autoEdges.on.detail'), did: choiceWord('choice.tiles.autoEdges.on.did') },
    { value: 'off', label: choiceWord('choice.tiles.autoEdges.off.label'), detail: choiceWord('choice.tiles.autoEdges.off.detail'), did: choiceWord('choice.tiles.autoEdges.off.did') },
  ],
});
