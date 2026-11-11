import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'tool-brush',
    title: 'Brush',
    section: 'Drawing',
    media: 'draw-brush.mp4',
    summary: 'Paint smooth, flowing lines. On a pixel layer it draws crisp pixels instead.',
    keywords: ['draw', 'paint', 'pen', 'stroke', 'ink', 'pixel pencil'],
    body: `Press **B**, then drag on the page.

**On a vector layer** the brush makes smooth lines that follow your hand. If you have a drawing pen, pressing harder makes the line thicker. With a mouse, drawing faster makes it a little thinner. Every line stays editable, so you can select it later and move or resize it.

In the options you can change the size, how much it smooths out wobbles, whether pressure matters, and whether lines start or end in a point.

**On a pixel layer** it's a pixel pencil: hard-edged pixels, with the size counted in art pixels.
- **Pixel perfect** tidies the little L-shaped corners that make hand-drawn lines look lumpy, so they stay one pixel thick.
- Hold **Shift** and click to draw a straight line from where you last stopped.

**Eraser end of your pen?** Flip the pen over and Frameling switches to the eraser for as long as you use it.

If the brush won't draw, the layer might be locked or hidden. Check it in the timeline.`,
  },
  {
    id: 'tool-pencil',
    title: 'Pencil',
    section: 'Drawing',
    summary: 'A thin, even line, good for sketching and neat outlines.',
    keywords: ['sketch', 'thin', 'line', 'draw'],
    body: `Press **P**, then drag.

The pencil draws a thin line that stays the same width, however hard you press. It follows your hand closely, which makes it good for sketching and rough animation.

For thicker lines that swell with pressure, use the Brush (B). The pencil works on vector layers. On a pixel layer, the Brush is your pencil.`,
  },
  {
    id: 'tool-eraser',
    title: 'Eraser',
    section: 'Drawing',
    summary: 'Rub things out. On vector layers it removes whole lines, on pixel layers it clears pixels.',
    keywords: ['rub', 'delete', 'remove', 'erase whole lines'],
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
    media: 'shapes.png',
    summary: 'Drag to draw a rectangle, with an outline, a fill, or both.',
    keywords: ['box', 'square', 'shape', 'rounded'],
    body: `Press **R**, then drag from one corner to the opposite one.

- Hold **Shift** to keep it a perfect square.
- Hold **Alt** to draw from the middle instead of a corner.
- In the options, set how thick the outline is and how round the corners are.

The inside uses your **fill** colour and the edge uses your **stroke** colour, so a new rectangle starts white with a black outline. Set either one to none for just an outline or just a solid shape. See [Fill and stroke colours](help:fill-and-stroke). Rectangles draw on vector layers.`,
  },
  {
    id: 'tool-ellipse',
    title: 'Ellipse',
    section: 'Drawing',
    media: 'shapes.png',
    summary: 'Drag to draw an oval or a circle.',
    keywords: ['circle', 'oval', 'round', 'shape'],
    body: `Press **O**, then drag across the shape you want.

- Hold **Shift** for a perfect circle.
- Hold **Alt** to draw from the middle.
- The inside uses your **fill** colour and the edge your **stroke** colour. See [Fill and stroke colours](help:fill-and-stroke).

Ellipses are made of smooth curves, so they stay sharp however far you zoom in. They draw on vector layers.`,
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

Set how thick it is in the options. Lines draw on vector layers.`,
  },
  {
    id: 'tool-select',
    title: 'Select',
    section: 'Drawing',
    media: 'select.png',
    summary: 'Pick shapes and lines to move, resize, turn, copy or delete.',
    keywords: ['move', 'resize', 'scale', 'rotate', 'turn', 'marquee', 'transform'],
    body: `Press **V**.

- **Click** a line or shape to select it. **Shift+click** adds more, or takes one off.
- **Drag a box** round several to select them all.
- **Drag a selection** to move it. Hold **Shift** to keep it in a straight line.
- **Drag a corner** to resize. Hold **Shift** to keep its proportions, **Alt** to resize from the middle.
- **Drag the round handle** above to turn it. Hold **Shift** to snap to neat angles.
- **Arrow keys** nudge it by one pixel, or ten with Shift.

Everything you do in one drag is one undo step. Selecting works on vector layers, and picks from the frame you're on.

See [Selecting and moving](help:selecting) for the keyboard shortcuts.`,
  },
  {
    id: 'tool-eyedropper',
    title: 'Eyedropper',
    section: 'Drawing',
    summary: 'Pick up a colour from the page and draw with it.',
    keywords: ['pick', 'sample', 'colour', 'color'],
    body: `Press **I**, then click any colour you can see. It becomes your drawing colour straight away. Drag to keep looking around.

It picks what the page looks like, all the layers together. Hold **Alt** to pick from only the layer you're on. If you click a see-through spot there's nothing to pick up.`,
  },
  {
    id: 'tool-hand',
    title: 'Hand',
    section: 'Drawing',
    summary: 'Drag the page around.',
    keywords: ['pan', 'move', 'scroll', 'grab'],
    body: `Press **H** and drag to slide the page around.

You don't have to switch tools to do it. Hold **Space** and drag with any tool, or use the middle mouse button, or scroll. See [Moving around the page](help:canvas-navigation).`,
  },
  {
    id: 'tool-zoom',
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
    title: 'Selecting and moving',
    section: 'Drawing',
    media: 'select.png',
    summary: 'Select everything, let go, and nudge a selection with the keyboard.',
    keywords: ['select all', 'deselect', 'nudge', 'arrow keys'],
    body: `- **Ctrl+A** selects everything on this frame of the layer you're on.
- **Escape** lets go of the selection.
- **Arrow keys** move the selection by one pixel. Add **Shift** to move ten.

Nudging a few times in a row counts as one change, so one Undo takes it back.`,
  },
  {
    id: 'copy-paste',
    title: 'Copy, cut and paste',
    section: 'Drawing',
    summary: 'Copy shapes and paste them on the same frame or a different one.',
    keywords: ['clipboard', 'duplicate', 'move to another frame'],
    body: `Select some shapes, then:

- **Ctrl+C** copies them.
- **Ctrl+X** cuts them (copies, then removes them).
- **Ctrl+V** pastes them onto the frame you're on.

Pasting onto a different frame puts them in exactly the same place, which is handy for reusing a pose. Pasting onto the same frame puts the copy a little to the side. The pasted shapes are selected, ready to move.

Copy and paste works between frames and layers of the same kind, inside Frameling.`,
  },
  {
    id: 'duplicate-delete',
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
    title: 'Flip',
    section: 'Drawing',
    summary: 'Mirror the selection left to right or top to bottom.',
    keywords: ['mirror', 'reverse', 'horizontal', 'vertical'],
    body: `Select something, then use **Flip horizontal** or **Flip vertical** (in the Select tool's options, or search for them in the command palette). The selection is mirrored around its own middle and stays where it is.`,
  },
  {
    id: 'arrange',
    title: 'Bring forward and send back',
    section: 'Drawing',
    summary: 'Change which shapes sit in front of others.',
    keywords: ['order', 'layer order', 'front', 'back', 'stack', 'z-order'],
    body: `Shapes on one layer are stacked like paper cut-outs. Select one, then:

- **Ctrl+]** brings it forward one step. **Ctrl+Shift+]** brings it to the very front.
- **Ctrl+[** sends it back one step. **Ctrl+Shift+[** sends it to the very back.

This is about the order inside a layer. To put a whole layer above or below another, use the timeline.`,
  },
]);
