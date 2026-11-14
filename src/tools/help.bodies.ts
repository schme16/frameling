// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-brush': `Press **B**, then drag on the page.

**On a vector layer** the brush makes smooth lines that follow your hand. If you have a drawing pen, pressing harder makes the line thicker. With a mouse, drawing faster makes it a little thinner. Every line stays editable, so you can select it later and move or resize it.

In the options you can change the size, how much it smooths out wobbles, whether pressure matters, and whether lines start or end in a point. Hold **Shift** and click to run a straight line from where your last line stopped. The **Tip** row gives lines a different feel: [chalk, charcoal, watercolour or stamps](help:brush-tips).

**How big can it go?** The **Size** slider runs from 1 pixel to a little wider than your canvas, so a big canvas gets a big brush and a small one is not left with a slider that is all too wide. The first part of the slider is for small, careful sizes and the last part is for the huge ones. Want it bigger still? Click the number beside the slider and type any size you like. The pencil's **Thickness** and the pen's **Line thickness** work the same way.

**On a pixel layer** it paints hard-edged pixels, with the size counted in art pixels (the slider runs up to a little wider than your pixel canvas, and you can click the number and type a bigger one). Looking through a zoomed [camera](help:camera), the size is what you see: a 4 pixel brush paints 2 pixels through a camera zoomed in 2x (whole pixels, rounded, never less than 1). (For one pixel lines, the [Pencil](help:tool-pencil) is quicker.)
- **Pixel perfect** tidies the little L-shaped corners that make hand-drawn lines look lumpy, so they stay one pixel thick.
- Hold **Shift** and click to draw a straight line from where you last stopped.

**Eraser end of your pen?** Flip the pen over and Frameling switches to the eraser for as long as you use it.

