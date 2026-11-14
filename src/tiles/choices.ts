// The tile choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';

export type AutoEdgesChoice = 'on' | 'off';
export const AUTO_EDGES = 'tiles.autoEdges';

registerChoice<AutoEdgesChoice>({
  id: AUTO_EDGES,
  title: 'Tile edges (terrains)',
  question: 'When you paint with a tile that belongs to a terrain (grass, water), should Frameling pick the right edge and corner tiles for you?',
  category: 'Drawing',
  default: 'on',
  help: 'tile-terrains',
  options: [
    { value: 'on', label: 'Yes, pick them for me', detail: 'Paint with any tile of the terrain and its edges and corners swap to the ones that fit what is around them. Erasing heals the edges too.', did: 'Picking edge tiles for you as you paint.' },
    { value: 'off', label: 'No, paint exactly the tile I chose', detail: 'Every click places the tile you picked, whatever is next to it.', did: 'Painting exactly the tile you pick.' },
  ],
});
