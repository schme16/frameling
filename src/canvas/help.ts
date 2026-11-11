import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'canvas-navigation',
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
    id: 'pixel-grid',
    title: 'Pixel grid',
    section: 'Drawing',
    summary: 'Lines between the pixels, shown when you zoom in close on a pixel layer.',
    keywords: ['grid', 'pixel art', 'lines'],
    body: `When you're on a pixel layer and zoomed in close (each pixel at least 6 screen pixels wide, which is 600% for single-pixel art), Frameling draws thin lines between the pixels so you can see exactly where each one is.

Turn it off or on from **View > Pixel grid**. The grid is only a guide. It never shows up in exports.`,
  },
  {
    id: 'colours',
    title: 'Colours panel',
    section: 'Drawing',
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
    summary: 'The settings for the tool you are using, like brush size or whether a shape is filled.',
    keywords: ['settings', 'size', 'options'],
    body: `This panel changes to match whichever tool you've picked. Brush has size, smoothing and pointy ends. Shapes have fill and outline. The eraser has its reach.

Your settings are remembered, so the brush is just as you left it next time.`,
  },
]);
