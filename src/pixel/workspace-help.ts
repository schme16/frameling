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
