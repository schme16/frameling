import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'artboards',
    title: 'Artboards: several canvases in one file',
    section: 'Pixel art',
    media: 'artboards.mp4',
    summary: 'Keep many named canvases side by side in one file: a sprite each, an icon each, or a shot each. They share your palette, swatches and symbols.',
    keywords: ['artboard', 'artboards', 'multiple canvases', 'canvases', 'pages', 'sheets', 'sprites', 'sprite set', 'icons', 'boards', 'Shift+W', 'pasteboard'],
    body: `An **artboard** is a canvas of its own inside your file, with its own name, size, background, layers and timeline. Put a hero's idle, run and jump side by side, a set of icons, or the shots of a film. They all share the palette, swatches, symbols and tiles, so a colour change shows up everywhere.

**Add one:** press **New artboard** in **View > Artboards**, or pick the **Artboard** tool (**Shift+W**) and drag a box on the empty space round the page.

**Draw on any of them:** just click one with any tool. It opens, and you draw there. The others stay on show around it, each on the frame you left it on. Onion skin and the timeline belong to the artboard you have open.

**With the Artboard tool:**
- **Drag** an artboard to move it. Hold **Shift** to keep it level.
- **Drag an edge or corner** to resize it. The drawing stays where it is.
- **Alt+drag** to copy it.
- On pixel art, sizes and places snap to whole art pixels.

**In the Artboards panel:** click one to open it, double-click to fill the window with it, drag to reorder, double-click its name to rename it. Underneath, set the open one's **Name**, **Export as** (the file name it exports with), **W** and **H**, and **Background** (or **See-through**).

**Getting around:** **Alt+PageDown** and **Alt+PageUp** go to the next and previous artboard. **Ctrl+Alt+0** fits them all in the window. **View > Zoom to artboard** fills the window with the open one. **Line up** puts them in a tidy row.

To export them, see [exporting artboards](help:artboards-export). For animation, see [artboards as shots](help:artboards-shots).`,
  },
  {
    id: 'artboards-shots',
    title: 'Artboards for animation: shots',
    section: 'Animating',
    media: 'artboards-shots.png',
    summary: 'Each artboard has its own timeline and length, like the shots of a film. Play them all in order, and export one, some or all.',
    keywords: ['shots', 'scenes', 'storyboard', 'animatic', 'sequence', 'cuts', 'film', 'play all', 'artboards animation'],
    body: `For animation, think of each [artboard](help:artboards) as a **shot**: it has its own layers, its own timeline and its own length, so a 12 frame close-up and a 48 frame wide shot live happily in one file. Characters made into [symbols](help:symbols) can appear in every shot.

**Make shots:** add an artboard for each one (the same size as the first, so they cut together), or **Duplicate artboard** to start a shot from the last one.

**Play them in order:** press **Play all in order** in the Artboards panel. They play one after another in their own window, in the panel's order. The strip under the picture shows each shot; click one to jump to it. Drag them in the panel to change the order.

**Export them:**
- **All in order, as one** makes one video or GIF of every shot back to back. Each shot becomes a named clip, and its sounds and markers come along.
- **Each as its own file** gives a file per shot.
- **This artboard** exports just the one you have open.

To join shots into one video they need to be the same size; Frameling tells you if one isn't.`,
  },
  {
    id: 'artboards-export',
    title: 'Exporting artboards',
    section: 'Exporting',
    media: 'artboards-export.png',
    summary: 'Export each artboard as its own file (into a folder or one zip), all of them in order as one, or every frame packed onto one picture (an atlas).',
    keywords: ['export artboards', 'export all', 'batch export', 'atlas', 'texture atlas', 'pack', 'zip', 'each sprite'],
    body: `When a file has more than one [artboard](help:artboards), the **Export** dialog has a **Which artboards** row. Pick the format and settings as usual, then:

- **This artboard** exports the one you have open, as always.
- **Each as its own file** exports every ticked artboard separately, named after it (or its **Export as** name). The first time, Frameling asks whether they go **into a folder** or **one zip file**, and remembers (change it in Preferences > Behaviour).
- **All in order, as one** joins them end to end, for videos, GIFs and other animations. See [shots](help:artboards-shots).
- **Packed onto one sheet** (with **Sprite sheet** picked) puts every frame of every ticked artboard on one picture, packed tightly, with a JSON atlas. Each artboard is an animation named after it, and its clips come along as "artboard/clip".

**File > Export artboards** and **File > Pack artboards into one sprite sheet** open the dialog already set up.`,
  },
]);
