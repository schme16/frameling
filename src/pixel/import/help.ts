import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'pixel-import',
    order: 12,
    media: 'pixel-import.png',
    title: 'Bringing in pictures and sprite sheets',
    section: 'Pixel art',
    summary: 'Open a PNG, an animated GIF, PNG or WebP, or a sprite sheet, cut it into frames and choose how the sprite is built.',
    keywords: ['import', 'png', 'gif', 'animated gif', 'apng', 'animated png', 'webp', 'animated webp', 'open image', 'drop', 'colours', 'palette', 'picture'],
  },
  {
    id: 'palette-picture',
    order: 14,
    media: 'palette-picture.png',
    title: 'Taking the colours from a picture',
    section: 'Pixel art',
    summary: 'Turn a photo or a painting into a palette. You set the most colours to take, and big pictures never hold Frameling up.',
    keywords: ['palette', 'colours', 'colors', 'picture', 'photo', 'image', 'extract', 'quantise', 'quantize', 'reduce', 'limit colours', 'most colours', 'median cut', 'swatches', 'import'],
  },
  {
    id: 'pixel-sheets',
    order: 13,
    media: 'pixel-import-sheet.png',
    title: 'Cutting a sprite sheet',
    section: 'Pixel art',
    summary: 'Cut a sheet into frames by a grid, by the gaps between sprites, or by the JSON that came with it.',
    keywords: ['sprite sheet', 'spritesheet', 'atlas', 'slice', 'grid', 'cut', 'frames', 'texturepacker', 'aseprite json', 'phaser', 'pixi', 'margin', 'spacing', 'frame order'],
  },
]);
