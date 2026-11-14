// Pixel text commands for the palette and the Pixel menu. The Text tool itself (T) is the tool's own command.
import type { Command } from '../../core/registry';
import { store } from '../../core/store';
import { hint } from '../../canvas/controller';
import { activePixelLayer } from '../../pixel/tools';
import { MAX_SCALE, MIN_SCALE, pixelFont, type PixelFontId } from './font';
import { getPixelText, setPixelText } from './settings';

/** Switches to the Text tool, or says plainly why it can't here. */
function typePixelText(): void {
  if (!activePixelLayer()) return hint('Pixel text goes on a pixel layer. Pick one in the timeline, or add one with Pixel in the Layers header.');
  store().setUi({ tool: 'text' });
  hint('Click on the picture, type, and press Esc to finish.');
}

const fontCommand = (id: PixelFontId): Command => ({
  id: `text.pixelFont.${id}`,
  label: `Pixel text font: ${pixelFont(id).name}`,
  category: 'Pixel',
  description: `Types pixel text in the ${pixelFont(id).name} font: ${pixelFont(id).blurb}.`,
  help: 'pixel-text',
  keywords: ['pixel text', 'pixel font', 'bitmap font', 'font', id],
  checked: () => getPixelText().font === id,
  run: () => setPixelText({ font: id }),
});

const step = (by: number) => () => setPixelText({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, getPixelText().scale + by)) });

export const pixelTextCommands: Command[] = [
  {
    id: 'text.pixelType',
    label: 'Type pixel text',
    category: 'Pixel',
    description: 'Picks the Text tool for a pixel layer: click, type, and the words land on the pixel grid in a pixel font, in the Paint colour, with no smoothing.',
    help: 'pixel-text',
    keywords: ['pixel text', 'pixel font', 'bitmap font', 'type', 'label', 'words', 'letters', 'caption', 'no anti-alias', 'crisp text'],
    run: typePixelText,
  },
  fontCommand('classic'),
  fontCommand('tiny'),
  {
    id: 'text.pixelBold',
    label: 'Pixel text: bold',
    category: 'Pixel',
    description: 'Turns bold on or off for new pixel text: every pixel gets one more beside it.',
    help: 'pixel-text',
    keywords: ['pixel text', 'bold', 'thick letters', 'heavier'],
    checked: () => getPixelText().bold,
    run: () => setPixelText({ bold: !getPixelText().bold }),
  },
  {
    id: 'text.pixelBigger',
    label: 'Pixel text: bigger',
    category: 'Pixel',
    description: 'Makes new pixel text one whole step bigger (each font pixel becomes a bigger block).',
    help: 'pixel-text',
    keywords: ['pixel text', 'bigger', 'larger', 'size', 'scale', 'zoom text'],
    enabled: () => getPixelText().scale < MAX_SCALE,
    run: step(1),
  },
  {
    id: 'text.pixelSmaller',
    label: 'Pixel text: smaller',
    category: 'Pixel',
    description: 'Makes new pixel text one whole step smaller.',
    help: 'pixel-text',
    keywords: ['pixel text', 'smaller', 'size', 'scale'],
    enabled: () => getPixelText().scale > MIN_SCALE,
    run: step(-1),
  },
];
