export const bodies: Record<string, string> = {
  'clipboard-system': `Copy in Frameling and paste into a chat, an email or another art app. Copy a picture anywhere else and paste it here.

**Out to other apps:**

- **Ctrl+C** copies the selection. Frameling keeps its own full copy for pasting back in, and also puts a **picture** of it on the computer's clipboard, with see-through where nothing is drawn.
- Shapes go out at twice the size of the page, so they stay crisp. Pixels go out the size you see them on the page.
- **Edit > Copy as SVG** copies the selected shapes as SVG text, for Inkscape, Figma or a code editor.

**In from other apps:** copy a picture (a screenshot, an image from a browser), pick a layer and press **Ctrl+V**. It lands in the middle of the page.

- On a **pixel layer** it comes in as pixels, lifted, so you can drag it into place. A picture that fits keeps its size, one pixel to one art pixel. If the layer's palette is locked, its colours are matched to the palette.
- On a **vector layer** it comes in as a picture (a symbol made of pixels), selected. Move it, turn it and resize it like any symbol. Double-click it to keep drawing on it in pixels.
- A picture that is bigger than the page is **shrunk to fit**, keeping its shape. The first time, Frameling does that and says so, with a **Change** button for keeping its size and cutting off what hangs over. It remembers, and you can change it any time in Preferences > Behaviour. A picture is never made bigger.

**Between vector and pixel layers:**

- **Shapes pasted on a pixel layer become pixels.** Curves turn into hard-edged pixels snapped to the layer's grid (and its palette, when that is locked). Anything past the page edge is left out. They don't turn back into curves.
- **Pixels pasted on a vector layer become a picture.** They stay pixels, at the size they were, in the place they were copied from.

Each time, a message tells you what was converted, so nothing changes without you knowing.

**Good to know:**

- Paste uses the newest thing you copied, whether it was in Frameling or another app.
- Copying frames and keys on the timeline is separate: see [Copying frames and keys](help:timeline-copy-keys).
- Shapes only: [Copy, cut and paste](help:copy-paste).`,
};
