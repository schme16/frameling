// The words of the Transform help topic, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  transform: `The **Transform** tool puts a box round what you have selected, with handles to move it, turn it, stretch it and slant it, the way you would in any drawing app. Press **Q**, or pick it in the toolbar beside Select. It works on shapes (one or several), on a symbol, and on selected pixels.

Click a shape to pick it, or select first with the [Select tool](help:tool-select) and then press **Q**. Hold **Shift** and click to add more shapes.

**Move.** Drag anywhere inside the box. **Shift** keeps it straight across or up and down. The arrow keys nudge it a pixel, ten with **Shift**.

**Stretch.** Drag a corner. **Shift** keeps the proportions. **Alt** works from the pivot (the middle, to begin with) instead of the opposite corner. Drag past the far side and it flips.

**Squash.** Drag the middle of a side, to make it taller or wider one way only.

**Slant.** Hold **Ctrl** (**Cmd** on a Mac) and drag the middle of a side. The side slides along itself and the opposite side stays put. **Shift** snaps it to 15 degrees. (The industry word is *skew*. If you would rather use **Shift**, change it in **Preferences > Behaviour**.)

**Turn.** Drag the round knob above the box. **Shift** snaps to 15 degrees.

**The pivot.** The little cross is the point things turn round (and scale from, with **Alt**). Drag it anywhere; it clings to the corners, sides and middle when it is close, and holding **Alt** while you drag it lets it go anywhere. **Pivot to the middle** puts it back.

**Apply or put back.** Nothing changes in your drawing until you press **Enter** or click away. **Escape** puts it all back. However many drags it took, applying is **one step in Undo**. Drag as much as you like: it always works from what you started with.

## Pixels

Pixels can't be turned or squashed without being picked again, so that part is lossy. Frameling never blends them, so every pixel stays one of your colours. Moves by whole pixels, flips and right angles are exact. Stretching picks the nearest pixel. Turning and slanting double the art first (Scale2x) so diagonals come out smoother; **Preferences > Behaviour** can switch that off. The options bar tells you whenever a change picks pixels again.

## Good to know

- Typing exact numbers in the **Position and size** boxes does the same thing as dragging, so a typed turn and a dragged turn agree. See [Exact position and size](help:selection-numbers).
- **Ctrl+Z** while a transform is open puts it back (nothing has landed yet). Changing frame or layer does too.
- The Select tool still moves, resizes and turns; Transform adds the sides, slanting and the pivot.`,
};
