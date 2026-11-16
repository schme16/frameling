// The words of the help topic in pairs-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'draw-anywhere': `You never have to hop to the right layer first. Press **Pixels** or **Vectors** at the top of the tool strip, then just draw. If the layer you are on is the other kind, your stroke lands on a layer of the right kind right next to it.

## What happens

You are on a vector layer called "Ink" and press **Pixels**. Nothing moves yet. The switch just lights Pixels.

Draw. Frameling makes a pixel layer called "Ink (pixels)" beside it, and the stroke lands there. The first time, a note names the layer it made. After that it just happens.

Your next stroke goes straight on. Press **Vectors** to go back to the vector half and draw smooth lines again.

Press **Ctrl+Alt+X** to swap the switch from the keyboard.

Tools that only work on one kind do the same. Pick Shade on a vector layer and your next stroke goes on a pixel layer beside it.

## One row, two halves

The two layers show as **one row** in the Layers panel, so it does not fill up. The row has a Pixels chip and a Vectors chip, and the lit one is the half you are drawing on.

- **Click a chip** to go to that half.
- **Right-click a chip** to hide it, lock it, rename it, swap which half is on top, split it off, or delete just that half.
- The **eye** and **padlock** on the row do both halves at once.
- The **...** menu has everything for the pair, and each half too.

Drag the row and both halves move together. Duplicate it and you get a new pair.

## The frames stay together

Both halves always have keys in the same places, with the same holds. Add, move, stretch or delete a key on one and the other follows. A key you add by drawing on one half gets a blank key on the other. Copy and Paste carry both drawings, and moving a drawing (**Alt** with the arrow keys) moves both.

A glide (tween) stays with the half that has it.

## Undo

One **Undo** takes back the stroke and the layer it made, together. The document is exactly as it was.

## If you would rather not

- **Split the pair into two layers** makes them two ordinary layers again. Their frames and drawings stay, but they stop following each other. Press **Ctrl+K** and type it, or find it under **Pixels and vectors** in the **Layers and artboards** menu.
- In **Preferences, Behaviour**, answer **Just tell me how** to the question about drawing with no layer of that kind. Frameling then never makes a layer for you, and tells you how to add one.

**Good to know:**
- A locked half stops the other half's frames from changing. Unlock it first.
- Tile layers, the camera and a bones layer cannot have a pair.
- Files from before this open exactly as they were.

See also [Pixels or Vectors](help:drawing-mode) and [Layers](help:timeline-layers).`,
};
