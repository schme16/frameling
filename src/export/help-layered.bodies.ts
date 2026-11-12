// The words of the help topics in help-layered.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'export-psd': `**Photoshop layers** saves the frame you're looking at as a PSD file, with your layers still apart, so you can paint over it, add texture or retouch it.

## What comes across

| In Frameling | In the PSD |
|---|---|
| Each layer | A layer with the same name |
| Opacity, hidden layers | The same opacity, hidden layers stay hidden |
| Blend modes | The same blend mode (Glow brighter becomes Linear Dodge) |
| Layer folders | Groups (a plain folder is a pass-through group). A folder inside a folder is a group inside the group |
| Clip to the layer below | A clipping mask |
| A mask layer in a folder | A "Masked by ..." group inside the folder, holding the layers under the mask, with the mask as its layer mask |
| A mask layer on the stage | A group holding everything under it, with the mask as its layer mask |
| Effects (glow, shadow...) | Baked into the layer's pixels |
| A folder with effects | A group holding one finished picture of the folder (your layers stay inside, switched off) |
| Layers bent on bones | Bent, the way they look on the canvas |

Vector drawings become pixels at the export size, so pick a bigger **Size** for print. Pixel art at a whole-number size stays crisp.

The file also holds the finished picture, so apps that don't read layers still show it right. Krita, GIMP, Affinity Photo, Procreate and Photopea all open it.

## Good to know

- One frame at a time. For every frame, use [PNG sequence](help:exporting).
- A folder with effects (a glow or shadow on the whole folder) can't be a plain group, because a group can't hold effects. Its group holds one layer called "(with effects)", which is the folder drawn together with the effects. Your own layers are inside the group too, switched off. To edit them, switch them on and switch the "(with effects)" layer off. The effects won't follow your edits, since they were baked in.
- A mask layer on the stage hides or shows everything under it. In the PSD those layers sit together in a group called "Masked by ...", and the mask is that group's layer mask. The mask layer itself is kept inside, switched off. A mask inside a folder works the same way, but only for the layers under it in that folder: the layers above it and the rest of the file aren't cut.`,
  'export-pdf': `**PDF** keeps your shapes as sharp vectors, so it prints crisply at any size.

- **One page per frame.** Pick **This frame** for a single page, or a clip for just its frames (a quick storyboard or flip book).
- **Layers stay layers.** Each Frameling layer is a PDF layer, so you can turn layers on and off in Acrobat's Layers panel.
- **Opacity and blend modes** are kept. (Glow brighter has no PDF version, so it becomes Lighten like light.)
- **Text** comes across as shapes, so it looks right without the font.
- **Particles** are real little shapes, every one of them.
- **Symbols** keep their blend modes inside, and a **colour wash (tint)** on a copy recolours its shapes.

Some things PDF can't draw as shapes come in as pictures at twice the page size: pixel and tile layers, layers with effects, clipped layers, masks, and art bent on bones. A layer holding a symbol with effects, clipping or masks inside it becomes a picture too. The Export window says how many when there are any.

**Size** sets the page size: at 1×, one stage pixel is one point (1/72 inch).`,
  'export-illustrator': `**Illustrator** saves an \`.ai\` file that opens in Adobe Illustrator as a real Illustrator document: your layers and folders arrive as Illustrator layers with their names, every shape is a path you can select, reshape and recolour, gradients are gradients, and your text is live text.

## How to open it

- **Illustrator:** File > Open, and pick the file. Nothing is asked, and the Layers panel shows your layers and folders.
- **Affinity Designer, Inkscape, CorelDRAW, Acrobat:** open it the same way. They read the PDF inside the file, with your layers as PDF layers.

## Several frames

When the animation has more than one frame, the export window asks how to put them into Illustrator:

- **This frame** (the usual choice): the frame you are looking at, as one document.
- **One file per frame:** a zip with a \`.ai\` file for every frame, each with real layers.
- **One artboard per frame:** one file with every frame side by side as an artboard (Frame 1, Frame 2 and so on). The layers are the same all the way through, and each layer holds the drawing of every frame.
- **Pages:** one PDF page per frame in a single file. This one is a plain PDF: Illustrator asks "PDF Import Options" for the page, and the layers arrive as groups without their names. Use it when the file also goes to programs that read pages.

## What comes across

- **Layers and folders:** names (accents and other scripts too), folders holding their layers (and folders inside folders, as layers inside layers), each layer's opacity and blend mode, and the folder's.
- **Shapes:** fills, lines with their width, joins and caps, see-through colours, and linear and radial gradients with see-through stops. A line painted with a gradient is a real gradient line. A shape with a fill and a line is one path, and shapes with holes are compound paths. A symbol copy is plain shapes.
- **Text** stays live text you can retype, with its font, size, colour, spacing, alignment and opacity. Illustrator needs the font installed: without it (Frameling's Nunito and Inter are not on most computers) it shows another font and keeps the name. For the same letters everywhere, use **Convert to shapes** first. Text animators come as outlines.
- **Pictures:** pixel layers, effects, clipping, masks and bending on bones come in as pictures, with their see-through parts.
- **Hidden layers and folders** arrive as hidden Illustrator layers with their art inside, so you can switch them on there. A visible layer inside a hidden folder stays on its own. A folder with an effect or a mask is one picture, and its hidden layers wait in a hidden folder beside it. Programs that read only the PDF part, and the Pages way, leave them out.

## Good to know

The layer data is written for Illustrator 2026 (version 30) and read back there. If a file ever opens with the PDF Import window, Illustrator is reading only the PDF part, and the layers come in as groups.`,
  'export-prores': `**ProRes video** makes a high quality \`.mov\` that video editors love: it keeps a **see-through background** (tick **Transparent background**), so your animation can sit on top of live footage.

It uses Apple ProRes 4444, which keeps colours and soft edges very close to the original. The files are big; that's normal for editing.

## It needs FFmpeg

Frameling makes ProRes with **FFmpeg**, a free video tool, if it is on your computer. When it isn't, the card says so.

- **Windows:** download a build from ffmpeg.org, unzip it to \`C:\\ffmpeg\`, so \`C:\\ffmpeg\\bin\\ffmpeg.exe\` exists.
- **macOS:** install Homebrew, then run \`brew install ffmpeg\`.
- **Linux:** install the \`ffmpeg\` package (for example \`sudo apt install ffmpeg\`).

Then open Export again. Frameling also looks wherever the \`FRAMELING_FFMPEG\` setting points.

ProRes isn't in the web version, since a browser can't run FFmpeg. Use WebM there for a see-through video.`,
};
