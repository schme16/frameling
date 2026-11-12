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

**Draw on any of them:** just click one with any tool. It opens, and you draw there. The others stay on show around it, each on the frame you left it on. The timeline and onion skin follow you: they always show the artboard you have open, and clicking another one (or its name) opens it and brings its timeline with it.

**With the Artboard tool:**
- **Drag** an artboard to move it. Hold **Shift** to keep it level.
- **Drag an edge or corner** to resize it. The drawing stays where it is.
- **Alt+drag** to copy it.
- On pixel art, sizes and places snap to whole art pixels.

**In the Artboards panel:** click one to open it, double-click to fill the window with it, drag to reorder, double-click its name to rename it. Underneath, set the open one's **Name**, **Export as** (the file name it exports with), **W** and **H**, and **Background** (or **See-through**).

**Getting around:** **Alt+PageDown** and **Alt+PageUp** go to the next and previous artboard. **Ctrl+Alt+0** fits them all in the window. **View > Zoom to artboard** fills the window with the open one. **Line up** puts them in a tidy row.

To export them, see [exporting artboards](help:artboards-export). For animation, see [artboards as shots](help:artboards-shots). For copies that follow an original, see [variations](help:variations).`,
  },
  {
    id: 'artboards-shots',
    title: 'Artboards for animation: shots',
    section: 'Animating',
    media: 'artboards-shots.png',
    summary: 'Each artboard has its own timeline and length, like the shots of a film. Play them all in order, and export one, some or all.',
    keywords: ['shots', 'scenes', 'storyboard', 'animatic', 'sequence', 'cuts', 'film', 'play all', 'artboards animation'],
    body: `For animation, think of each [artboard](help:artboards) as a **shot**: it has its own layers, its own timeline and its own length, so a 12 frame close-up and a 48 frame wide shot live happily in one file. Characters made into [symbols](help:symbols) can appear in every shot.

**Make shots:** add an artboard for each one, or **Duplicate artboard** to start a shot from the last one. They can be different sizes; see [shots of different sizes](help:artboards-letterbox).

**Play them in order:** press **Play all in order** in the Artboards panel. They play one after another in their own window, in the panel's order. The strip under the picture shows each shot; click one to jump to it. Drag them in the panel to change the order.

**Export them:**
- **All in order, as one** makes one video or GIF of every shot back to back. Each shot becomes a named clip, and its sounds and markers come along. With **Sprite sheet**, every board is a frame of one sprite instead.
- **Each as its own file** gives a file per shot.
- **This artboard** exports just the one you have open.
`,
  },
  {
    id: 'artboards-letterbox',
    title: 'Shots of different sizes: bars or fill',
    section: 'Animating',
    media: 'artboards-letterbox.png',
    summary: 'Shots of different sizes can play and export as one film. Fit shows the whole shot with bars; Fill covers the picture and crops what hangs over.',
    keywords: ['letterbox', 'pillarbox', 'bars', 'black bars', 'fit', 'fill', 'crop', 'different sizes', 'aspect ratio', 'join shots', 'mixed sizes'],
    body: `The picture of a film is the size of its **first** shot, unless you pick another **Picture size** (see below). A shot of another size is placed into that picture, in one of two ways:

- **Fit (bars)** is the default. The whole shot shows, as big as it can be, centred, with **bars** at the sides (a tall shot) or top and bottom (a wide one). Nothing is cut off, and anything hanging off the edge of the shot's stage stays hidden.
- **Fill (crop)** makes the shot cover the whole picture, so no bars, but what hangs over the edges is **cropped**.

**Where to pick:** in **Play all in order** (the **Fit (bars)** and **Fill (crop)** buttons next to **Loop**, shown when the shots differ in size), and in the **Export** dialog under **All in order, as one**. It is the same setting in both, and Frameling remembers it. It is also in **Preferences > Behaviour**, with the **bar colour**: the first shot's background colour (the default), black or white.

**Good to know:**
- A shot's own camera moves still work, and so do layers with depth (the parallax): Frameling zooms them for the fit and keeps far layers where the plain fit puts them.
- Shots the same size as the picture are left exactly as they are.
- **Picture size** sets how big the picture is: **First shot** (the default), **Largest shot** (the picture is as big as the biggest shot, so none of them has to shrink), or **Custom** (type a width and height). It sits next to Fit and Fill, in **Play all in order** and in the Export dialog. Or put the shot you want first in the Artboards panel (drag it to the top).
- Exporting **each as its own file** never fits anything: every shot keeps its own size.

