import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'aseprite-import',
    media: 'aseprite-import.png',
    title: 'Bringing in Aseprite files',
    section: 'Files',
    summary: 'Open a pixel animation made in Aseprite (.aseprite or .ase) with its layers, frames, timing, tags and colours.',
    keywords: ['aseprite', 'ase', 'import', 'sprite', 'pixel art', 'open', 'tags', 'palette', 'tilemap', 'indexed'],
    body: `Frameling opens **Aseprite** files directly. You don't need to export anything first.

## Open one as a new drawing

Press **Ctrl+O** (**Cmd+O**) and pick a file ending in **.aseprite** or **.ase**. You can also drag the file onto the Frameling window. It opens as a new, unsaved drawing, so **Save** asks where to keep it as a .frameling file. Your original Aseprite file is never changed.

## Add one to the drawing you have open

Choose **File > Import > Aseprite file...**. Its layers go on top of yours, its frames start at the first frame, and its colours join your palette. It is one undo step. The drawing keeps its own frame rate and size.

When you drop a file on the window, Frameling asks the first time whether to open it or add it, then remembers (change it any time in Preferences > Behaviour).

## Only want the colours?

Search for **Use palette from an Aseprite file** in the command palette (Ctrl+K). It sets your drawing's palette to the file's, without touching anything else.

## What comes across

- **Layers**, in order, with their opacity, blend mode, hidden and locked state, and groups as folders. Reference layers stay reference layers.
- **Frames with their timing.** Frameling counts frames at one rate, so it picks the rate that fits every frame's time exactly (a 100 ms frame next to a 150 ms one becomes 20 fps, held 2 and 3 frames) and holds the frames to match. If the times can't fit exactly, it tells you.
- **Linked cels** share one drawing, so a hold stays a hold.
- **Each cel's position and opacity**, in every colour mode: full colour, grayscale and indexed.
- **The palette**, as your drawing's palette. The original index details are kept in the drawing's notes.
- **Tags** become named clips, so they work in exports and game engines.
- **Tilemaps** become real tiles in your tileset, flips included, when they line up with the tile grid. Otherwise that layer comes across as flat pixels and the dialog says why.

## What gets approximated

After an import, a message says **See what changed** whenever something couldn't be matched exactly. Typical cases:

- **Subtract and Divide** blend modes don't exist in Frameling, so those layers blend normally.
- **Tags that play backwards or ping-pong**, or repeat a number of times, play forward here. The direction is kept in the drawing's notes.
- **Slices** (including 9-patch and pivots) are kept in the notes but not shown.
- **Groups inside groups** become one folder. Hiding, fading and names carry over.
- Anything drawn **outside the canvas** is cropped.

If a file ends in .ase but isn't from Aseprite (Adobe swatch files do this), Frameling says so.

---

Working on pixel art? See [Pixel art](help:pixel-art) and [Palette](help:palette).`,
  },
]);
