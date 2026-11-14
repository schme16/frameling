// Help for selecting pixels, and the lasso on vector layers.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-select',
    title: 'Selecting pixels',
    section: 'Pixel art',
    media: 'pixel-select.mp4',
    summary: 'Pick part of a pixel drawing with a box, a lasso, a polygon, a magnetic lasso or the magic wand, then move it, copy it, flip it or paint inside it.',
    keywords: ['selection', 'duplicate', 'alt drag copy', 'marquee', 'lasso', 'polygon', 'magnetic lasso', 'magic wand', 'select colour', 'move pixels', 'floating selection', 'marching ants', 'invert', 'mask'],
  },
  {
    id: 'select-magnetic',
    title: 'Magnetic lasso',
    section: 'Pixel art',
    media: 'select-magnetic.mp4',
    summary: 'Trace roughly round something and the outline clings to its edge, so you do not need a steady hand to cut a character out of its background.',
    keywords: ['magnetic', 'magnetic lasso', 'magnet', 'edge', 'snap', 'cling', 'follow edge', 'smart select', 'intelligent scissors', 'cut out', 'trace', 'outline', 'Shift+E'],
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
