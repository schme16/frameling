// Help for selecting pixels, and the lasso on vector layers.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-select',
    title: 'Selecting pixels',
    section: 'Pixel art',
    media: 'pixel-select.mp4',
    summary: 'Pick part of a pixel drawing with a box, a lasso or the magic wand, then move it, copy it, flip it or paint inside it.',
    keywords: ['selection', 'duplicate', 'alt drag copy', 'marquee', 'lasso', 'magic wand', 'select colour', 'move pixels', 'floating selection', 'marching ants', 'invert', 'mask'],
  },
  {
    id: 'lasso',
    title: 'Lasso',
    section: 'Drawing',
    media: 'lasso.mp4',
    summary: 'Draw round shapes to select them, or on a merge layer cut out exactly the bit inside.',
    keywords: ['lasso', 'freehand selection', 'polygon lasso', 'draw round', 'cut out'],
  },
]);
