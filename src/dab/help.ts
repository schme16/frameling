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
    id: 'pixel-brush-curves',
    order: 1.565,
    media: 'pixel-brush-curves.mp4',
    title: 'Pixel brush: how the pen feels (response curves)',
    section: 'Pixel art',
    summary: 'Bend the line between how hard you press and what the brush does, so a light hand still gets a full mark or a firm hand is needed to get one. Ready-made feels, or drag your own.',
    keywords: ['curve', 'response curve', 'pen feel', 'sensitivity', 'light touch', 'procreate', 'krita', 'photoshop', 'control curve', 'ease', 'gamma'],
  },
  {
    id: 'pixel-brush-blend',
    order: 1.575,
    media: 'pixel-brush-blend.png',
    title: 'Pixel brush: paint modes (Multiply, Screen and friends)',
    section: 'Pixel art',
    summary: 'Let the brush darken, lighten, tint or cut light out of what is already on the layer, the way a layer blend mode does, without making a layer for it. Shading, glows and recolouring in one stroke.',
    keywords: ['blend', 'blend mode', 'paint mode', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'dodge', 'burn', 'colour only', 'tint', 'shade', 'shading', 'glow', 'photoshop', 'krita', 'procreate', 'composite'],
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
