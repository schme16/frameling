// The words of the help topics in workspace-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-workspace': `Pick **View > Workspaces > Pixel**. The first time pixel art meets the Draw workspace (a new pixel art file, or one you open), or a drawing opens in Pixel, Frameling asks: **Switch workspaces to match the kind of drawing?** Say **Always** and Pixel opens for pixel art and Draw for drawings, by themselves, from then on. **Not now** asks again next time, and **Never** leaves your layout alone. The Animate workspace and ones you made yourself are never switched. Change your answer any time in Preferences, under Behaviour. A new pixel art file starts on the Pencil.

What changes:

- **The tool strip shows only pixel tools** on a pixel layer: pencil, eraser, bucket, shade, dither, spray, line, rectangle, ellipse, the four ways to pick (box, lasso, polygon, magic wand), eyedropper, hand and zoom. The pencil has a size, and size 1 is the plain pencil. Other tools still work from their keys.
- **The [Palette](help:palette) is on the left, with bigger colours**, laid out in its ramps, and the two big [Paint and Back](help:pixel-wells) squares at the top.
- **The mode chip** at the start of the pixel bar says how the sprite is built, and the layout follows it: see [The four ways to build a sprite](help:pixel-ways).
- **The [Preview](help:pixel-preview) panel** leads the right side, playing your animation at real size. A one-picture file (one frame) starts with it put away, and it comes forward by itself when you add a second frame.
- **The status bar speaks in pixels**: the zoom is a percentage of screen pixels per pixel of your sprite (800%) and the size is the sprite's own, like 32 x 32. See [Aseprite habits](help:pixel-aseprite-habits) for the zoom keys.
- **The [pixel bar](help:pixel-bar)** sits over the canvas with brush size and shape, pixel perfect, mirror drawing, onion skin, tile mode and the grid.
- **The timeline** shows your clips (idle, run, jump) along the top.
- **Export starts on a sprite sheet at art size**, one art pixel to one pixel, the first time you open it on a drawing. See [Sprite sheets](help:export-sprite-sheets).
- Panels pixel art rarely needs (bones, lip sync, text, particles, camera) start closed. View > Panels opens any of them.

