// The words of the help topics in recolour-open.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'recolour-animation': `Made a character in red and want a blue one? Click **Recolour the whole animation...** at the bottom of the Colours panel (or find it in the command palette).

1. **Pick where.** **Everything** is the default. See below for the others.
2. **Pick a colour to change.** The row shows the colours your animation uses, most used first.
3. **Pick what it becomes.** Click the colour box, or **Use my current colour** for the colour in the box in front.
4. Check the **Now** and **After** pictures of this frame, then click **Recolour**.

On **Everything** it changes every frame and every layer: brush lines, fills, shape outlines, gradients, text, particles, symbol colour washes, pixel drawings and tiles, the colours of layer and folder effects (glow, shadow and outline), and your swatches too.

## Only part of it

Want the shirt to change but not the background that shares its red? Use the **Where** buttons at the top:
- **Everything:** every frame and every layer, and your swatches.
- **This layer:** every frame of the layer you're on, and its effects. The other layers keep their colours.
- **This frame:** the drawing showing on this frame, on every layer. A drawing held for several frames changes on all of them.
- **The selection:** only the shapes or pixels you have selected.

The colour row then lists only the colours in that part, and the **Now** and **After** pictures show the change. Frameling remembers your last pick, unless there's nothing to use it on (no selection), when it opens on **Everything**. Change it any time in **Preferences > Behaviour**, or press **Ctrl+K** and type "recolour layer", "recolour frame" or "recolour selection".

Good to know: the stage colour and swatches only change on **Everything**. A [variation](help:variations) changes as a whole, so go to the original to limit a recolour.

## Close colours too

Off, only that exact colour changes. Slide it up and nearby shades shift along with it, by the same amount, so shading you made from lighter and darker versions of the colour comes along and stays shaded.

## Changed your mind?

It's one step: **Undo** puts everything back.`,
};
