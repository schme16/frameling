// The words of the help topic in width.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-width': `A line that's the same width all the way looks like a line. One that's fat where the body is and thin where it lets go looks inked. The **Width tool** lets you grab a line anywhere along it and make it fatter or thinner right there.

**Try it:** press **Ctrl+K** and type **width**, or press **Shape the width** in the options of [Edit points](help:tool-points), then click a line. Click on it, or on its edge, and drag away from the middle to make it fat, or towards the middle to make it thin. A point with a handle on each edge stays where you put it. Drag more points in along the line to ink it exactly how you want.

- **Drag a point's edge:** fatter or thinner at that spot, and the line eases smoothly between points.
- **Shift+drag a point:** slide it along the line.
- **Alt+click a point**, or press **Delete** on the chosen one: take it away.
- **Make even** in the tool options: back to the same width all the way.

**Start from a shape.** Under **Dashes, arrows and width** are ready-made ones: **Fat in the middle**, **Thin in the middle**, **Tapers to a point** and more. They're the same points the Width tool moves, so pick one, then fine tune it by hand.

**Good to know:**
- It works on lines and outlines from the **Pen**, **Line** and shape tools. A brush line takes its width from the pen's pressure, so it has no points to drag. Draw it with the Pen to shape it by hand.
- Points are placed as a share of the way along, so they follow the line when you reshape it with **Edit points**.
- The line is still a line: **SVG** and **PDF** get it as a filled outline, since a stroke can't change width.
- **Undo** takes back a whole drag in one step.

See also [Dashed lines, arrows and tapered lines](help:line-style) and [Edit points](help:tool-points).`,
};
