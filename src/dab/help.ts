// Help for the pixel brush. Plain words first, the usual paint program term second.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-brush',
    order: 1.55,
    media: 'pixel-brush.png',
    title: 'Pixel brush: tips, spacing and scatter',
    section: 'Pixel art',
    summary: 'A brush made of dabs you can shape: a round, square or picture tip, how far apart the dabs go, scatter, and sharp pixels or a smooth edge. Save yours in the brush picker. On pixel layers.',
    keywords: ['pixel brush', 'brush', 'dab', 'tip', 'spacing', 'scatter', 'jitter', 'angle', 'roundness', 'anti-aliasing', 'antialiasing', 'aliased', 'stamp', 'picture brush', 'custom brush', 'flow', 'opacity', 'photoshop', 'krita', 'clip studio', 'procreate', 'affinity', 'library', 'saved brushes'],
  },
  {
    id: 'pixel-brush-dynamics',
    order: 1.56,
    media: 'pixel-brush-dynamics.png',
    title: 'Pixel brush: pen, speed, fade and colour',
    section: 'Pixel art',
    summary: 'Let the pen, the speed of your hand or a fade-out change the size, flow, angle or scatter of every dab, and let the colour wander or smear along the stroke. Works with a mouse too.',
    keywords: ['tilt', 'twist', 'speed', 'velocity', 'fade', 'taper', 'dynamics', 'control', 'minimum diameter', 'hue jitter', 'colour jitter', 'color jitter', 'wobble', 'wet', 'mixer', 'mix', 'smear', 'pen', 'tablet', 'photoshop', 'krita', 'procreate', 'clip studio', 'back colour', 'fill colour'],
  },
  {
    id: 'pixel-brush-texture',
    order: 1.57,
    media: 'pixel-brush-texture.png',
    title: 'Pixel brush: grain and dual tip',
    section: 'Pixel art',
    summary: 'Give a brush a paper to catch on, or a second tip of little dots, for chalk, pencil, sponge, spatter and bristle looks, in sharp pixels.',
    keywords: ['grain', 'texture', 'paper', 'tooth', 'dual', 'dual brush', 'second tip', 'spatter', 'bristle', 'sponge', 'chalk', 'pencil', 'speckle', 'stipple', 'photoshop', 'krita', 'procreate', 'scatter'],
  },
]);
