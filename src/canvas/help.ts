import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'canvas-navigation',
    order: 7,
    media: 'canvas-navigation.mp4',
    title: 'Moving around the page',
    section: 'Drawing',
    summary: 'Zoom in to work on details, zoom out to see everything, and slide the page around.',
    keywords: ['zoom', 'pan', 'scroll', 'move', 'fit', 'lost', 'center', 'centre', 'pinch'],
    body: `**Zoom**
- Scroll the mouse wheel. It zooms towards your pointer, so what you're looking at stays put. (If you'd rather the wheel slid the page up and down, change **Mouse wheel** in Preferences > Behaviour. Then **Ctrl** (**Cmd** on a Mac) plus the wheel zooms.)
- Pinch on a trackpad. This always zooms.
- **Ctrl+=** zooms in and **Ctrl+-** zooms out.
- **Ctrl+0** fits the whole page in the window. **Ctrl+1** shows it at actual size (100%).

**Move the page**
- Hold **Space** and drag. This works with any tool. A quick tap of Space, without dragging, plays or pauses your animation (Frameling asks the first time, and you can change it in Preferences > Behaviour).
- Or use the middle mouse button, the **Hand** tool (H), hold **Shift** and scroll to slide sideways, or scroll with two fingers on a trackpad.

**Lost your page?** Press **Ctrl+0** and it comes straight back.

When Frameling opens a new drawing, it fits the page for you.`,
  },
  {
    id: 'canvas-size',
    title: 'Canvas size and speed',
    section: 'Drawing',
    media: 'canvas-size.png',
    summary: 'Make the page bigger or smaller, scale your whole drawing, and change the speed, DPI and background.',
    keywords: ['canvas size', 'image size', 'resize', 'page size', 'stage', 'scale', 'crop', 'fps', 'frame rate', 'dpi', 'background', 'transparent', 'anchor'],
    body: `Open it from **Edit > Canvas size and speed...** or press **Ctrl+Alt+C**.

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
  },
  {
    id: 'where-did-it-go',
    title: 'Where did my drawing go?',
    section: 'Drawing',
    media: 'where-did-it-go.png',
    summary: 'When a frame looks empty but something is drawn on it, Frameling says why and brings it back with one click.',
    keywords: ['lost', 'missing', 'disappeared', 'vanished', 'gone', 'invisible', 'hidden layer', 'opacity', 'see-through', 'off canvas', 'off the page', 'mask', 'locked', 'where did my drawing go'],
    body: `Sometimes a drawing is there but you can't see it. When you land on a frame that looks empty, Frameling checks why, and a little note pops up with a button that fixes it:

- **On a hidden layer** (or in a hidden folder): **Show it** turns the layer back on.
- **Fully see-through** (opacity 0), on the layer, its folder or the drawing itself: **Make it solid** sets it back to full strength.
- **Masked away**: a mask layer above it has nothing drawn where your drawing is. **Turn the mask off** hides the mask layer.
- **Off the page**: **Bring it back** moves it to the middle of the page.

Each one is a normal step you can undo with **Ctrl+Z**. Frameling only mentions each one once per document, so it never nags. Things that fade or fly in on purpose (keys with in-betweens) are left alone.

**Ask any time:** **View > Where did my drawing go?** (or **Ctrl+K** and type "lost") checks this frame. If nothing is drawn here at all, it tells you the nearest frame that has a drawing and takes you there.

**Locked layers:** click something on a locked layer with the Select tool and Frameling says it's locked, instead of doing nothing. Unlock it with the padlock in the timeline.

A frame with nothing drawn on it yet isn't lost: the [ghost on empty frames](help:empty-frame-ghost) shows your last drawing faintly there.`,
  },
  {
    id: 'rulers-guides',
    title: 'Rulers and guides',
    section: 'Drawing',
    media: 'rulers-guides.png',
    summary: 'Rulers along the canvas, guide lines you drag out of them, and snapping to guides and the page.',
    keywords: ['ruler', 'rulers', 'guide', 'guides', 'snap', 'snapping', 'align', 'measure', 'units', 'magnet'],
    body: `**Rulers**
Press **Ctrl+R** (or **View > Rulers**) to show rulers along the top and left of the canvas. They count in your units and change as you zoom. A thin line on each ruler follows your pointer. Press the little box where they meet to switch units.

**Guides**
- Drag down from the top ruler for a sideways guide, or across from the left ruler for an up-and-down one. A label shows exactly where it is.
- To move a guide, drag its little triangle on the ruler. To remove it, drag the triangle back onto the ruler.
- **View > Guides** (**Ctrl+;**) hides or shows them. **View > Lock guides** stops them moving by accident. **View > Clear all guides** removes them all.
- Guides are saved with your drawing, and never show up in exports.

**Snapping**
When you move or resize shapes, or draw rectangles, ellipses and lines, they jump onto guides and onto the page's edges and middle when they get close. A pink line shows what they snapped to. Hold **Ctrl** while dragging to stop snapping for a moment, or turn it off with **View > Snap to guides and page** (**Ctrl+Shift+;**).`,
  },
  {
    id: 'pixel-grid',
    title: 'Pixel grid',
    section: 'Drawing',
    media: 'pixel-heart.mp4',
    summary: 'Lines between the pixels, shown when you zoom in close on a pixel layer.',
    keywords: ['grid', 'pixel art', 'lines'],
    body: `When you're on a pixel layer and zoomed in close (each pixel at least 6 screen pixels wide, which is 600% for single-pixel art), Frameling draws thin lines between the pixels so you can see exactly where each one is.

Turn it off or on from **View > Pixel grid**. The grid is only a guide. It never shows up in exports.`,
  },
  {
    id: 'colours',
    order: 5,
    title: 'Colours panel',
    section: 'Drawing',
    media: 'colours.png',
    summary: 'Choose the colour you draw with, and keep a palette of favourites.',
    keywords: ['color', 'palette', 'swatch', 'hex', 'picker', 'paint'],
    body: `The big square at the top is the colour you're drawing with.

- **Pick a colour** by dragging in the square (left is paler, up is brighter) and sliding the rainbow bar for the hue.
- **Type a colour** in the Hex box, like \`#ff9e6d\`.
- **Swatches** are this drawing's palette. Click one to use it. Press **+** to add the current colour. **Right-click** a swatch to rename or remove it.
- **Recently used** shows the last 8 colours you drew with, so it's easy to go back.

Tip: the Eyedropper (I) picks up any colour you can see on the page.`,
  },
  {
    id: 'tool-options',
    title: 'Tool options',
    section: 'Drawing',
    media: 'tool-options.png',
    summary: 'The settings for the tool you are using, like brush size or whether a shape is filled.',
    keywords: ['settings', 'size', 'options', 'slider', 'type a number', 'precise', 'fine'],
    body: `This panel changes to match whichever tool you've picked. Brush has size, smoothing and pointy ends. Shapes have fill and outline. The eraser has its reach.

## Sliders

Click a slider's number to type an exact value (Enter keeps it, Escape cancels). Hold **Shift** while dragging for big steps, or **Alt** or **Ctrl** for fine control. The arrow keys work the same way.

Your settings are remembered, so the brush is just as you left it next time.`,
  },
]);
