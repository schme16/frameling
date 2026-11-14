// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'draw-on': `A line that **draws itself** shows only part of itself, and that part grows: a path across a map, a progress ring that fills, a signature that appears as if someone were writing it. Every outline has three numbers for it, **Start**, **End** and **Offset**, and they can change over time like anything else on the timeline.

**The quick way:**
1. Draw a brush line, or a shape with an outline, and pick it.
2. Press **Ctrl+Alt+W** (or **Make the line draw itself** in the command palette, or **Draw it on** in the **Draw on** panel).
3. Press play. The line draws itself in over about a second.

It hides the line on this frame, makes a second key a second later (if there isn't one yet), and glides between them. **Rub it out** does the same the other way round.

**Change it:**
- **Start** and **End** say how much of the line shows, as a share of its length. At **End 0%** nothing shows; at **100%** all of it does.
- **Offset** slides the visible part along the line. On a loop, like a circle, it wraps round, so a ring can spin. On an open line it stops at the ends.
- Drag a slider while the playhead is on a key and that key changes. Drag it anywhere else and Frameling cuts a key right there, so scrubbing and setting values animates the line.
- The **Draw on** row on the timeline shows the keys. Drag them to retime, like any other row.
- Easing is the same as for other in-betweens: pick it under **In-betweens** in the same panel.

**Several outlines in one shape.** A shape made of separate pieces can draw them **all at once** or **one after another**. Frameling asks the first time and remembers; change it in the panel, or in **Preferences > Behaviour**.

**Good to know:**
- Brush lines draw with a round pen tip at the cut, so the line keeps its full width as it grows.
- Fills aren't trimmed, only the outline. A filled shape keeps its colour while its edge draws on.
- Arrow heads ride the end of the line as it draws.
- Clicking a line that hasn't drawn yet still picks it, so you can always find it again.
- **Show it all** takes the trim off every key.
- **Lottie** and **animated SVG** keep the line as a line, so it stays sharp and small. A brush line or an outline with a changing width is saved as a picture per frame of its shape, which still stays vector.

To make other things move, see [In-betweens](help:tweens).`,
};
