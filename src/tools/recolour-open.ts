// The "Recolour the whole animation" command and help. The dialog loads when first opened.
import { registerCommand, registerHelp } from '../core/registry';

export function openRecolour(): void {
  void import('./RecolourDialog').then((m) => m.openRecolourDialog());
}

registerCommand({
  id: 'colors.recolourAll',
  label: 'Recolour the whole animation...',
  category: 'Draw',
  description: 'Swap one colour for another on every frame and layer, vector and pixel (palette swap).',
  help: 'recolour-animation',
  keywords: ['palette swap', 'replace colour', 'replace color', 'swap colour', 'recolor', 'change colour everywhere', 'find and replace'],
  run: openRecolour,
});

registerHelp({
  id: 'recolour-animation',
  title: 'Recolour the whole animation',
  section: 'Drawing',
  order: 6,
  media: 'recolour-animation.png',
  summary: 'Swap one colour for another everywhere at once: every frame, every layer, vector and pixel (a palette swap).',
  keywords: ['palette swap', 'replace colour', 'recolor', 'swap colour', 'find and replace', 'alternate colours', 'skins'],
});
