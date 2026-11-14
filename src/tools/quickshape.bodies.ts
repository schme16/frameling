// The words of the help topic in quickshape.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'hold-to-tidy': `Draw a rough circle and keep the pen still at the end: it turns into a perfect one. It works for straight lines, circles and ellipses, boxes, and triangles and other plain shapes, so a diagram, a face or a mock-up takes seconds.

**Turn it on:** it starts off. Switch it on under **More brush options** with the brush (or in the Pencil's options), with **Hold to tidy** from the command palette (**Ctrl+K**), or the first time you hold on a clear shape, a small message asks if you'd like it.

**How to use it:**
- Draw the shape with the **Brush** or the **Pencil** and **keep the pen still** for a little over half a second. The clean shape appears, with its name beside the pen.
- Still holding? **Drag** to change it: a line follows the pen, and any other shape grows or shrinks. Hold **Shift** for a circle, a square or a 45 degree line.
- Lift the pen to keep it. It is an ordinary outlined shape, so **Edit points** works on it.

**If you didn't want it:**
- Press **Esc** while the clean shape is showing and the whole stroke goes, like any stroke.
- After lifting, press **Keep my line** on the message, or **Ctrl+Z**. That one step gives back your own line. A second Undo removes it.

**It won't surprise you:**
- The pen has to stay within about 3 pixels for the whole hold, so slow, careful drawing never counts.
- The stroke has to fit the shape closely. A loose loop, an arc, a wave or a squiggle is left exactly as you drew it, however long you hold.
- Short marks are left alone.
- If it keeps catching you, make **Hold time** longer (up to 1.2 seconds) in the options.

**Already drew it?** Pick a brush line with Select, then **Tidy into a shape** (Command palette). If it isn't clearly a shape, it stays as drawn.

Good to know: it works on layers that keep shapes separate, not **Merge shapes together** layers, and not while mirror drawing is on. Pressure changes are averaged into one even line width.

See also [Merge shapes or keep them separate](help:merge-drawing) and [Edit points](help:brush-edit-points).`,
};
