// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'canvas-navigation': `**Zoom**
- Scroll the mouse wheel. It zooms towards your pointer, so what you're looking at stays put. (If you'd rather the wheel slid the page up and down, change **Mouse wheel** in Preferences > Behaviour. Then **Ctrl** (**Cmd** on a Mac) plus the wheel zooms.)
- Pinch on a trackpad. This always zooms.
- **Ctrl+=** zooms in and **Ctrl+-** zooms out.
- **Ctrl+0** fits the whole page in the window. **Ctrl+1** shows it at actual size (100%).

**Move the page**
- Hold **Space** and drag. This works with any tool. A quick tap of Space, without dragging, plays or pauses your animation (Frameling asks the first time, and you can change it in Preferences > Behaviour).
- Or use the middle mouse button, the **Hand** tool (H), hold **Shift** and scroll to slide sideways, or scroll with two fingers on a trackpad.

**Lost your page?** Press **Ctrl+0** and it comes straight back.

When Frameling opens a new drawing, it fits the page for you.`,
  'canvas-size': `Open it from **Edit > Canvas size and speed...** or press **Ctrl+Alt+C**.

**Two ways to change the size**
- **Change the page** (canvas size): your drawing stays the size it is, and space is added or removed around it. The little grid of squares (the anchor) says where your drawing stays. Pick the middle to grow evenly on every side, or a corner to add space on the other sides.
- **Scale everything** (image size): your whole drawing grows or shrinks with the page. Lines get thicker or thinner to match, and so do effects like blur and shadows.

Sizes are shown in your units (Preferences > Units). The chain button between width and height keeps the shape the same (keep proportions). Press it to change them apart.

**Pixel art** stays crisp. Making the page bigger or smaller adds or removes rows and columns of pixels, moving by whole pixels only. Scaling goes in whole steps (2x, 3x...), so every pixel stays a clean square and nothing is blurred.

**Trimmed too much?** Vector shapes outside the page are kept, so making it bigger again brings them back. Pixels outside the page are cut. Press **Ctrl+Z** to undo the whole change in one go.

**Also here**
- **Speed (frames per second)**: how many drawings show each second. 12 is the classic hand-drawn speed.
- **Dots per inch (DPI)**: shown when your units aren't pixels. It changes how big the drawing prints, not its pixels.
- **Background**: the page colour, or **See-through** for a transparent page.`,
  'where-did-it-go': `Sometimes a drawing is there but you can't see it. When you land on a frame that looks empty, Frameling checks why, and a little note pops up with a button that fixes it:

- **On a hidden layer** (or in a hidden folder): **Show it** turns the layer back on.
- **Fully see-through** (opacity 0), on the layer, its folder or the drawing itself: **Make it solid** sets it back to full strength.
- **Masked away**: a mask layer above it has nothing drawn where your drawing is. **Turn the mask off** hides the mask layer.
- **Off the page**: **Bring it back** moves it to the middle of the page.

Each one is a normal step you can undo with **Ctrl+Z**. Frameling only mentions each one once per document, so it never nags. Things that fade or fly in on purpose (keys with in-betweens) are left alone.

**Ask any time:** **View > Where did my drawing go?** (or **Ctrl+K** and type "lost") checks this frame. If nothing is drawn here at all, it tells you the nearest frame that has a drawing and takes you there.

**Locked layers:** click something on a locked layer with the Select tool and Frameling says it's locked, instead of doing nothing. Unlock it with the padlock in the timeline.

