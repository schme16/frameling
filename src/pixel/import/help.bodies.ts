// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-import': `Frameling opens **PNG**, **GIF** and **WebP** pictures, and sprite sheets, as pixel art. Pick **File > Open** (Ctrl+O) and choose the picture, or **drag it onto the window**. **File > Import > Picture or sprite sheet** (Ctrl+I) adds one to the drawing you already have open.

A dialog shows the picture and how it will be cut. Nothing happens until you press **Bring it in**, and Cancel leaves everything as it was.

## An animated GIF, PNG or WebP

Every frame comes in with its own delay, and each frame looks the way it does when the animation plays (the frames that clear or restore the picture before the next one are handled). Frameling picks the frame rate that fits every delay and holds frames to match. Play and the slider in the dialog show the animation first. This works for animated PNG (APNG) and animated WebP as it does for GIF.

## A sprite sheet

A picture with a row of sprites on it is cut into frames: pick **Grid**, **Find the gaps** or **From a JSON** in the dialog. [Cutting a sprite sheet](help:pixel-sheets) says how each works.

## What it becomes

The four ways to build a sprite (see [Changing how a sprite is built](help:pixel-ways)):

- **One picture**: the first frame only.
- **An animation**: every frame on the timeline.
- **Frames on boards**: every frame on its own board, side by side.
- **Sprites on a sheet**: every board is its own sprite. A sprite for each row makes each row of the sheet one sprite with its own animation, so a hero sheet with a row for walking and a row for jumping becomes two boards.

Tick **Add to the open drawing instead of making a new one** and the picture becomes a new layer from the frame you are on (centred, and cut off at the edge if it is bigger), or new boards. It is one undo step. A new drawing has no file yet, so Save asks where to keep it.

## Colours

**Put its colours in the palette** fills the drawing's palette with the colours the picture uses (the most used 256 for a photo). For a drawing you already have, the colours are added to its palette. You can also do this on its own: search **Take colours from a picture** in the command palette (Ctrl+K), or use the Palette panel.

---

Slices that come with an Aseprite sheet become [Slices](help:pixel-slices). Working on pixel art? See [Pixel art](help:pixel-art) and [Palette](help:palette).`,
  'pixel-sheets': `Open a picture with several sprites on it (see [Bringing in pictures](help:pixel-import)) and choose **How to cut it**.

- **One picture**: the whole thing is one frame.
- **Grid**: give the **cell size**, or the number of **rows and columns**. **Margin** is the empty border around the sheet and **spacing** is the empty space between cells. The preview outlines and numbers every cell, so you see right away if it is off by a pixel.
- **Find the gaps**: Frameling finds the sprites by the empty rows and columns between them (see-through pixels, or the colour of the top left pixel when the picture has none). Raise **Gap needed** to keep a sprite with loose bits in one piece, or **Ignore specks** to drop stray dots. Sprites in a row share the row's height, so their feet line up.
- **From a JSON**: a JSON file that comes with the sheet says exactly where each frame is. Frameling reads the ones it writes itself, **Aseprite** (File > Export Sprite Sheet with the JSON data), **TexturePacker**, **Phaser** and **Pixi** atlases. Trimmed and turned frames are put back the way they were, and the animations (tags) and Aseprite slices come across. Pick it with the button, or drop the picture and its .json on the window together.

**Frame order** says which way the cells play: across then down, down then across, or either backwards. **Leave out empty cells** drops the unused cells at the end of the sheet. When the cells are not all one size, **Smaller pieces sit** says where they go on the bigger frame (bottom middle suits characters).

---

Back to [Bringing in pictures](help:pixel-import).`,
};
