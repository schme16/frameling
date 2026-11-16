// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  repeat: `Make more of a shape without drawing it again: rows and columns, a ring of petals, or a mirror image. The copies stay joined to the original, so **change the original and every copy follows**. In other programs it's a pattern, an array or a mirror.

**Try it:** pick a shape, then press **Ctrl+K** and type **repeat**, or use **Edit > Repeat a shape**. The **Repeat** section of Properties opens so you can change it afterwards.

- **Rows and columns** (**Alt+Shift+G**): so many across and down, and the **step** between them. **Edge to edge** makes the copies touch.
- **A ring** (**Alt+Shift+O**): so many round a centre, all the way or as a fan. **Through** is the degrees: 360 is a full ring, 90 a quarter.
- **Mirror image** (**Alt+Shift+F**): a flipped copy across a line, or through a point. The line can run any way.

**Move it on the stage.** Pick the **Repeat tool** (**Pick on the stage**) and drag the little squares: a ring's **centre**, a mirror line's **point** and **turning end**, a grid's **step**. They **snap** to line ends, points on shapes, guides, guide crossings, the grid and the page middle, like everything else. Hold **Ctrl** to snap to nothing, **Shift** to turn a mirror line 15 degrees at a time.

**Turn or stay upright.** Round a ring, a copy can turn to follow it (petals, spokes) or keep the way up the original has (beads, people round a table). You're asked once and it's remembered. **Turn each copy to follow the ring** changes the one you're on, and **Preferences > Behaviour** changes the answer.

**Good to know:**
- Several shapes repeat as one, so they're grouped for you first.
- A copy can't be clicked, and nothing snaps to it. Pick the original, or use **Turn a repeat into shapes of their own** to change one copy.
- The dashed box round a picked repeat is how far all the copies reach.
- A repeat stops at 400 shapes in all, so a huge grid can't slow the page down.
- **Take the repeat off** keeps the shape and drops the copies. **Undo** takes either back.

The mirror is the same one **Mirror drawing** uses. See also [Mirror drawing](help:mirror-drawing), [Merge drawing and groups](help:merge-drawing) and [Snapping](help:snapping).`,
};
