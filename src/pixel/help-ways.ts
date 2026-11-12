// Help for starting a pixel sprite, the four ways to build one, and the Paint and Back colours.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-new',
    order: 3,
    title: 'Starting a pixel sprite',
    section: 'Pixel art',
    media: 'pixel-new.png',
    summary: 'File > New > Pixel art: Quill asks what you are making, you pick a size, and a ready sprite opens.',
    keywords: ['new pixel art', 'chooser', 'sprite', 'start', 'one picture', 'animation', 'boards', 'size', 'aseprite'],
  },
  {
    id: 'pixel-ways',
    order: 4,
    title: 'The four ways to build a sprite',
    section: 'Pixel art',
    media: 'pixel-ways.mp4',
    summary: 'One picture, an animation, frames on boards or a cast on one sheet: the chip in the pixel bar says which, and you can change it.',
    keywords: ['way', 'mode', 'chip', 'one picture', 'animation', 'frames on boards', 'convert', 'artboards', 'timeline', 'make it move', 'change how'],
  },
  {
    id: 'pixel-wells',
    order: 5,
    title: 'Paint and Back colours',
    section: 'Pixel art',
    media: 'pixel-wells.png',
    summary: 'In the Pixel workspace two big squares at the top of the Palette hold the colour you paint with and a second colour behind it.',
    keywords: ['paint', 'back', 'foreground', 'background', 'swap', 'eyedropper', 'right click', 'alt', 'wells', 'colour'],
  },
]);
