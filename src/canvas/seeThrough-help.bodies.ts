// The words of the help topic in seeThrough-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'see-through-page': `A sprite, a logo or an icon usually wants nothing behind it, so you can put it on anything. Take the colour off the page and what is left is the drawing alone.

**Make a page see-through:** **Edit > See-through page**, or pick it in the command palette. A checkerboard shows where the colour was. Press it again for the colour back. It works on the open page, so each [artboard](help:artboards) can have its own: a see-through sprite beside a shot with a sky.

You can also tick **See-through** next to **Background** in **Edit > Canvas size and speed...** or in the **Artboards** panel.

**In the file you save:** exports keep it. A page with no colour comes out with nothing behind the drawing, in every type that can hold that:
- **PNG, PNG sequence, sprite sheet, Photoshop layers and Animated PNG**: see-through, with soft edges.
- **WebM video and ProRes video**: see-through on computers that can make it (the export window says if yours can't).
- **GIF**: see-through, but a GIF only has on or off, so soft edges turn hard.
- **SVG, Moving SVG, Lottie, PDF and Illustrator**: no background shape is written, so the page shows through.
- **MP4 video**: can't be see-through. It paints the page colour, or white where there isn't one.

**Several artboards:** each one keeps what you gave it. A see-through board stays see-through and a coloured one keeps its colour, in every way of exporting several. Tick **Transparent background** in the export window only when you want every colour left off, coloured boards too.

**Good to know:**
- The checkerboard is only on your screen. It's never part of your drawing or your export.
- To see how it will look on a colour, try the export on that colour. A white drawing on the checkerboard can look lost: that's the checkerboard being honest.

See also [Canvas size and speed](help:canvas-size) and [Exporting](help:exporting).`,
};
