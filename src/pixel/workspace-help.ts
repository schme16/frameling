// Help for the Pixel workspace, its pixel bar and the Preview panel.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-workspace',
    order: 2,
    media: 'pixel-workspace.png',
    title: 'The Pixel workspace',
    section: 'Pixel art',
    summary: 'A layout made for pixel art: only the pixel tools, a big palette, a real-size preview and a bar of quick switches.',
    keywords: ['pixel workspace', 'layout', 'sprite', 'aseprite', 'pixel mode', 'game art'],
    body: `Pick **View > Workspaces > Pixel**. When you open pixel art in another workspace, Frameling asks once whether to switch, and remembers your answer (change it in Preferences, under Behaviour).

What changes:

- **The tool strip shows only pixel tools** on a pixel layer: pencil, brush, eraser, bucket, shade, dither, line, rectangle, ellipse, select, eyedropper, hand and zoom. Other tools still work from their keys.
- **The [Palette](help:palette) is on the left, with bigger colours**, laid out in its ramps.
- **The [Preview](help:pixel-preview) panel** leads the right side, playing your animation at real size.
- **The [pixel bar](help:pixel-bar)** sits over the canvas with brush size and shape, pixel perfect, mirror drawing, onion skin, tile mode and the grid.
- **The timeline** shows your clips (idle, run, jump) along the top.
- **Export starts on a sprite sheet at art size**, one art pixel to one pixel, the first time you open it on a drawing. See [Sprite sheets](help:export-sprite-sheets).
- Panels pixel art rarely needs (bones, lip sync, text, particles, camera) start closed. View > Panels opens any of them.

The pixel grid shows whenever you're zoomed in far enough to see it. Turn it off with the grid switch on the pixel bar.`,
  },
  {
    id: 'pixel-aseprite-habits',
    media: 'pixel-aseprite-habits.png',
    title: 'Aseprite habits',
    section: 'Pixel art',
    summary: 'Hold Alt to pick a colour, + and - for the brush size, [ and ] along the palette, 1 to 6 to zoom, Tab to hide the panels.',
    keywords: ['aseprite', 'alt eyedropper', 'brush size keys', 'plus minus', 'palette keys', 'zoom keys', 'hide panels', 'tab', 'habits', 'shortcuts'],
    body: `If you know Aseprite, your fingers already know most of this.

- **Hold Alt and click** with the pencil, brush, eraser, bucket, shade or dither to pick up the colour you click, then let go and carry on with the same tool. Alt picks from everything you see. The line, rectangle and ellipse keep Alt for drawing from the middle.
- **+ and -** make the brush, eraser or dither one pixel bigger or smaller. The pencil is always one pixel, so **+** turns it into the brush at 2 pixels.
- **[ and ]** paint with the colour before or after this one in the [palette](help:palette). After the last it starts again at the first.
- **1 to 6** zoom to 100%, 200%, 400%, 800%, 1600% and 3200%. Zoom is how many screen pixels each pixel of your sprite takes, so 800% shows every art pixel 8 screen pixels wide. The number is in the status bar.
- **Tab** puts the panels away, and brings them back. It works while the mouse is over the canvas and nothing else has the keyboard, so Tab still moves round the panels everywhere else.

## Turn the keys on

**+ - [ ] 1 to 6** and **Tab** come with **Aseprite keys**, a [shortcut set](help:shortcut-sets): Preferences, Keyboard, Shortcut set. The same commands are in the [command palette](help:command-palette) (type "brush size" or "zoom"), and you can give them any key you like. **Alt** works for everyone.

The status bar and the [Artboards](help:artboards) panel use pixel units in the Pixel workspace: your sprite is **32 x 32**, not the size of the page it sits on.`,
  },
  {
    id: 'pixel-bar',
    media: 'pixel-bar.png',
    title: 'The pixel bar',
    section: 'Pixel art',
    summary: 'The strip over the canvas in the Pixel workspace: size, shape, pixel perfect, mirror, onion skin, tile mode, grid and palette colour.',
    keywords: ['pixel bar', 'context bar', 'brush size', 'brush shape', 'symmetry', 'quick toggles'],
    body: `In the [Pixel workspace](help:pixel-workspace), a slim bar runs across the top of the canvas. It changes with the tool.

- **Size 1 to 8** sets the brush, shade, eraser or dither size in pixels. The pencil is always one pixel, so picking a bigger size switches to the brush, which is the pencil with a size.
- **Square or round** sets the brush shape. Round shows from size 3.
- **Pixel perfect** tidies the corners of hand-drawn lines so they stay one pixel thick.
- With **Select**, pick a box, a lasso or the magic wand.
- **Mirror**: left and right, top and bottom, or both. Click the lit one again to turn it off. Shift+M cycles. See [Mirror drawing](help:pixel-mirror).
- **Onion skin** (Shift+O) shows the frames either side. See [Onion skin](help:timeline-onion).
- **Tile mode** (Shift+T) repeats the drawing round the edges for seamless tiles. See [Tile mode](help:tile-mode).
- **Grid** shows the lines between pixels when you zoom in.
- On a layer [locked to the palette](help:palette-lock), the bar says which palette colour you're painting with: **Colour 5/16** is the fifth of sixteen. A colour that isn't in the palette shows the one it will snap to.

The sliders button at the end opens the Tool options panel, with everything else the tool can do.`,
  },
  {
    id: 'pixel-preview',
    media: 'pixel-preview.mp4',
    title: 'Preview (real size)',
    section: 'Pixel art',
    summary: 'Watch your animation play at real size, crisp, in a loop, while you draw.',
    keywords: ['preview', 'real size', 'actual size', '1x', '2x', 'mini view', 'sprite preview', 'loop'],
    body: `Pixel art looks different at the size it will really be. The **Preview** panel plays your animation there, while you keep drawing big.

- **1x** is real size: one art pixel is one screen pixel, as in a game. **2x** and **3x** are double and triple. **Fit** is as big as fits, in whole steps so pixels stay square.
- Click the picture, or the play button, to pause and play. Paused, it shows the frame you're on.
- The loop button switches between looping and playing once.
- **All frames** or **This clip**: play everything, or just the clip the playhead is in (idle, run...).
- It plays at your frames per second and holds each drawing as long as the timeline does, so timing looks right.
- Every change shows straight away, so you can draw a frame and watch it move.
- While the timeline itself is playing, the Preview follows it.

It's in the Pixel workspace on the right. Anywhere else, open it from View > Panels > Preview. Pixel > Play or pause the Preview works from the command palette too.`,
  },
]);