If the brush won't draw, the layer might be locked or hidden. Check it in the timeline.`,
  'tool-pencil': `Press **P**, then drag.

**On a vector layer** the pencil draws a thin line that stays the same width, however hard you press. It follows your hand closely, which makes it good for sketching and rough animation. For thicker lines that swell with pressure, use the Brush (B). Hold **Shift** and click to run a straight line from where your last line stopped.

**Clean line.** Set **Line** to **Clean line** in the options and the pencil smooths what you draw into a few even curves (a centre-line stroke). You can then reshape it point by point with [Edit points](help:tool-points) (**A**). Good for tidy outlines and inking.

**On a pixel layer** it's the pixel pencil, the main tool for pixel art. It has a **size**: size 1 is the plain pencil, and bigger sizes are the same tool with a thicker tip (the Brush on a pixel layer is the same pen).
- **Pixel perfect** (on unless you turn it off in the options) tidies the little L-shaped corners hand-drawn lines get, so curves stay one pixel thick.
- Hold **Shift** and click to draw a straight line from where you last stopped.
- It paints with the **stroke** colour, called **Paint** in the Pixel workspace (see [Paint and Back](help:pixel-wells)). Pick colours from the [Palette](help:palette).
- [Mirror drawing](help:pixel-mirror) and the [palette lock](help:palette-lock) work with it too.`,
  'tool-eraser': `Press **E**, then drag over what you want gone.

**On a vector layer** it rubs out just the bit you drag over, the way a real rubber does. Drag across a brush stroke and it's cut in two, drag along the end and you nibble it shorter. The pieces stay separate shapes, so you can still pick each one up and move it. Rub a shape away completely and it's gone. If you took out too much, Undo brings it back. Hold **Shift** and click to rub out in a straight line from where you last stopped.

The **Size** option sets how big the circle is. Once a line has been cut it becomes a plain filled shape, so its brush settings are no longer editable. Symbols and text are left alone.

**Want whole lines instead?** In the options, set **Rub out** to **Whole lines**. Anything the circle touches then disappears as a whole, so one quick swipe removes a stroke without you tracing it, and **Size** becomes **Reach**. Frameling remembers your pick, and **Eraser rubs out just the bit** in the command palette (**Ctrl+K**) flips it too.

**On a layer set to Merge** it always rubs out just the area under the circle. See [Merge shapes or keep them separate](help:merge-drawing).

**On a pixel layer** it clears pixels as you drag, and you choose its size in art pixels. Through a zoomed [camera](help:camera) the size is what you see, in whole pixels.

Using a drawing pen? Flip it over and use the eraser end.`,
  'tool-rect': `Press **R**, then drag from one corner to the opposite one.

- Hold **Shift** to keep it a perfect square.
- Hold **Alt** to draw from the middle instead of a corner.
- In the options, set how thick the outline is and how round the corners are.
- With [perspective guides](help:grids-perspective) showing and snapping on, the rectangle follows them: drag across a floor or a wall and it comes out as the matching four-sided shape, its edges running to the vanishing points. **On a plane** in the options picks **Floor**, **Wall** (or **Left wall** and **Right wall** with two points), or **Flat** for a plain rectangle. **Auto** guesses from where you drag. Hold **Ctrl** to ignore the guides for one shape.

The inside uses your **fill** colour and the edge uses your **stroke** colour, so a new rectangle starts soft yellow with a black outline. Set either one to none for just an outline or just a solid shape. See [Fill and stroke colours](help:fill-and-stroke).

On a **pixel layer** the rectangle is painted as clean pixels: an edge in the stroke colour (one pixel, or thicker: see [Pixel shapes](help:pixel-shapes)), filled with the fill colour. It follows the perspective guides and **On a plane** too, painted as crisp pixels with no soft edges (see [Pixel shapes on perspective guides](help:pixel-perspective)), and it keeps to the palette when the layer's palette is locked.`,
  'tool-ellipse': `Press **O**, then drag across the shape you want.

- Hold **Shift** for a perfect circle.
- Hold **Alt** to draw from the middle.
- The inside uses your **fill** colour and the edge your **stroke** colour. See [Fill and stroke colours](help:fill-and-stroke).
- With [perspective guides](help:grids-perspective) showing and snapping on, the ellipse is the one a circle makes when it lies on that floor or wall, so a plate on a table or a clock on a wall sits right. Pick the plane in the options, or leave it on **Auto**.

On a vector layer, ellipses are made of smooth curves, so they stay sharp however far you zoom in. On a **pixel layer** they're painted as clean, even pixel circles and ovals, with no doubled pixels, and the outline can be thicker (see [Pixel shapes](help:pixel-shapes)). On the perspective guides they follow the plane the same way, as crisp pixels: see [Pixel shapes on perspective guides](help:pixel-perspective).`,
  'tool-line': `Press **L**, then drag from where the line starts to where it ends.

- Hold **Shift** to snap to straight, diagonal and upright angles.
- Hold **Alt** to draw from the middle.
- With [perspective guides](help:grids-perspective) showing, the line lines up with a vanishing point when you draw close to its direction (and Shift picks those directions too).

Set how thick it is in the options.

On a **pixel layer** the line is one pixel wide (or as thick as you set in [Pixel shapes](help:pixel-shapes)), lines up with a vanishing point the same way, and **Shift** snaps it to the clean pixel art slopes (1 across for 1 down, 2 for 1, 3 for 1, 4 for 1 and their upright twins), so every step in the line is the same length.`,
  'tool-select': `Press **V**.

- **Click** a line or shape to select it. **Shift+click** adds more, or takes one off.
- **Drag a box** round several to select them all. Or take the **Lasso** tool (**Shift+L**) and draw round them, or the **Polygon** tool (**Shift+G**) and click each corner, or the **Magnetic lasso** (**Shift+E**) and trace roughly round them, and it clings to their edges. See [Lasso](help:lasso) and [Magnetic lasso](help:select-magnetic).
- **Drag a box over part of a shape** and Frameling asks, the first time, whether you meant just the bit you went round or the whole shape. **Ctrl** swaps it for one drag: see [Picking part of a shape](help:select-parts).
- **Drag a selection** to move it. Hold **Shift** to keep it in a straight line.
- **Drag a corner** to resize. Hold **Shift** to keep its proportions, **Alt** to resize from the middle.
- **Drag the round handle** above to turn it. Hold **Shift** to snap to neat angles.
- **Arrow keys** nudge it by one pixel, or ten with Shift.

Everything you do in one drag is one undo step. Selecting picks from the frame you're on. On a pixel layer, Select picks pixels instead: see [Selecting pixels](help:pixel-select).

**The selection follows your drawing from key to key.** Press Play or drag the playhead past a new drawing, and the same shapes, symbols and text stay selected there, so you can keep nudging or restyling them. Something you only drew in one key is left out of the selection on the other keys, and is selected again when you come back.

See [Selecting and moving](help:selecting) for the keyboard shortcuts.`,
  'tool-eyedropper': `Press **I**, then click any colour you can see. It becomes your drawing colour straight away. Drag to keep looking around.

It picks what the page looks like, all the layers together. Hold **Alt** to pick from only the layer you're on. If you click a see-through spot there's nothing to pick up.`,
  'tool-hand': `Press **H** and drag to slide the page around.

You don't have to switch tools to do it. Hold **Space** and drag with any tool, or use the middle mouse button, or scroll. See [Moving around the page](help:canvas-navigation).`,
  'tool-zoom': `Press **Z**.

- **Click** to zoom in on that spot.
- **Alt+click** to zoom out.
- **Drag a box** to zoom right in on it.

You can also zoom with **Ctrl+scroll**, or with **Ctrl+=** and **Ctrl+-**. **Ctrl+0** fits the page in the window.`,
  selecting: `- **Ctrl+A** selects everything on this frame of the layer you're on.
- **Escape** lets go of the selection.
- **Arrow keys** move the selection by one pixel. Add **Shift** to move ten.

Nudging a few times in a row counts as one change, so one Undo takes it back.

On a pixel layer these pick and move pixels, and **Ctrl+Shift+I** inverts the selection. See [Selecting pixels](help:pixel-select).`,
  'copy-paste': `Select some shapes, then:

- **Ctrl+C** copies them.
- **Ctrl+X** cuts them (copies, then removes them).
- **Ctrl+V** pastes them onto the frame you're on.

Pasting onto a different frame puts them in exactly the same place, which is handy for reusing a pose. Pasting onto the same frame puts the copy a little to the side. The pasted shapes are selected, ready to move.

Copy and paste works between frames and layers, and with other apps too: Ctrl+C also puts a picture on the computer's clipboard, and Ctrl+V pastes a picture copied anywhere. See [Copy and paste with other apps](help:clipboard-system). On a pixel layer it copies the selected pixels: see [Selecting pixels](help:pixel-select).`,
  'duplicate-delete': `- **Ctrl+D** duplicates the selection. The copy appears just beside it and is selected.
- **Delete** (or **Backspace**) removes the selection.

Both can be undone.`,
  flip: `Select something, then use **Flip horizontal** or **Flip vertical** (in the Select tool's options, or search for them in the command palette). The selection is mirrored around its own middle and stays where it is.`,
  arrange: `Shapes on one layer are stacked like paper cut-outs. Select one, then:

- **Ctrl+]** brings it forward one step. **Ctrl+Shift+]** brings it to the very front.
- **Ctrl+[** sends it back one step. **Ctrl+Shift+[** sends it to the very back.

This is about the order inside a layer. To put a whole layer above or below another, use the timeline.`,
};