A frame with nothing drawn on it yet isn't lost: the [ghost on empty frames](help:empty-frame-ghost) shows your last drawing faintly there.`,
  'rulers-guides': `**Rulers**
Press **Ctrl+R** (or **View > Rulers**) to show rulers along the top and left of the canvas. They count in your units and change as you zoom. A thin line on each ruler follows your pointer. Press the little box where they meet to switch units.

**Guides**
- Drag down from the top ruler for a sideways guide, or across from the left ruler for an up-and-down one. A label shows exactly where it is.
- To move a guide, drag its little triangle on the ruler. To remove it, drag the triangle back onto the ruler.
- **View > Guides** (**Ctrl+;**) hides or shows them. **View > Lock guides** stops them moving by accident. **View > Clear all guides** removes them all.
- Guides are saved with your drawing, and never show up in exports.

**Snapping**
Shapes jump onto guides, the page's edges and middle, the grid and more when they get close, and a small note at the bottom of the canvas says what they snapped to. Pick exactly what to snap to in [Snapping](help:snapping). Hold **Ctrl** while dragging to stop it for a moment.`,
  snapping: `Snapping is a little pull: when a shape you draw or move gets close to something, it jumps onto it so things line up. You choose what it can jump onto.

**Change it**
- Press the **Snap** button at the bottom of the window (**View > Snapping options...**, or **Preferences > Snapping**).
- The big switch turns all snapping on or off (**View > Snapping**, **Ctrl+Shift+;**). Hold **Ctrl** while dragging to skip it for one shape.
- Tick or untick any row. Each kind of layer has its own ticks, and the column for the layer you are on is shaded. Your choices are remembered.
- **Snap distance** is how close, in screen pixels, something has to come before it jumps. Drag it up if snapping feels shy, down if it grabs too eagerly.
- Every row is also a command in the command palette (**Ctrl+K**): try "snap to guides".

**What you can snap to**
- **Page edges** and **Page middle**: the border of the page, and its middle across and down.
- **Guides**: the lines you drag out of the rulers ([Rulers and guides](help:rulers-guides)).
- **Grid**: the square or isometric [grid](help:grids-perspective), while it shows.
- **Other shapes**: the edges, middles and corner points of the other shapes, so a new shape lines up with what is there. **All layers, not just this one** picks every visible layer (the usual) or only the layer you are on.
- **Equal gaps**: next to other shapes, it settles where the space matches a space already there, or sits in the middle of one, and little bars show the exact sizes. It works while you drag a shape and while you draw one, on the corner you are dragging and the far end of a line.
- **Perspective lines**: lines and boxes follow the vanishing points, while the perspective guides show.
- **Plugin guides**: the straight lines and boxes a [plugin](help:plugins) draws on your canvas, while it is on and allowed to draw there.
- **Pixel cells** (pixel layers): drawing stays on whole pixels, and guides, the grid and the page stay out of the way. Untick it to snap pixel layers to those too.
- **Angle steps**: with **Shift**, a line turns to the nearest 45 degrees (or toward a vanishing point) and a rotation moves in steps. Shift is something you ask for, so the big switch and Ctrl don't stop it.
- **Other artboards**: moving or sizing an [artboard](help:artboards), its edges and middle line up with the other artboards'.

**What snapped**
A line shows what a shape landed on, and each kind has its own colour, in every theme. A note at the bottom of the canvas says it in words, with a dot in the same colour, like "Snapped to guide and page edge".

By default vector layers snap to the page, guides, the grid, perspective lines, plugin guides, other shapes and equal gaps, artboards line up with each other, and pixel layers stick to their cells. Ticks you already changed are kept.`,
  'pixel-grid': `When you're on a pixel layer and zoomed in close (each pixel at least 6 screen pixels wide, which is 600% for single-pixel art), Frameling draws thin lines between the pixels so you can see exactly where each one is.

Turn it off or on from **View > Pixel grid**. The grid is only a guide. It never shows up in exports.`,
  colours: `The big square at the top is the colour you're drawing with.

- **Pick a colour** by dragging in the square (left is paler, up is brighter) and sliding the rainbow bar for the hue.
- **Type a colour** in the Hex box, like \`#ff9e6d\`.
- **Swatches** are this drawing's palette. Click one to use it. Press **+** to add the current colour. **Right-click** a swatch to rename or remove it.
- **Recently used** shows the last 8 colours you drew with, so it's easy to go back.

Tip: the Eyedropper (I) picks up any colour you can see on the page.`,
  'tool-options': `This panel changes to match whichever tool you've picked. Brush has size, smoothing and pointy ends. Shapes have fill and outline. The eraser has its reach.

## Sliders

Click a slider's number to type an exact value (Enter keeps it, Escape cancels). Hold **Shift** while dragging for big steps, or **Alt** or **Ctrl** for fine control. The arrow keys work the same way.

Your settings are remembered, so the brush is just as you left it next time.`,
  'grids-perspective': `**Grids**
- **View > Square grid** (**Ctrl+'**) puts graph paper over the page.
- **View > Isometric grid** shows diamonds for drawing boxes, rooms and tiles in 3D. Pick **2:1** for pixel art (two across for one down, the slope games use) or **30 degrees** for true isometric drawings.
- **View > Grid and perspective settings...** sets the size, in your units (Preferences > Units). For isometric it's the width of one diamond.

While snapping is on (**View > Snapping**, with Grid ticked in [Snapping](help:snapping)), shapes and corners jump onto the square grid's lines, and onto the isometric grid's corners. Hold **Ctrl** while dragging to stop it for a moment. When you zoom far out, the grid thins itself out so it never turns into a grey smudge.

**Perspective guides**
- **View > Perspective guides: one point** shows lines meeting at one vanishing point on the horizon. Use it for a road, a hallway or train tracks heading away from you.
- **Two point** has two vanishing points, for boxes and buildings seen from a corner.

The horizon is the yellow line. Drag a round handle to move its vanishing point (it works with any tool). With two, the horizon stays level, so moving one up moves the other with it. Hold **Shift** to tilt it. Points can go off the page: zoom out to reach them. **Lock guides** stops them moving by accident.

**Rectangles and ellipses** follow them too. Drag a rectangle across the floor and it becomes a four-sided floor tile whose edges run to the vanishing points. Drag it on a wall and the upright edges stay upright. An ellipse comes out as the ellipse a circle makes on that plane. Choose the plane in the tool's options (**Auto**, **Flat**, **Floor**, **Wall**), or leave **Auto** to guess from where you drag. **Flat** draws an ordinary rectangle.

**Drawing along them.** While the guides show and Perspective lines is ticked in [Snapping](help:snapping), the **Line** tool and the **Pen** follow them: draw near the direction of a vanishing point and the line lines up with it exactly, with a dashed line to show which one. Hold **Shift** to pick from the vanishing point directions as well as the usual straight and diagonal angles. Hold **Ctrl** to draw freely.

The perspective guides are saved with your drawing. Hide them with **View > Show perspective guides**, or take them away with **Remove perspective guides**.

> Grids and guides are only for you. They never show when you play or export.`,
  'light-table': `Animators trace on a light table: a glowing desk that shows the drawing underneath through the paper. Frameling's light table shows a frame you choose, faintly, on every frame you go to.

**Put something on it**
- **View > Put this frame on the light table** pins the whole frame you're on.
- To pin just one drawing, right-click it in the timeline and pick **Put this drawing on the light table**. Or use **View > Put this layer's drawing on the light table**.

Now go to any other frame and draw over it. The timeline's top bar shows what's on the light table, with a slider for how strongly it shows, and an **x** to clear it. Click its name to jump back to that frame.

**How it's different**
- The [onion skin](help:timeline-onion) shows the frames next to the one you're on, so it moves as you move. The light table stays put on the frame you chose. You can have both at once.
- The [ghost on empty frames](help:empty-frame-ghost) only shows the last drawing, and only on an empty frame. The light table shows whatever you pinned, everywhere.

It's only for you: it never shows when you play or export. Looking through the [camera](help:camera), it goes through it too, so it sits where you see the drawing.`,
};
