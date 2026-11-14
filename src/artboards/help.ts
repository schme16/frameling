import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'artboards',
    title: 'Artboards: several canvases in one file',
    section: 'Pixel art',
    media: 'artboards.mp4',
    summary: 'Keep many named canvases side by side in one file: a sprite each, an icon each, or a shot each. They share your palette, swatches and symbols.',
    keywords: ['artboard', 'artboards', 'multiple canvases', 'canvases', 'pages', 'sheets', 'sprites', 'sprite set', 'icons', 'boards', 'Shift+W', 'pasteboard'],
  },
  {
    id: 'artboards-shots',
    title: 'Artboards for animation: shots',
    section: 'Animating',
    media: 'artboards-shots.png',
    summary: 'Each artboard has its own timeline and length, like the shots of a film. Play them all in order, and export one, some or all.',
    keywords: ['shots', 'scenes', 'storyboard', 'animatic', 'sequence', 'cuts', 'film', 'play all', 'artboards animation'],
  },
  {
    id: 'artboards-letterbox',
    title: 'Shots of different sizes: bars or fill',
    section: 'Animating',
    media: 'artboards-letterbox.png',
    summary: 'Shots of different sizes can play and export as one film. Fit shows the whole shot with bars; Fill covers the picture and crops what hangs over.',
    keywords: ['letterbox', 'pillarbox', 'bars', 'black bars', 'fit', 'fill', 'crop', 'different sizes', 'aspect ratio', 'join shots', 'mixed sizes'],
  },
  {
    id: 'variations',
    title: 'Variations: linked copies of an artboard',
    section: 'Animating',
    media: 'variations.mp4',
    summary: 'A variation follows its original and keeps only what you change in it: another colour scheme, another size, another take. Edit the original and every variation follows along.',
    keywords: ['variation', 'variations', 'linked copy', 'linked copies', 'overrides', 'colourway', 'colorway', 'recolour', 'recolor', 'alternate take', 'versions', 'square', 'wide', 'tall', 'sizes', 'social', 'a/b timing', 'differences', 'detach', 'reset to original'],
  },
  {
    id: 'variations-recolour',
    title: 'Recolour a variation (colourways)',
    section: 'Animating',
    media: 'variations-recolour.png',
    summary: 'Make a colourway: pick new colours for a variation, on every frame at once, without touching the original.',
    keywords: ['colourway', 'colorway', 'recolour variation', 'recolor variation', 'change colours', 'palette swap', 'skin', 'team colours', 'variation colours'],
  },
  {
    id: 'artboards-export',
    title: 'Exporting artboards',
    section: 'Exporting',
    media: 'artboards-export.png',
    summary: 'Export each artboard as its own file (into a folder or one zip), all of them in order as one, or every frame packed onto one picture (an atlas).',
    keywords: ['export artboards', 'export all', 'batch export', 'atlas', 'texture atlas', 'pack', 'zip', 'each sprite'],
  },
]);
