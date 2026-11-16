// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  repeat: `Make more of a shape without drawing it again: rows and columns, a ring of petals, or a mirror image. The copies stay joined to the original, so **change the original and every copy follows**. In other programs it's called a pattern, an array or a mirror.

**Try it:** pick a shape, then press **Ctrl+K** and type **repeat**, or use **Edit > Repeat a shape**. The **Repeat** panel opens so you can change it afterwards.

- **Rows and columns** (**Alt+Shift+G**): so many across, so many down, and the **step** between them. **Edge to edge** makes the copies touch. A minus step grows the other way.
- **A ring** (**Alt+Shift+O**): so many round a centre, all the way or as a fan. **Through** sets how many degrees: 360 is a full ring, 90 is a quarter.
- **Mirror image** (**Alt+Shift+F**): a flipped copy across a line, or through a point. The line can be up and down, sideways, or any angle.

**Move it on the stage.** Pick the **Repeat tool** (**Pick on the stage** in the panel) and drag the little squares: a ring's **centre**, a mirror line's **point** and its **turning end**, a grid's **step**. They **snap** to the end of a line, a point on a shape, a guide, a guide crossing, the grid and the page middle, the same as everything else. Hold **Ctrl** to turn snapping off. Hold **Shift** to turn a mirror line in steps of 15 degrees.

**Turn or stay upright.** Round a ring, a copy can turn to follow it (petals, spokes) or keep the way up the original has (beads, people round a table). You're asked once, then it's remembered, and **Turn each copy to follow the ring** changes it for the one you're on. Change the answer any time in **Preferences > Behaviour**.

**Good to know:**
- Several shapes repeat as one, so they're grouped for you first.
- A copy can't be clicked, and it isn't something other shapes snap to. Pick the original, or use **Turn a repeat into shapes of their own** when you want to change one copy.
- The dashed box round a picked repeat is how far all the copies reach.
- A repeat stops at 400 shapes in all, so a huge grid can't slow the page down.
- Copies are drawn in the picture, onion skin, GIF, video, sprite sheet and every other export.
- **Take the repeat off** keeps the shape and drops the copies. **Undo** takes either back.

The mirror here is the same one **Mirror drawing** uses, so a line that's up and down or sideways gives the same copy from both. See also [Mirror drawing](help:mirror-drawing), [Merge drawing and groups](help:merge-drawing) and [Snapping](help:snapping).`,
};
