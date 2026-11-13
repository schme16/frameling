// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-select': `Press **V** on a pixel layer, then choose how to pick in the tool options:

- **Box**: drag a rectangle (a *marquee*).
- **Lasso**: draw round what you want. Hold **Alt** as you let go and each **Alt+click** adds a straight side; click without Alt (or on the first point) to finish.
- **Polygon**: click each corner, one at a time, and click the first corner again to close it. **Escape** gives up on it. Good for anything with straight edges, where a freehand lasso wobbles.
- **Magic wand**: click a colour to pick it. **Colour match** lets close colours in too, and turn off **Only touching pixels** to pick that colour everywhere. Shortcut: **W**.

The selected part gets a crawling dashed edge (*marching ants*).

**Adding and taking away.** Hold **Shift** to add to the selection, **Alt** to take away (start outside the selection), both to keep only the overlap. Or set **Each new pick** in the options.

**Moving.** Drag inside the selection to move those pixels (Shift keeps it straight). The arrow keys nudge one pixel, ten with Shift. The pixels float above the drawing while you move them, and land when you deselect, pick another tool, or change frame or layer. However many drags and nudges it took, it's **one undo step**. Undo while they're still floating just puts them back. Undo and Redo bring the selection back too, as it was before and after each step.

**Copying.** Hold **Alt** and drag inside the selection to drag a copy, leaving the original. **Ctrl+D** (*duplicate*) makes a copy one pixel down and right, ready to drag. If you'd rather Alt always took away, change it in Preferences, Behaviour.

**Copy, cut and paste.** Ctrl+C, Ctrl+X and Ctrl+V work on the selected pixels. A paste lands in the same place, floating, ready to drag. It works across frames and layers.

**Everything else stays inside.** With a selection:

- Painting (pencil, brush, eraser, shade, dither, shapes, the paint bucket) only changes selected pixels.
- **Delete** clears the selected pixels.
- The Pixel menu's flips and turns work on just the selection, around its middle, and the selection turns too.
- **Add outline** goes round just the selected art, onto empty pixels.
- **Reduce to palette** changes only the selected pixels.

**Ctrl+A** selects everything, **Ctrl+Shift+I** inverts (selects everything else), **Escape** lets go. The selection stays put when you change frame, so you can work on the same spot frame after frame.`,
  lasso: `Press **Shift+L**, or pick **Lasso** in the Select tool's options.

- **Drag round** what you want. When you let go, every shape the lasso touches is selected.
- **Straight sides:** hold **Alt** as you let go, then **Alt+click** each corner. Click without Alt, or on the first point, to finish. **Escape** gives up.
- **Shift** adds to what's already selected.

On a **merge layer** (where shapes join like paint) the lasso cuts out exactly what's inside it, so you can lift out just part of a painted area and move it, recolour it or delete it.

On a pixel layer the lasso picks pixels instead: see [Selecting pixels](help:pixel-select).`,
};
