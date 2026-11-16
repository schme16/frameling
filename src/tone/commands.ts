// Commands for Curves and Levels. They sit in the Effects menu beside Colour adjust, which they are the pixel-changing cousins of.
import { registerCommands, type Command } from '../core/registry';
import { toast } from '../ui/toast';
import { hint } from '../canvas/controller';
import { gridPixels } from '../core/pixelBounds';
import { activeDrawing, activeGrid } from '../tools/edit';
import { pixelSelection } from '../select/pixel-state';
import { applyTone, openToneDialog, toneProblem } from './ToneDialog';
import { autoPoints, cleanLevels, histograms, neutralTone } from './maths';

const base: Partial<Command> = {
  category: 'Pixel',
  layers: ['pixel'],
  enabled: () => toneProblem() === null,
  reason: () => toneProblem() ?? undefined,
  help: 'curves-levels',
};

/** One step: stretch the picture to use its whole range, the quick win Levels has an Auto button for. */
export function autoLevels(): boolean {
  const d = activeDrawing();
  const g = activeGrid();
  if (!d || d.kind !== 'pixel' || !g) return false;
  const px = gridPixels(d, g.width, g.height);
  const sel = pixelSelection();
  const h = histograms(px, sel && sel.width === g.width && sel.height === g.height ? sel.bits : null);
  const p = autoPoints(h.all);
  if (!p) {
    hint('There is nothing to stretch here: the picture has one tone, or nothing painted.');
    return false;
  }
  const t = neutralTone();
  t.levels.all = cleanLevels({ black: p.black, white: p.white, gamma: 1 });
  return applyTone(t);
}

registerCommands([
  {
    ...base,
    id: 'tone.curves',
    label: 'Curves',
    description: 'A graph you drag to lighten, darken or add contrast to a picture, for all the colours together or one at a time. Rescues a flat or washed out picture. Changes the pixels of this layer, unlike Colour adjust, which is an effect you can switch off. Needs a pixel layer.',
    keywords: ['curves', 'curve', 'tone curve', 'tone', 'brightness', 'contrast', 'exposure', 'washed out', 'flat', 'faded', 'dull', 'rescue', 'fix', 'colour cast', 'color cast', 'lighten', 'darken', 'histogram', 'photoshop', 'adjust', 's curve', 'darks', 'lights', 'shadows', 'highlights'],
    keys: ['Mod+Shift+U'],
    run: () => openToneDialog('curves'),
  } as Command,
  {
    ...base,
    id: 'tone.levels',
    label: 'Levels',
    description: 'Set the darkest and lightest points and the middle of a picture with a histogram in front of you. The quick fix for a picture that looks flat. Changes the pixels of this layer, unlike Colour adjust, which is an effect you can switch off. Needs a pixel layer.',
    keywords: ['levels', 'black point', 'white point', 'gamma', 'midtones', 'histogram', 'brightness', 'contrast', 'exposure', 'washed out', 'flat', 'faded', 'dull', 'rescue', 'fix', 'lighten', 'darken', 'photoshop', 'adjust', 'darks', 'lights', 'shadows', 'highlights'],
    keys: ['Mod+Shift+L'],
    run: () => openToneDialog('levels'),
  } as Command,
  {
    ...base,
    id: 'tone.auto',
    label: 'Stretch the tones to fit (auto levels)',
    description: 'One step: makes the darkest part of the picture black and the lightest white, so a flat picture uses its whole range. Changes the pixels of this layer. A selection limits it to that part. Needs a pixel layer.',
    keywords: ['auto', 'auto levels', 'auto contrast', 'stretch', 'normalise', 'normalize', 'washed out', 'flat', 'faded', 'dull', 'quick', 'one click', 'fix', 'brightness', 'contrast'],
    run: () => {
      if (autoLevels()) toast('Stretched the tones to use the whole range.', { duration: 1800 });
    },
  } as Command,
]);

