// Help for the pen, Edit points, and the polygon and star tools.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'tool-pen',
    order: 7,
    title: 'Pen',
    section: 'Drawing',
    media: 'tool-pen.mp4',
    summary: 'Draw exact lines and smooth curves point by point: click for corners, drag for curves (bezier paths).',
    keywords: ['pen', 'bezier', 'path', 'curve', 'vector', 'anchor', 'point', 'outline', 'inking', 'precise'],
    body: `Press **Shift+P**, then place points one at a time.

- **Click** to place a sharp corner.
- **Click and drag** to place a smooth point: the drag pulls out handles that bend the curve.
- Hold **Alt** while dragging to bend only the next part, leaving a corner.
- Hold **Shift** to keep the next point at 45 degree steps.

## Finishing

- **Click the first point** (it shows a ring) to close the shape. It gets your fill and stroke colours.
- **Press Enter or Escape**, double-click, or click the last point again to finish an open line. Open lines use the stroke colour.
- **Backspace** takes back the last point.

Got a point slightly wrong? Finish, then fix it with [Edit points](help:tool-points) (**A**).

The pen works on vector layers, in both drawing modes. On a layer set to merge, the new shape joins or cuts what it lands on, like any other. See [Merge shapes or keep them separate](help:merge-drawing).`,
  },
  {
    id: 'tool-points',
    order: 8,
    title: 'Edit points',
    section: 'Drawing',
    media: 'tool-points.png',
    summary: 'Reshape a shape by its points and curve handles: move points, bend curves, add or remove points (direct select).',
    keywords: ['direct select', 'direct selection', 'edit points', 'node', 'anchor', 'handle', 'bezier', 'reshape', 'corner', 'smooth', 'add point', 'delete point'],
    body: `Press **A**, then click a shape. Its points show as little squares.

- **Drag a point** to move it.
- **Click a point** to choose it. Its curve handles appear: **drag a handle** to bend the curve. On a smooth point the other handle turns with it; hold **Alt** to bend just one side.
- **Click the line** between two points to add a point there.
- **Alt+click a point** to switch it between a sharp corner and a smooth curve. The **Make corner** and **Make smooth** buttons in the options do the same.
- **Delete** (or the **Delete point** button) takes the chosen point away.
- **Escape** lets go of the point, then the shape.

It works on pen shapes, rectangles, ellipses, polygons and stars, lines, [clean pencil lines](help:tool-pencil) and paint from the bucket. Brush lines are made of many tiny points, so they aren't edited this way.

Each drag is one step to undo.`,
  },
  {
    id: 'tool-polygon-star',
    order: 9,
    title: 'Polygon and star',
    section: 'Drawing',
    media: 'polygon-star.png',
    summary: 'Drag to draw a shape with straight sides (a polygon) or a star, with any number of sides or points.',
    keywords: ['polygon', 'star', 'hexagon', 'pentagon', 'triangle', 'octagon', 'shape', 'sides', 'points', 'sparkle'],
    body: `Press **U** for the Polygon, or **Shift+U** for the Star, then drag a box.

- Hold **Shift** to keep it even: all sides the same, or a star with equal arms.
- Hold **Alt** to draw from the middle.
- In the options, set the number of **Sides** (3 makes a triangle, 6 a hexagon), or for a star the number of **Points** and the **Dip depth**: how far in the dips between the points go.

The inside uses the **fill** colour and the edge the **stroke** colour, like the [Rectangle](help:tool-rect). Gradients work too. To reshape one afterwards, use [Edit points](help:tool-points) (**A**).`,
  },
]);
