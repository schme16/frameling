import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'export-psd',
    title: 'Photoshop layers (PSD)',
    section: 'Exporting',
    media: 'export-psd.png',
    summary: 'Export the frame you are on as a PSD with every layer kept, for Photoshop, Krita, Affinity Photo, GIMP or Procreate.',
    keywords: ['psd', 'photoshop', 'layers', 'krita', 'affinity', 'gimp', 'procreate', 'photopea'],
    body: `**Photoshop layers** saves the frame you're looking at as a PSD file, with your layers still apart, so you can paint over it, add texture or retouch it.

## What comes across

| In Frameling | In the PSD |
|---|---|
| Each layer | A layer with the same name |
| Opacity, hidden layers | The same opacity, hidden layers stay hidden |
| Blend modes | The same blend mode (Glow brighter becomes Linear Dodge) |
| Layer folders | Groups (a plain folder is a pass-through group) |
| Clip to the layer below | A clipping mask |
| A mask layer in a folder | The group's layer mask |
| Effects (glow, shadow...) | Baked into the layer's pixels |

Vector drawings become pixels at the export size, so pick a bigger **Size** for print. Pixel art at a whole-number size stays crisp.

The file also holds the finished picture, so apps that don't read layers still show it right. Krita, GIMP, Affinity Photo, Procreate and Photopea all open it.

## Good to know

- One frame at a time. For every frame, use [PNG sequence](help:exporting).
- A mask layer that sits right on the stage (not in a folder) comes across as a hidden layer, so its shape is kept but it doesn't mask. Put it in a folder (Effects > Use as mask does that for you) to keep it working.
- Effects on a folder are not baked in yet.`,
  },
  {
    id: 'export-pdf',
    title: 'PDF',
    section: 'Exporting',
    media: 'export-pdf.png',
    summary: 'Sharp vector pages for printing and sharing: one page per frame, with your layers as PDF layers.',
    keywords: ['pdf', 'print', 'vector', 'acrobat', 'storyboard', 'pages'],
    body: `**PDF** keeps your shapes as sharp vectors, so it prints crisply at any size.

- **One page per frame.** Pick **This frame** for a single page, or a clip for just its frames (a quick storyboard or flip book).
- **Layers stay layers.** Each Frameling layer is a PDF layer, so you can turn layers on and off in Acrobat's Layers panel.
- **Opacity and blend modes** are kept. (Glow brighter has no PDF version, so it becomes Lighten like light.)
- **Text** comes across as shapes, so it looks right without the font.
- **Particles** are real little shapes, every one of them.

Some things PDF can't draw as shapes come in as pictures at twice the page size: pixel and tile layers, layers with effects, clipped layers, and masks. The Export window says how many when there are any.

**Size** sets the page size: at 1×, one stage pixel is one point (1/72 inch).`,
  },
  {
    id: 'export-illustrator',
    title: 'Illustrator (.ai)',
    section: 'Exporting',
    media: 'export-pdf.png',
    summary: 'A PDF-compatible .ai file that Adobe Illustrator opens with every shape editable.',
    keywords: ['ai', 'illustrator', 'adobe', 'vector', 'affinity designer', 'inkscape', 'coreldraw'],
    body: `**Illustrator** saves an \`.ai\` file. Since Illustrator 9, an \`.ai\` file is a PDF inside, and Illustrator opens one like this as plain artwork: every shape is a real path you can select, reshape and recolour.

## How to open it

- **Illustrator:** File > Open, and pick the file. Your Frameling layers come in as layers (Illustrator reads the PDF's layers).
- **Affinity Designer, Inkscape, CorelDRAW:** open it the same way; they read it as a PDF.

It's the same picture as the [PDF export](help:export-pdf): one artboard per frame, opacity and blend modes kept, text as shapes, and pixel layers, effects and masks as pictures.

## Good to know

Illustrator keeps its own extra editing data in files it saves itself; this file doesn't have that, so the first time you save from Illustrator it may ask to save as a full Illustrator file. That's fine: say yes.`,
  },
  {
    id: 'export-prores',
    title: 'ProRes video',
    section: 'Exporting',
    media: 'export-prores.png',
    summary: 'A ProRes 4444 .mov for video editors like Premiere, Final Cut and DaVinci Resolve, with a see-through background if you like.',
    keywords: ['prores', 'mov', 'quicktime', '4444', 'alpha', 'premiere', 'final cut', 'resolve', 'after effects', 'ffmpeg', 'transparent video'],
    body: `**ProRes video** makes a high quality \`.mov\` that video editors love: it keeps a **see-through background** (tick **Transparent background**), so your animation can sit on top of live footage.

It uses Apple ProRes 4444, which keeps colours and soft edges very close to the original. The files are big; that's normal for editing.

## It needs FFmpeg

Frameling makes ProRes with **FFmpeg**, a free video tool, if it is on your computer. When it isn't, the card says so.

- **Windows:** download a build from ffmpeg.org, unzip it to \`C:\\ffmpeg\`, so \`C:\\ffmpeg\\bin\\ffmpeg.exe\` exists.
- **macOS:** install Homebrew, then run \`brew install ffmpeg\`.
- **Linux:** install the \`ffmpeg\` package (for example \`sudo apt install ffmpeg\`).

Then open Export again. Frameling also looks wherever the \`FRAMELING_FFMPEG\` setting points.

ProRes isn't in the web version, since a browser can't run FFmpeg. Use WebM there for a see-through video.`,
  },
]);
