// The words of the help topics in recolour-open.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'recolour-animation': `Made a character in red and want a blue one? Click **Recolour the whole animation...** at the bottom of the Colours panel (or find it in the command palette).

1. **Pick a colour to change.** The row shows the colours your animation uses, most used first.
2. **Pick what it becomes.** Click the colour box, or **Use my current colour** for the colour in the box in front.
3. Check the **Now** and **After** pictures of this frame, then click **Recolour**.

It changes every frame and every layer: brush lines, fills, shape outlines, gradients, text, particles, symbol colour washes, pixel drawings and tiles, the colours of layer and folder effects (glow, shadow and outline), and your swatches too.

## Close colours too

Off, only that exact colour changes. Slide it up and nearby shades shift along with it, by the same amount, so shading you made from lighter and darker versions of the colour comes along and stays shaded.

## Changed your mind?

It's one step: **Undo** puts everything back.`,
};
