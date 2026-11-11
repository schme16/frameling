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
  body: `Made a character in red and want a blue one? Click **Recolour the whole animation...** at the bottom of the Colours panel (or find it in the command palette).

1. **Pick a colour to change.** The row shows the colours your animation uses, most used first.
2. **Pick what it becomes.** Click the colour box, or **Use my current colour** for the colour in the box in front.
3. Check the **Now** and **After** pictures of this frame, then click **Recolour**.

It changes every frame and every layer: brush lines, fills, shape outlines, gradients, text, particles, symbol colour washes, pixel drawings and tiles, and your swatches too.

## Close colours too

Off, only that exact colour changes. Slide it up and nearby shades shift along with it, by the same amount, so shading you made from lighter and darker versions of the colour comes along and stays shaded.

## Changed your mind?

It's one step: **Undo** puts everything back.`,
});
