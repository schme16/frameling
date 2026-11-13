// The words of the help topics in help-ways.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-new': `Pick **Pixel art** on the New sheet (File > New), or run **New pixel art...** from the command palette. Quill asks **"Pixel time! What are we making?"** and shows four answers, each with a tiny picture:

- **One picture**: an icon, an item, a single tile. One board, one frame.
- **An animation** (*timeline frames*): one sprite that moves. The frames live on the timeline, like in Aseprite.
- **Frames on boards** (*artboards as frames*): draw each frame on its own board, side by side. They play as one animation.
- **Sprites on a sheet** (*artboards as sprites*): every board is its own sprite (hero, bat, coin) and they pack onto one sheet.

Then choose a size: 16, 24, 32, 48 or 64 pixels square, or your own. Press **Start** and you get a ready sprite: an animation comes with four empty frames and a first clip called idle, frames on boards come with four boards, and a sheet comes with Hero, Enemy and Item.

**Not sure?** Pick An animation. You can change how a sprite is built at any time and nothing is lost: see [The four ways to build a sprite](help:pixel-ways).

With Quill turned off in Preferences, the New sheet shows the same four as plain starter cards with a size row, so there is no extra step.`,
  'pixel-ways': `Every pixel sprite is built one of four ways. The **chip** at the start of the pixel bar says which, for example **One picture** or **Animation, 23 frames**.

| Way | What it is | The layout |
|---|---|---|
| One picture | One board, one frame | The timeline folds away, with a **Make it move** button |
| An animation | One sprite, frames on the timeline, clips name the moves | Timeline and [Preview](help:pixel-preview) |
| Frames on boards | One board per frame, they play in order | The [Artboards](help:artboards) panel up front |
| Sprites on a sheet | One board per sprite, each can have its own frames | The Artboards panel up front |

## Changing it

Click the chip, or run **Change how this sprite is built...** from the Pixel menu. Each way says what it would do, and why one is not possible. It is one undo step.

- **Timeline frames to boards**: every frame becomes its own board, side by side. Clips are not kept on boards.
- **Boards to timeline frames**: every board becomes frames on one timeline, in order. Layers are matched by name (frames that share one set of layers already match), and the boards must all be the same size. If one is not, you are told which.
- **Frames on boards and a cast on a sheet** swap by changing what the boards are called.
- **Make it move** turns a one-picture sprite into an animation with four frames and a first clip.

The way is saved in the file. Older files and files from other programs are worked out from what is in them.

## Quill notices

Add a second frame to a one-picture sprite and the timeline comes back. Add a second board and Quill asks once whether they are frames of one sprite or different sprites, then remembers. In Export, Quill says in one sentence how the sheet is built, with a link to change it.`,
  'pixel-shared-layers': `In **Frames on boards** every frame is a board, and all the boards use **one set of layers**. Add a layer called Lines once and every frame has a Lines layer. Each frame keeps its own pixels on it, so frame 7's lines are not frame 8's. This is how Aseprite works: layers go one way, frames the other.

**Add, rename, hide, lock, reorder:** do it on any frame, in the [Layers](help:timeline-layers) panel or on the timeline. Every frame follows, because there is only one stack. The note at the top of the Layers panel says **on every frame** so you know.

**Delete a layer:** it goes from every frame, with what was drawn on it. **Duplicate** copies it on every frame too, with its own copies of the pictures. Both are one undo step.

**New boards:** a new board starts with the same layers and nothing drawn on them.

## A file that already has layers per board

Frameling never rewrites a file on its own. When you open frames on boards where each board has its own layers, Frameling asks once whether to put them on one stack, and remembers your answer (change it any time in Preferences > Behaviour). To do it later, run **Put the frames on one stack of layers** from the Pixel menu.

Layers with the same kind and name join up, so 23 frames that each have Lines end up with one Lines. A layer only some frames have is added to the stack, and the others are empty there. If two boards disagree about a setting, the open board's wins. One undo step puts it back, and **Give each board its own layers** does the same on purpose.

## Good to know

- **Sprites on a sheet** keep a stack per board, because each board is a different sprite.
- **Variations** (linked copies) need layers of their own, so making one is off while the frames share a stack. Give each board its own layers first.
- Going from boards to timeline frames matches layers by their place in the one stack, so nothing is merged by name.

See also [The four ways to build a sprite](help:pixel-ways) and [Artboards](help:artboards).`,
  'pixel-wells': `In the [Pixel workspace](help:pixel-workspace) the colour boxes are called **Paint** (the square in front) and **Back** (behind it). Every pixel tool paints with Paint, and nothing quietly switches to a different colour when you change tool: pick green and the bucket pours green.

- **Click a swatch** in the [Palette](help:palette) to set Paint. Click a big square to pick any colour for it.
- **X** swaps Paint and Back. The squares do a little pop.
- **Right-click** on the canvas paints with Back, for that one stroke.
- **Hold Alt** and click to pick a colour from the canvas, then let go to carry on drawing (the temporary eyedropper).
- The [dither](help:tool-dither) brush uses Paint and Back as its two colours. Shapes are drawn in Paint, and filled in Paint when you turn on **Filled** in their options.

The **Draw** and **Animate** workspaces keep the Fill and Stroke boxes, see [Fill and stroke colours](help:fill-and-stroke). The files are the same either way: Paint is the stroke colour and Back is the fill colour.`,
};
