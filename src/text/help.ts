import type { HelpTopic } from '../core/registry';

export const textHelp: HelpTopic[] = [
  {
    id: 'text',
    title: 'Text: titles, captions and speech',
    section: 'Drawing',
    media: 'text.png',
    summary: 'Pick the Text tool (T), click on the stage and type. Change the font, size and colour in the Text panel.',
    keywords: ['text', 'type', 'font', 'title', 'caption', 'words', 'letters', 'typography', 'outline', 'convert to shapes', 'create outlines'],
  },
  {
    id: 'text-animators',
    title: 'Text animations: letters that fade, slide, pop and wave',
    section: 'Animating',
    media: 'text-animators.mp4',
    summary: 'Make letters, words or lines fade in, slide in, grow, spin, type on or wave, one after another. Select text, then pick one in the Text panel.',
    keywords: ['text animator', 'kinetic typography', 'typewriter', 'type on', 'per letter', 'per character', 'per word', 'wave', 'stagger', 'fade in', 'slide in'],
  },
  {
    id: 'text-swap-fonts',
    title: 'Swap fonts: fix a missing font, or change them all',
    section: 'Drawing',
    media: 'text-swap-fonts.png',
    summary: 'Open Edit > Swap fonts to see every font your text uses, which ones this computer does not have, and swap them in one go.',
    keywords: ['swap fonts', 'replace fonts', 'missing font', 'font not found', 'font substitution', 'stand-in font', 'change every font', 'typeface'],
  },
  {
    id: 'pixel-text',
    title: 'Pixel text: crisp letters on a pixel layer',
    section: 'Drawing',
    media: 'pixel-text.png',
    summary: 'Pick the Text tool (T) on a pixel layer, click and type. The letters are a real pixel font, land on the grid and use your palette, with no smoothing.',
    keywords: ['pixel text', 'pixel font', 'bitmap font', 'text on pixel layer', 'no anti-alias', 'no smoothing', 'crisp text', 'blurry text', 'label', 'pixel art text', 'letters', 'words'],
  },
];
