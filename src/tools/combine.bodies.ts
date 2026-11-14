// The words of the help topic in combine.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'combine-shapes': `Make a crescent from two circles, a speech bubble from a rounded box and a tail, a key hole. Pick two or more shapes, then choose one of four under **Tools and layers > Combine shapes** (or press **Ctrl+K** and type its name).

- **Join** (union): one shape that covers everywhere any of them did.
- **Cut out** (subtract): the **top** shape punches its outline out of the shapes under it, and goes. A bite out of a moon.
- **Keep the overlap** (intersect): only where they cross over each other is left.
- **Punch a hole** (exclude): everything stays except where they cross, which becomes a hole.

**What happens to the colours:** Join, Keep the overlap and Punch a hole make **one** shape. It wears the fill, outline and see-through of the **bottom** shape, and the first time the colours differ you're asked whether you'd rather have the top one (it's in Preferences > Behaviour). **Cut out** is different: every shape under the cutter keeps its own colours and outline, and one the cutter doesn't touch isn't changed at all.

**It stays a shape.** The result is an ordinary path with curves, so **Edit points** works on it and the corners stay sharp. A brush line turns into a filled shape in its colour; an open line becomes the strip it drew.

**Good to know:**
- A **group** counts as one shape. The result leaves the group.
- **Symbols**, text and particles are left alone, since they have no outline to cut. To combine a symbol's shapes, go inside it first.
- It is one step, so **Undo** puts everything back, outlines and all.
- Merge drawing (see [Merge shapes or keep them separate](help:merge-drawing)) does this as you draw; this is for shapes you've already made and want to keep as shapes.`,
};