See [artboards as shots](help:artboards-shots) and [exporting artboards](help:artboards-export).`,
  },
  {
    id: 'variations',
    title: 'Variations: linked copies of an artboard',
    section: 'Animating',
    media: 'variations.mp4',
    summary: 'A variation follows its original and keeps only what you change in it: another colour scheme, another size, another take. Edit the original and every variation follows along.',
    keywords: ['variation', 'variations', 'linked copy', 'linked copies', 'overrides', 'colourway', 'colorway', 'recolour', 'recolor', 'alternate take', 'versions', 'square', 'wide', 'tall', 'sizes', 'social', 'a/b timing', 'differences', 'detach', 'reset to original'],
    body: `A **variation (linked copy)** is an [artboard](help:artboards) that follows another one. It shows everything its **original** shows, except for the things you change in it. Change the hero's drawing in the original and the variation changes too. Change the hero's colour in the variation and only the variation turns that colour.

**Make one:** press **Make a variation** in the Artboards panel, or **View > Make a variation (linked copy)**, or press **Ctrl+K** and type "variation". It opens beside the original with a **Variation** tag. Then just work in it as usual: recolour shapes, move keys to change the timing, hide a layer, add one of its own.

**Colourways:** press **Recolour this variation** and pick new colours: every frame changes, only in the variation. See [recolour a variation](help:variations-recolour).

**Sizes:** in the variation's panel pick **Square**, **Wide** or **Tall** (or type any **W** and **H** under **This artboard**). The same animation is framed in the new size by a camera that Frameling adds for you, and you can move it like any camera. Resize the original and the cut is framed again by itself, unless you have moved its camera. **Fill (crop)** covers the picture and crops what hangs over; **Fit (show it all)** shows the whole original. Frameling asks which you prefer the first time.

**A/B timing:** move or stretch keys in the variation. Keys you did not touch still follow the original.

**Differences:** the panel lists everything this variation changes in plain words, grouped by layer ("Frame 1: the Ball is drawn over the Hat"). Click one to jump to that layer, frame and shape. Press **Reset** next to one to take just that change back, or **Reset all to original** to start again. Both can be undone.

**Detach:** **Detach (plain copy)** makes it an ordinary artboard that stops following.

**Export:** in the Export dialog, **This artboard and its variations** ticks the original and every variation. Then export each as its own file (named after the variation, like "Hero - pink"), all in order as one, or packed onto one sheet.

**Good to know:**
- A variation of a variation starts with the same changes and follows the same original.
- **Sound** can differ: turn a sound down, mute it, move it or leave it out in the variation, and the original keeps its own.
- Symbols, tiles, swatches and layer folders are shared with the original. You can add a new swatch from a variation (the original gets it too). Changing or removing the rest is refused with a note and left as it is: change them in the original, or detach the variation.
- Deleting the original turns its variations into plain artboards.
- Saving keeps only the changes, so a file with many variations stays small.`,
  },
  {
    id: 'variations-recolour',
    title: 'Recolour a variation (colourways)',
    section: 'Animating',
    media: 'variations-recolour.png',
    summary: 'Make a colourway: pick new colours for a variation, on every frame at once, without touching the original.',
    keywords: ['colourway', 'colorway', 'recolour variation', 'recolor variation', 'change colours', 'palette swap', 'skin', 'team colours', 'variation colours'],
    body: `Want a blue version of your pink hero? Make a [variation](help:variations), open it, and press **Recolour this variation** in the Artboards panel (or press **Ctrl+K** and type "recolour variation").

1. The window lists every colour the variation uses.
2. Click the colour box beside one and pick what it becomes. Do it for as many colours as you like. **Keep** puts one back.
3. Check the **Now** and **After** pictures, then press **Recolour**.

Every frame changes at once, and it is one step: **Undo** takes it all back. The original and the other variations keep their colours.

**Differences:** each colour you changed is one line, like "Colour #ff6f91 becomes #4f9bd1 on every frame", with its own **Reset**.

**Good to know:**
- **Recolour the whole animation** also works inside a variation, and changes only that variation.
- Change a colour in the original later and the variation follows, except for the colours it changed itself.
- Swatches are shared with the original, so they stay as they are.
- Exporting names the file after the variation, like "Hero - pink.png".`,
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
- **All in order, as one** joins them end to end, for videos, GIFs and other animations. Shots of different sizes get bars or are cropped to fill: see [shots of different sizes](help:artboards-letterbox).
- **All in order, as one**, with **Sprite sheet** picked, makes one sprite: each artboard is a frame, in the order of the list, and they play as one animation in Godot, Unity, Phaser, PixiJS and the web. Use it when you draw a frame on each board. The boards' own clips are left out, so it stays one animation. See [Sprite sheets](help:export-sprite-sheets).
- **Packed onto one sheet** (with **Sprite sheet** picked) is for a cast: it puts every frame of every ticked artboard on one picture, packed tightly, with a JSON atlas. Each artboard is an animation named after it, and its clips come along as "artboard/clip".

**File > Export artboards** and **File > Pack artboards into one sprite sheet** open the dialog already set up.`,
  },
]);
