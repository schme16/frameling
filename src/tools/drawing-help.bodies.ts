// The words of the help topics in drawing-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-pen': `Press **Shift+P**, then place points one at a time.

- **Click** to place a sharp corner.
- **Click and drag** to place a smooth point: the drag pulls out handles that bend the curve.
- Hold **Alt** while dragging to bend only the next part, leaving a corner.
- Hold **Shift** to keep the next point at 45 degree steps (or lined up with a vanishing point, when [perspective guides](help:grids-perspective) show).

## Finishing

- **Click the first point** (it shows a ring) to close the shape. It gets your fill and stroke colours. An **Enter** pressed right after that is just "done": it won't start playing the animation.
- **Press Enter or Escape**, double-click, or click the last point again to finish an open line. Open lines use the stroke colour.
- **Backspace** takes back the last point.

Got a point slightly wrong? Finish, then fix it with [Edit points](help:tool-points) (**A**).

The pen works on vector layers, in both drawing modes. On a **pixel layer** it works too: when you finish, the path is painted as clean pixels, the fill inside a closed shape and an edge in the stroke colour. The edge is one pixel, or as thick as you like: turn on **Thicker outline** in the pen's options (see [Pixel shapes](help:pixel-shapes)). On a layer set to merge, the new shape joins or cuts what it lands on, like any other. See [Merge shapes or keep them separate](help:merge-drawing).`,
  'tool-points': `Press **A**, then click a shape. Its points show as little squares.

- **Drag a point** to move it.
- **Click a point** to choose it. Its curve handles appear: **drag a handle** to bend the curve. On a smooth point the other handle turns with it; hold **Alt** to bend just one side.
- **Click the line** between two points to add a point there.
- **Alt+click a point** to switch it between a sharp corner and a smooth curve. The **Make corner** and **Make smooth** buttons in the options do the same.
- **Delete** (or the **Delete point** button) takes the chosen point away.
- **Escape** lets go of the point, then the shape.

It works on pen shapes, rectangles, ellipses, polygons and stars, lines, [clean pencil lines](help:tool-pencil) and paint from the bucket. Brush lines are made of many tiny points, so click one with this tool and it offers to [turn it into an editable line](help:brush-edit-points) first.

Each drag is one step to undo.`,
  'brush-edit-points': `A brush line is made of hundreds of tiny points, one for every spot the pen touched, so there is nothing sensible to drag. **Turn into an editable line** swaps it for a shape with a few smooth points, which you then reshape with [Edit points](help:tool-points) (**A**).

## Do it

1. Select the brush line with **Select** (**V**). To tidy several at once, select them all.
2. Choose **Turn into an editable line...** from the **Tools and layers** menu (or press **Ctrl+K** and search for it). Or press **A**, click the line, and press the button on the message.
3. Slide **Smoothness** while you watch the line on the canvas. Left keeps it closest to what you drew, with more points. Right is smoother, with the fewest points, and a wobbly hand comes out steady. The card tells you how many points it becomes.
4. Press **Turn into a line**. You're now in Edit points, ready to drag.

It stays the same colour, width and tapered ends. It is one step to undo, and **Ctrl+Z** brings the brush line back exactly as it was.

## Good to know

- Afterwards it is a shape, not a brush line, so it no longer follows pen pressure if you change the brush. Turn it back with **Undo**, not with a button.
- **Break apart** (**Ctrl+B**) also makes a brush line into plain paint, but out of many short straight sides. This makes a few smooth curves, which are much easier to drag.
- Only lines made with the Brush have this. Pen shapes, rectangles, [clean pencil lines](help:tool-pencil) and paint from the bucket already have points to edit.
- On a **merge** layer shapes are already plain paint, so there are no brush lines to turn.`,
  'tool-polygon-star': `Press **U** for the Polygon, or **Shift+U** for the Star, then drag a box.

- Hold **Shift** to keep it even: all sides the same, or a star with equal arms.
- Hold **Alt** to draw from the middle.
- In the options, set the number of **Sides** (3 makes a triangle, 6 a hexagon), or for a star the number of **Points** and the **Dip depth**: how far in the dips between the points go.

The inside uses the **fill** colour and the edge the **stroke** colour, like the [Rectangle](help:tool-rect). Gradients work too. To reshape one afterwards, use [Edit points](help:tool-points) (**A**).

On a **pixel layer** they're painted as clean pixels: solid colour inside, an edge in the stroke colour (one pixel, or thicker: see [Pixel shapes](help:pixel-shapes)), no blurry edges. With the stroke set to none the fill covers the edge too.`,
};
