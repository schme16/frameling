// The words of the help topic in lineStyle.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'line-style': `Make a path on a map, a dotted outline, an arrow on a diagram, or a line that is fat in the middle and thin at the ends. These are all choices for the **outline** of a shape, so they work on lines, rectangles, ellipses, polygons and pen shapes.

**Pick how it looks:** with the **Line**, **Rectangle**, **Ellipse**, **Polygon** or **Pen** tool, open **Dashes, arrows and width** in the tool options. Or choose **Tools and layers > Line style**, or press **Ctrl+K** and type **dashed**, **dotted**, **arrow** or **taper**. What you choose is used for the next shapes you draw, and it is put on any shapes you have picked, in one step you can undo.

- **Dashes:** Solid, Dashed, Dotted, or Dash and dot. The dashes are measured in line widths, so a thicker line gets longer dashes and the look stays the same.
- **Arrow heads:** a **Triangle**, an **Open** arrow, a **Dot** or a **Bar**, on the start, the end, or both, of an open line.
- **Width along the line:** Even, Fat in the middle, Thin in the middle, Tapers to a point, Starts at a point, or Pointed at both ends.

**Good to know:**
- **Dotted** rounds the ends of the line, and **Dashed** squares them off, so the dots and dashes show as they should.
- Arrow heads only go on **open** lines. A rectangle or ellipse has no ends.
- A changing width follows the line best on a line or a curve. On a rectangle the start and the end meet at one corner, so the width jumps there.
- **Edit points** still works: the line is still a line, and the dashes, arrows and width follow it as you reshape it.

**What other programs get:** a picture, video, GIF or PNG shows exactly what you see. **SVG** and **PDF** keep real dashes. **Lottie** and **Illustrator (.ai)** keep dashes as real dashes too. Arrow heads travel as little shapes of their own, in every format. A changing width turns into the filled outline of the line, in SVG, PDF, Lottie and Illustrator: it looks the same, but you can't change the width there. If a gradient line is dashed, PDF cuts the dashes into the gradient's outline.

See also [Fill and stroke colours](help:fill-and-stroke) and [Edit points](help:brush-edit-points).`,
};
