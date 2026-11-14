import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'effects',
    order: 1,
    title: 'Effects: glow, shadow, blur and more',
    section: 'Effects',
    media: 'effects.mp4',
    summary: 'Give a layer a glow, a shadow, a soft blur, an outline, new colours or big pixels. Open the Effects panel and pick one.',
    keywords: ['effect', 'fx', 'glow', 'shadow', 'drop shadow', 'blur', 'outline', 'stroke', 'pixelate', 'mosaic', 'hue', 'saturation', 'brightness', 'contrast', 'colour adjust', 'animate effect'],
  },
  {
    id: 'blend-modes',
    title: 'Blend modes: how a layer mixes',
    section: 'Effects',
    media: 'blend-modes.png',
    summary: 'Make a layer darken like ink, lighten like light, glow, or only colour what is under it. Set it at the top of the Effects panel.',
    keywords: ['blend', 'blend mode', 'multiply', 'screen', 'overlay', 'add', 'lighter', 'soft light', 'hard light', 'difference', 'colour', 'color', 'hue', 'luminosity', 'mix', 'subtract', 'divide'],
  },
  {
    id: 'masks',
    title: 'Masks and clipping',
    section: 'Effects',
    media: 'masks.png',
    summary: 'Paint where a layer shows with a mask, in one press, and switch it off without losing it. Or clip a layer to the one below it.',
    keywords: ['mask', 'clipping mask', 'clip', 'clip to below', 'reveal', 'stencil', 'cut out', 'inside the lines', 'layer mask'],
  },
  {
    id: 'layer-folders',
    title: 'Layer folders',
    section: 'Effects',
    media: 'layer-folders.png',
    summary: 'Put layers in a folder to fade, blend, mask and add effects to them together. Folders can sit inside folders. Fold one shut to tidy the timeline.',
    keywords: ['folder', 'group', 'layer group', 'collapse', 'tidy'],
  },
]);
