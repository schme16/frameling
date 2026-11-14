// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-select': `Each way of picking is its own tool in the toolbar, so you can see them all and reach any of them in one press:

- **Box** (**V**): drag a rectangle (a *marquee*).
- **Lasso** (**Shift+L**): draw round what you want. Hold **Alt** as you let go and each **Alt+click** adds a straight side; click without Alt, click the first point, or press **Enter**, to finish.
- **Polygon** (**Shift+G**): click each corner, one at a time, then close it: click the first corner again, or press **Enter** wherever you are. **Escape** gives up on it. Good for anything with straight edges, where a freehand lasso wobbles.
- **Magnetic lasso** (**Shift+E**): trace roughly round something and the outline clings to its edge. Click to place a point yourself, **Backspace** takes the last one back, **Enter** closes it. See [Magnetic lasso](help:select-magnetic).
- **Magic wand** (**W**): click a colour to pick it. **Colour match** lets close colours in too, and turn off **Only touching pixels** to pick that colour everywhere. Shortcut: **W**.

The selected part gets a crawling dashed edge (*marching ants*).

They all share one selection, so you can start a box, then switch to the lasso and add to it.

**Adding and taking away.** Hold **Shift** to add to the selection, **Alt** to take away (start outside the selection), both to keep only the overlap. Or set **Each new pick** in the options.

**Moving.** Drag inside the selection to move those pixels (Shift keeps it straight). The arrow keys nudge one pixel, ten with Shift. The pixels float above the drawing while you move them, and land when you deselect, pick another tool, or change frame or layer. However many drags and nudges it took, it's **one undo step**. Undo while they're still floating just puts them back. Undo and Redo bring the selection back too, as it was before and after each step.

**Copying.** Hold **Alt** and drag inside the selection to drag a copy, leaving the original. **Ctrl+D** (*duplicate*) makes a copy one pixel down and right, ready to drag. If you'd rather Alt always took away, change it in Preferences, Behaviour.

**Copy, cut and paste.** Ctrl+C, Ctrl+X and Ctrl+V work on the selected pixels. A paste lands in the same place, floating, ready to drag. It works across frames and layers.

**Everything else stays inside.** With a selection:

- Painting (pencil, brush, eraser, shade, dither, shapes, the paint bucket) only changes selected pixels.
- **Delete** clears the selected pixels.
- The **Pixel tools** menu's flips and turns work on just the selection, around its middle, and the selection turns too.
- **Add outline** goes round just the selected art, onto empty pixels.
- **Reduce to palette** changes only the selected pixels.

**Ctrl+A** selects everything, **Ctrl+Shift+I** inverts (selects everything else), **Escape** lets go. The selection stays put when you change frame, so you can work on the same spot frame after frame.`,
  'selection-numbers': `Dragging is quick, but sometimes you want an icon at exactly 64 by 64, or a button 200 pixels from the left. Select something and type it instead.

Open **View > Panels > Symbol and motion** (or press **Ctrl+K** and search **Type an exact position and size**, which opens it and puts the cursor in **X**).

## Shapes

Select one shape or several and the **Position and size** boxes appear:

- **X** and **Y** are where the left and top of the selection's box are.
- **Width** and **Height** are how big the box is. **Keep proportions** (on to begin with) makes typing one change the other too, so nothing squashes.
- **Turn by** turns the selection that many degrees clockwise about its middle. **Slant by** leans it sideways the same way.

Press **Enter** or click away to make it happen; one box is one step in **Undo**. They use the units you chose in **Preferences > General > Units**, so millimetres and inches work too.

**Turn by** and **Slant by** say "from where it is now", because a plain shape doesn't remember an angle: type 15 and it turns 15 degrees, and the box goes back to 0. A [symbol](help:symbol-properties) does remember its angle, so its own **Turn** and **Slant** show the angle it has.

## Pixels

Select pixels with the [Select tool](help:pixel-select) and the same boxes count **whole pixels of the art**, not of the page. **X 3** is the fourth column of the sprite, wherever it is on the page and however big it is zoomed. On a layer drawn at 8 page pixels to each art pixel, X 3 sits 24 pixels across the page.

You can move, stretch and turn pixels this way. **Width** and **Height** repeat or skip whole pixels, so every colour stays one of your own. **Slant** isn't there: it would smear the pixels.

## Good to know

- A symbol on its own keeps its own boxes, which show its angle and size as numbers.
- Pixels moved off the edge of the picture are dropped.`,
  'select-magnetic': `Press **Shift+E**, or pick **Magnetic lasso** (the horseshoe magnet) in the toolbar. It is a lasso that reaches for the edge your drawing already has, so cutting a character out of its background does not take a steady hand.

1. **Click** on or near the edge to start.
2. **Move the pointer** round the shape, roughly. The outline snaps onto the edge close to the pointer, and a dot shows where it has hold. Points drop by themselves as you go.
3. **Click** wherever you want a point of your own, say at a tricky corner.
4. **Backspace** takes the last stretch back. **Escape** gives up.
5. **Close it** by clicking the first point again, or press **Enter** wherever you are.

On a **pixel layer** the edge is exact: it follows the line where one colour meets the next, pixel by pixel, so the outline lands on the sprite and not just near it. Where there is no edge in reach (flat colour all round), it draws a straight line to the pointer.

On a **vector layer** it clings to the outlines of your shapes, so one trace picks up the shapes you went round.

**How strongly it clings** is in the tool options. Light only catches an edge right under the pointer. Strong reaches for one from further off, so a rough trace still lands on the outline. If it grabs the wrong line in a busy drawing, turn it down, or zoom in and click your own points.

Shift adds to the selection and Alt takes away, the same as the other ways to pick. See [Selecting pixels](help:pixel-select).`,
  lasso: `Press **Shift+L**, or pick **Lasso** in the toolbar.

- **Drag round** what you want. When you let go, every shape the lasso touches is selected.
- **Straight sides:** hold **Alt** as you let go, then **Alt+click** each corner. Click without Alt, click the first point, or press **Enter**, to finish. **Escape** gives up.
- **Shift** adds to what's already selected.

On a **merge layer** (where shapes join like paint) the lasso cuts out exactly what's inside it, so you can lift out just part of a painted area and move it, recolour it or delete it.

On a pixel layer the lasso picks pixels instead: see [Selecting pixels](help:pixel-select).

Want it to cling to the edges of what you are going round? Try the [Magnetic lasso](help:select-magnetic).`,
};
