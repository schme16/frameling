// The "Recolour the whole animation" command and help. The dialog loads when first opened.
import { registerChoice } from '../core/choices';
import { registerCommand, registerCommands, registerHelp } from '../core/registry';
import { hasPixelSelection } from '../select/pixel-state';
import type { RecolourWhere } from './recolour';
import { choiceWord } from '../words/choices';

export function openRecolour(where?: RecolourWhere): void {
  void import('./RecolourDialog').then((m) => m.openRecolourDialog(where));
}

// Where the dialog starts. It is a preference more than a question, so it never interrupts: the Where buttons in the
// dialog set it, and Preferences > Behaviour can too.
registerChoice<RecolourWhere>({
  id: 'recolour.where',
  title: choiceWord('choice.recolour.where.title'),
  question: choiceWord('choice.recolour.where.question'),
  category: 'Draw',
  default: 'all',
  silent: true,
  help: 'Where the recolour dialog starts: everything, this layer, this frame or the selection. The Where buttons in the dialog change it. A choice that cannot apply (no selection) falls back to everything.',
  options: [
    { value: 'all', label: choiceWord('choice.recolour.where.all.label'), detail: choiceWord('choice.recolour.where.all.detail') },
    { value: 'layer', label: choiceWord('choice.recolour.where.layer.label'), detail: choiceWord('choice.recolour.where.layer.detail') },
    { value: 'frame', label: choiceWord('choice.recolour.where.frame.label'), detail: choiceWord('choice.recolour.where.frame.detail') },
    { value: 'selection', label: choiceWord('choice.recolour.where.selection.label'), detail: choiceWord('choice.recolour.where.selection.detail') },
  ],
});

registerCommand({
  id: 'colors.recolourAll',
  label: 'Recolour the whole animation...',
  category: 'Draw',
  description: 'Swap one colour for another on every frame and layer, vector and pixel (palette swap).',
  help: 'recolour-animation',
  keywords: ['palette swap', 'replace colour', 'replace color', 'swap colour', 'recolor', 'change colour everywhere', 'find and replace'],
  run: () => openRecolour(),
});

registerCommands([
  {
    id: 'colors.recolourLayer',
    label: 'Recolour this layer...',
    category: 'Draw',
    description: 'Swap one colour for another on every frame of the layer you are on, and leave the other layers alone.',
    help: 'recolour-animation',
    keywords: ['palette swap', 'replace colour', 'replace color', 'recolor layer', 'change colour on one layer', 'cel', 'replace in layer'],
    enabled: (st) => st.doc.layers.length > 0,
    run: () => openRecolour('layer'),
  },
  {
    id: 'colors.recolourFrame',
    label: 'Recolour this frame...',
    category: 'Draw',
    description: 'Swap one colour for another on the frame you are on, on every layer, and leave the other frames alone.',
    help: 'recolour-animation',
    keywords: ['palette swap', 'replace colour', 'replace color', 'recolor frame', 'one frame', 'change colour on one frame', 'replace in frame'],
    enabled: (st) => st.doc.layers.length > 0,
    run: () => openRecolour('frame'),
  },
  {
    id: 'colors.recolourSelection',
    label: 'Recolour the selection...',
    category: 'Draw',
    description: 'Swap one colour for another only inside what you have selected, shapes or pixels.',
    help: 'recolour-animation',
    keywords: ['palette swap', 'replace colour', 'replace color', 'recolor selection', 'inside selection', 'replace in selection'],
    enabled: (st) => st.ui.selection.length > 0 || hasPixelSelection(),
    run: () => openRecolour('selection'),
  },
]);

registerHelp({
  id: 'recolour-animation',
  title: 'Recolour the whole animation',
  section: 'Drawing',
  order: 6,
  media: 'recolour-animation.png',
  summary: 'Swap one colour for another everywhere at once, or just on this layer, this frame or the selection. Vector and pixel (a palette swap).',
  keywords: ['palette swap', 'replace colour', 'recolor', 'swap colour', 'find and replace', 'alternate colours', 'skins'],
});
