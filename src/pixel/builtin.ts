// Starter palettes that come with the app. Original names and colours; the blurb says what each is good for. Ramps
// run dark to light so shading steps the way you'd expect.
import type { DocPalette } from '../core/format';

export interface StarterPalette {
  id: string;
  blurb: string;
  palette: DocPalette;
}

export const STARTER_PALETTES: StarterPalette[] = [
  {
    id: 'cosy-16',
    blurb: 'Sixteen friendly colours in five ramps. A good all-rounder for characters and props.',
    palette: {
      name: 'Cosy Sixteen',
      colors: [
        '#1d1b26', '#4a4557', '#8a8598', '#e8e3ee',
        '#5a1f33', '#b33a4c', '#ff6f91', '#ffc2cf',
        '#a8501f', '#ff9e3d', '#ffe066',
        '#1f4d3a', '#4f9a45', '#a8e070',
        '#2b4a9e', '#6fb8ff',
      ],
      ramps: [4, 8, 11, 14],
    },
  },
  {
    id: 'pocket-moss',
    blurb: 'Four greens, like an old handheld game screen. Great for learning: shape and shading only.',
    palette: { name: 'Pocket Moss', colors: ['#142b1c', '#2f5b33', '#7ba05b', '#cfe3a0'] },
  },
  {
    id: 'dusk-ramps',
    blurb: 'Four ramps of four: violet, rose, amber and teal. Moody skies and warm lights.',
    palette: {
      name: 'Dusk Ramps',
      colors: [
        '#1b1230', '#3d2a5c', '#6e4c8f', '#a785c4',
        '#4a1c33', '#8f3450', '#d4626f', '#f2a39b',
        '#5c2e14', '#a35a1e', '#e89a3a', '#ffd27a',
        '#0f2b33', '#1f5c5e', '#3f9a8c', '#8fd8c0',
      ],
      ramps: [4, 8, 12],
    },
  },
  {
    id: 'arcade-bright',
    blurb: 'Eight loud, flat colours for chunky retro sprites.',
    palette: { name: 'Arcade Bright', colors: ['#000000', '#7a7a8c', '#ffffff', '#e83b3b', '#ffb636', '#3bd16f', '#3b8fe8', '#b84de8'], ramps: [3, 4, 5, 6, 7] },
  },
  {
    id: 'paper-ink',
    blurb: 'Just two: ink and paper. One-bit art, all about shape.',
    palette: { name: 'Paper and Ink', colors: ['#1d1b26', '#fffaf0'] },
  },
];
