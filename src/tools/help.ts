import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'tool-brush',
    order: 1,
    title: 'Brush',
    section: 'Drawing',
    media: 'draw-brush.mp4',
    summary: 'Paint smooth, flowing lines. On a pixel layer it draws crisp pixels instead.',
    keywords: ['draw', 'paint', 'pen', 'stroke', 'ink', 'pixel pencil'],
    body: `Press **B**, then drag on the page.

**On a vector layer** the brush makes smooth lines that follow your hand. If you have a drawing pen, pressing harder makes the line thicker. With a mouse, drawing faster makes it a little thinner. Every line stays editable, so you can select it later and move or resize it.

In the options you can change the size, how much it smooths out wobbles, whether pressure matters, and whether lines start or end in a point.

**On a pixel layer** it paints hard-edged pixels, with the size counted in art pixels. (For one pixel lines, the [Pencil](help:tool-pencil) is quicker.)
- **Pixel perfect** tidies the little L-shaped corners that make hand-drawn lines look lumpy, so they stay one pixel thick.
- Hold **Shift** and click to draw a straight line from where you last stopped.

**Eraser end of your pen?** Flip the pen over and Frameling switches to the eraser for as long as you use it.

If the brush won't draw, the layer might be locked or hidden. Check it in the timeline.`,
  },
  {
    id: 'tool-pencil',
    order: 2,
    media: 'tool-pencil.mp4',
    title: 'Pencil',
    section: 'Drawing',
    summary: 'A thin, even line for sketching. On a pixel layer it is the pixel pencil: one clean pixel at a time.',
    keywords: ['sketch', 'thin', 'line', 'draw', 'pixel pencil', 'pixel perfect'],
    body: `Press **P**, then drag.

**On a vector layer** the pencil draws a thin line that stays the same width, however hard you press. It follows your hand closely, which makes it good for sketching and rough animation. For thicker lines that swell with pressure, use the Brush (B).

**Clean line.** Set **Line** to **Clean line** in the options and the pencil smooths what you draw into a few even curves (a centre-line stroke). You can then reshape it point by point with [Edit points](help:tool-points) (**A**). Good for tidy outlines and inking.

**On a pixel layer** it's the pixel pencil, the main tool for pixel art. It always paints one pixel at a time.
- **Pixel perfect** (on unless you turn it off in the options) tidies the little L-shaped corners hand-drawn lines get, so curves stay one pixel thick.
- Hold **Shift** and click to draw a straight line from where you last stopped.
- It paints with the **stroke** colour. Pick colours from the [Palette](help:palette).
- [Mirror drawing](help:pixel-mirror) and the [palette lock](help:palette-lock) work with it too.`,
  },
  {
    id: 'tool-eraser',
    order: 3,
    media: 'tool-eraser.mp4',
    title: 'Eraser',
    section: 'Drawing',
    summary: 'Rub things out. On vector layers it removes whole lines, on pixel layers it clears pixels.',
    keywords: ['rub', 'delete', 'remove', 'erase whole lines', 'rubber', 'rub out'],
    body: `Press **E**, then drag over what you want gone.

**On a vector layer** it erases whole lines. Anything the circle touches, a stroke or a shape, disappears as a whole, so one quick swipe removes a line without you having to trace it. The **Reach** option sets how close you need to get. If you took out too much, Undo brings it back.

**On a layer set to Merge** it rubs out just the area under the circle instead, the way a real eraser does. See [Merge shapes or keep them separate](help:merge-drawing).

**On a pixel layer** it clears pixels as you drag, and you choose its size in art pixels.

Using a drawing pen? Flip it over and use the eraser end.`,
  },
  {
    id: 'tool-rect',
    title: 'Rectangle',
    section: 'Drawing',
    media: 'perspective-shapes.png',
    summary: 'Drag to draw a rectangle, with an outline, a fill, or both. On perspective guides it becomes a floor or a wall.',
    keywords: ['box', 'square', 'shape', 'rounded'],
    body: `Press **R**, then drag from one corner to the opposite one.

- Hold **Shift** to keep it a perfect square.
- Hold **Alt** to draw from the middle instead of a corner.
- In the options, set how thick the outline is and how round the corners are.
- With [perspective guides](help:grids-perspective) showing and snapping on, the rectangle follows them: drag across a floor or a wall and it comes out as the matching four-sided shape, its edges running to the vanishing points. **On a plane** in the options picks **Floor**, **Wall** (or **Left wall** and **Right wall** with two points), or **Flat** for a plain rectangle. **Auto** guesses from where you drag. Hold **Ctrl** to ignore the guides for one shape.

The inside uses your **fill** colour and the edge uses your **stroke** colour, so a new rectangle starts soft yellow with a black outline. Set either one to none for just an outline or just a solid shape. See [Fill and stroke colours](help:fill-and-stroke).

On a **pixel layer** the rectangle is painted as clean pixels: a one pixel edge in the stroke colour, filled with the fill colour.`,
  },
  {
    id: 'tool-ellipse',
    title: 'Ellipse',
    section: 'Drawing',
    media: 'perspective-shapes.png',
    summary: 'Drag to draw an oval or a circle. On perspective guides it becomes the ellipse a circle makes on that floor or wall.',
    keywords: ['circle', 'oval', 'round', 'shape'],
    body: `Press **O**, then drag across the shape you want.

- Hold **Shift** for a perfect circle.
- Hold **Alt** to draw from the middle.
- The inside uses your **fill** colour and the edge your **stroke** colour. See [Fill and stroke colours](help:fill-and-stroke).
- With [perspective guides](help:grids-perspective) showing and snapping on, the ellipse is the one a circle makes when it lies on that floor or wall, so a plate on a table or a clock on a wall sits right. Pick the plane in the options, or leave it on **Auto**.

On a vector layer, ellipses are made of smooth curves, so they stay sharp however far you zoom in. On a **pixel layer** they're painted as clean, even pixel circles and ovals, with no doubled pixels.`,
  },
  {
    id: 'tool-line',
    title: 'Line',
    section: 'Drawing',
    media: 'shapes.png',
    summary: 'Drag to draw a straight line.',
    keywords: ['straight', 'ruler', 'shape'],
    body: `Press **L**, then drag from where the line starts to where it ends.

- Hold **Shift** to snap to straight, diagonal and upright angles.
- Hold **Alt** to draw from the middle.
- With [perspective guides](help:grids-perspective) showing, the line lines up with a vanishing point when you draw close to its direction (and Shift picks those directions too).

Set how thick it is in the options.

On a **pixel layer** the line is one pixel wide, and **Shift** snaps it to the clean pixel art slopes (1 across for 1 down, 2 for 1, 3 for 1, 4 for 1 and their upright twins), so every step in the line is the same length.`,
  },
  {
    id: 'tool-select',
    title: 'Select',
    section: 'Drawing',
    media: 'select.png',
    summary: 'Pick shapes and lines to move, resize, turn, copy or delete.',
    keywords: ['move', 'resize', 'scale', 'rotate', 'turn', 'marquee', 'transform', 'lasso', 'move tool', 'arrow tool'],
    body: `Press **V**.

- **Click** a line or shape to select it. **Shift+click** adds more, or takes one off.
- **Drag a box** round several to select them all. Or pick **Lasso** in the options (or press **Shift+L**) and draw round them. See [Lasso](help:lasso).
- **Drag a selection** to move it. Hold **Shift** to keep it in a straight line.
- **Drag a corner** to resize. Hold **Shift** to keep its proportions, **Alt** to resize from the middle.
- **Drag the round handle** above to turn it. Hold **Shift** to snap to neat angles.
- **Arrow keys** nudge it by one pixel, or ten with Shift.

Everything you do in one drag is one undo step. Selecting picks from the frame you're on. On a pixel layer, Select picks pixels instead: see [Selecting pixels](help:pixel-select).

See [Selecting and moving](help:selecting) for the keyboard shortcuts.`,
  },
  {
    id: 'tool-eyedropper',
    media: 'tool-eyedropper.mp4',
    title: 'Eyedropper',
    section: 'Drawing',
    summary: 'Pick up a colour from the page and draw with it.',
    keywords: ['pick', 'sample', 'colour', 'color', 'colour picker', 'color picker', 'pick a colour', 'sample colour'],
    body: `Press **I**, then click any colour you can see. It becomes your drawing colour straight away. Drag to keep looking around.

It picks what the page looks like, all the layers together. Hold **Alt** to pick from only the layer you're on. If you click a see-through spot there's nothing to pick up.`,
  },
  {
    id: 'tool-hand',
    media: 'canvas-navigation.mp4',
    title: 'Hand',
    section: 'Drawing',
    summary: 'Drag the page around.',
    keywords: ['pan', 'move', 'scroll', 'grab'],
    body: `Press **H** and drag to slide the page around.

You don't have to switch tools to do it. Hold **Space** and drag with any tool, or use the middle mouse button, or scroll. See [Moving around the page](help:canvas-navigation).`,
  },
  {
    id: 'tool-zoom',
    media: 'canvas-navigation.mp4',
    title: 'Zoom',
    section: 'Drawing',
    summary: 'Click to zoom in, Alt+click to zoom out, drag a box to zoom to it.',
    keywords: ['magnify', 'closer', 'bigger'],
    body: `Press **Z**.

- **Click** to zoom in on that spot.
- **Alt+click** to zoom out.
- **Drag a box** to zoom right in on it.

You can also zoom with **Ctrl+scroll**, or with **Ctrl+=** and **Ctrl+-**. **Ctrl+0** fits the page in the window.`,
  },
  {
    id: 'selecting',
    order: 6,
    title: 'Selecting and moving',
    section: 'Drawing',
    media: 'select.png',
    summary: 'Select everything, let go, and nudge a selection with the keyboard.',
    keywords: ['select all', 'deselect', 'nudge', 'arrow keys', 'rotate', 'scale', 'resize', 'turn'],
    body: `- **Ctrl+A** selects everything on this frame of the layer you're on.
- **Escape** lets go of the selection.
- **Arrow keys** move the selection by one pixel. Add **Shift** to move ten.

Nudging a few times in a row counts as one change, so one Undo takes it back.

On a pixel layer these pick and move pixels, and **Ctrl+Shift+I** inverts the selection. See [Selecting pixels](help:pixel-select).`,
  },
  {
    id: 'copy-paste',
    media: 'copy-paste.png',
    title: 'Copy, cut and paste',
    section: 'Drawing',
    summary: 'Copy shapes and paste them on the same frame or a different one.',
    keywords: ['clipboard', 'duplicate', 'move to another frame'],
    body: `Select some shapes, then:

- **Ctrl+C** copies them.
- **Ctrl+X** cuts them (copies, then removes them).
- **Ctrl+V** pastes them onto the frame you're on.

Pasting onto a different frame puts them in exactly the same place, which is handy for reusing a pose. Pasting onto the same frame puts the copy a little to the side. The pasted shapes are selected, ready to move.

Copy and paste works between frames and layers of the same kind, inside Frameling. On a pixel layer it copies the selected pixels: see [Selecting pixels](help:pixel-select).`,
  },
  {
    id: 'duplicate-delete',
    media: 'duplicate-delete.mp4',
    title: 'Duplicate and delete',
    section: 'Drawing',
    summary: 'Make a copy right beside the selection, or remove it.',
    keywords: ['copy', 'remove', 'clone'],
    body: `- **Ctrl+D** duplicates the selection. The copy appears just beside it and is selected.
- **Delete** (or **Backspace**) removes the selection.

Both can be undone.`,
  },
  {
    id: 'flip',
    media: 'flip.mp4',
    title: 'Flip',
    section: 'Drawing',
    summary: 'Mirror the selection left to right or top to bottom.',
    keywords: ['mirror', 'reverse', 'horizontal', 'vertical'],
    body: `Select something, then use **Flip horizontal** or **Flip vertical** (in the Select tool's options, or search for them in the command palette). The selection is mirrored around its own middle and stays where it is.`,
  },
  {
    id: 'arrange',
    media: 'arrange.mp4',
    title: 'Bring forward and send back',
    section: 'Drawing',
    summary: 'Change which shapes sit in front of others.',
    keywords: ['order', 'layer order', 'front', 'back', 'stack', 'z-order', 'on top', 'behind', 'in front'],
    body: `Shapes on one layer are stacked like paper cut-outs. Select one, then:

- **Ctrl+]** brings it forward one step. **Ctrl+Shift+]** brings it to the very front.
- **Ctrl+[** sends it back one step. **Ctrl+Shift+[** sends it to the very back.

This is about the order inside a layer. To put a whole layer above or below another, use the timeline.`,
  },
]);