The pixel grid shows whenever you're zoomed in far enough to see it. Turn it off with the grid switch on the pixel bar.`,
  'pixel-aseprite-habits': `If you know Aseprite, your fingers already know most of this.

- **Hold Alt and click** with the pencil, brush, eraser, bucket, shade or dither to pick up the colour you click, then let go and carry on with the same tool. Alt picks from everything you see. The line, rectangle and ellipse keep Alt for drawing from the middle.
- **+** makes the pencil, eraser, dither or spray one pixel bigger and **_** (Shift and minus) one pixel smaller. With **Aseprite keys**, **=** and **-** do too. (In Frameling's own keys **=** adds a frame and **-** removes one.)
- **[ and ]** paint with the colour before or after this one in the [palette](help:palette). After the last it starts again at the first.
- **1 to 6** zoom to 100%, 200%, 400%, 800%, 1600% and 3200%. Zoom is how many screen pixels each pixel of your sprite takes, so 800% shows every art pixel 8 screen pixels wide. The number is in the status bar.
- **Tab** puts the panels away, and brings them back. It works while the mouse is over the canvas and nothing else has the keyboard, so Tab still moves round the panels everywhere else.

## Turn the keys on

The first time a pixel file opens, Quill asks once **"Coming from Aseprite?"** with two answers: **Use Aseprite keys** or **Use Frameling keys**. Your answer is remembered, and you can change it any time in Preferences, Behaviour (or pick a set in Keyboard).

**+**, **_**, **[**, **]** and **1 to 6** work in Frameling's own keys too. **Tab** (hide the panels), **-** (a smaller brush in that set) and Aseprite's tool letters come with **Aseprite keys**, a [shortcut set](help:shortcut-sets): Preferences, Keyboard, Shortcut set. With them the arrow keys still nudge a selection, and **Alt+Left** and **Alt+Right** step between frames. The same commands are in the [command palette](help:command-palette) (type "brush size" or "zoom"), and you can give them any key you like. **Alt** works for everyone.

The status bar and the [Artboards](help:artboards) panel use pixel units in the Pixel workspace: your sprite is **32 x 32**, not the size of the page it sits on.`,
  'pixel-bar': `In the [Pixel workspace](help:pixel-workspace), a slim bar runs across the top of the canvas. It changes with the tool.

- **The chip** at the start says how the sprite is built (One picture, Animation, Frames on boards, Sprites on a sheet). Click it to change. See [The four ways to build a sprite](help:pixel-ways).
- **Size 1 to 8** sets the pencil, shade, eraser, dither or spray size in pixels. Size 1 is the plain pencil.
- **Square or round** sets the brush shape. Round shows from size 3.
- **Pixel perfect** tidies the corners of hand-drawn lines so they stay one pixel thick.
- **The four ways to pick** are side by side: **Box**, **Lasso**, **Polygon** and **Magic wand**. Click one to pick with it, and they share one selection, so you can start a box and add to it with the lasso. Everything else about picking (how each new pick joins the last, what the wand matches) is behind **More tool options**. See [Picking part of a drawing](help:selecting).
- **Mirror**: left and right, top and bottom, or both. Click the lit one again to turn it off. Shift+M cycles. See [Mirror drawing](help:pixel-mirror).
- **Onion skin** (Shift+O) shows the frames either side. See [Onion skin](help:timeline-onion).
- **Tile mode** repeats the drawing round the edges for seamless tiles (it comes with the Tiles feature). See [Tile mode](help:tile-mode).
- **Grid** shows the lines between pixels when you zoom in.
- On a layer [locked to the palette](help:palette-lock), the bar says which palette colour you're painting with: **Colour 5/16** is the fifth of sixteen. A colour that isn't in the palette shows the one it will snap to.

The sliders button at the end opens the Tool options panel, with everything else the tool can do.`,
  'pixel-preview': `Pixel art looks different at the size it will really be. The **Preview** panel plays your animation there, while you keep drawing big.

- **1x** is real size: one art pixel is one screen pixel, as in a game. **2x** and **3x** are double and triple. **Fit** is as big as fits, in whole steps so pixels stay square.
- Click the picture, or the play button, to pause and play. Paused, it shows the frame you're on.
- The loop button switches between looping and playing once.
- **Quill for scale**: a tiny Quill, 48 pixels tall, stands next to your sprite at the same scale so you can feel how big it really is. The heart button turns him off. He is not there when Quill is turned off in Preferences.
- **All frames** or **This clip**: play everything, or just the clip the playhead is in (idle, run...).
- **Frames on boards** and **sprites on a sheet** add a strip of boards under the picture. See [Preview on several boards](help:pixel-preview-boards).
- It plays at your frames per second and holds each drawing as long as the timeline does, so timing looks right.
- Every change shows straight away, so you can draw a frame and watch it move.
- While the timeline itself is playing, the Preview follows it.

It's in the Pixel workspace on the right. Anywhere else, open it from View > Panels > Preview. Pixel > Play or pause the Preview works from the command palette too.`,
  'pixel-preview-boards': `When a sprite has several boards, the [Preview](help:pixel-preview) adds a strip of small buttons under the picture. What the strip does depends on [how the sprite is built](help:pixel-ways).

- **Frames on boards**: the Preview plays every board in order as one animation, each board a frame (or as many frames as its own timeline has). The strip shows which board is playing, with the playing one lit. Click a board to jump there. While paused, clicking a board opens it for drawing instead.
- **Sprites on a sheet**: the Preview plays the sprite you have open. The strip lists your sprites by name (Idle, Run, Jump...): click one to watch it here without leaving the sprite you are drawing, and click it again to go back to the open one.

Handy for checking a walk cycle while you draw an idle, or a whole film strip of frames end to end.`,
};
