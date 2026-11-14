// The words of the help topics in index.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'convert-to-pixels': `**Turn into pixels** (also called **rasterize**) changes shapes into a grid of coloured squares, so you can paint on them like pixel art. Draw a character as shapes, then turn it into a sprite at the size your game wants.

**Do it:**
1. Pick a vector layer. Pick some shapes if you only want those, or pick none for the whole drawing.
2. Click **Turn into pixels** in **Properties**, or find it in the command palette, or in **Tools and layers > Tidy and convert shapes**.
3. Choose the settings, check **Now** and **After**, then click **Turn into pixels**.

## The settings

- **Where it goes:** **A new layer beside it** is the safe one, since your shapes are still there (they're hidden when all of them were turned). **In its place** takes the shapes out, and the pixels take over.
- **How many frames:** **This drawing**, **This clip** or **Every frame**. The number says how many drawings it reaches. Every frame can be slow, so it starts on one.
- **Pixel size:** how many page pixels make one art pixel. **Finest** matches the page. **8x** makes big chunky pixels, so a 256 wide page becomes a 32 pixel grid.
- **Edges:** **Hard** paints every pixel fully or leaves it empty, the pixel art look. **Soft** lets edge pixels be partly see-through, so curves look smooth. It starts on hard for chunky pixels and pixel art, and soft for fine pixels on shapes.

## What you give up

Shapes can be reshaped and stay sharp at any size. Pixels can't: once they're pixels, zooming in shows the squares, and resizing blurs or blocks them. That's why you see the result first, and why one **Undo** puts it all back.

## Good to know

- Layer effects, opacity and blend mode move to the new layer, so it looks the same.
- A shape that moves between two keys is turned frame by frame.
- Very large pages at the finest size make a lot of pixels. The dialog tells you before you wait.

Going the other way? See [Turn pixels into shapes](help:convert-to-shapes). Want to keep shapes but make them plain? See [Brush tips](help:brush-tips).`,

  'convert-to-shapes': `**Turn into shapes** (also called **trace** or **vectorize**) changes pixels into flat-colour shapes you can reshape, recolour and resize without going blocky. Pixel art, a logo you only have as a picture, or a flat-colour drawing all work.

**Do it:**
1. Pick a pixel layer. Select some pixels if you only want those, or select none for the whole drawing.
2. Click **Turn into shapes** in **Properties**, or find it in the command palette, or in **Tools and layers > Tidy and convert shapes**.
3. Check **Now** and **After**, nudge the settings, then click **Turn into shapes**.

## The settings

- **Colours:** how many colours to keep, so how many shapes you get. Flat art keeps every colour exactly; a busier picture is reduced to this many.
- **Edges:** **Keep the pixel steps** follows the pixel edges exactly, right for pixel art. **Round into curves** smooths the steps away and makes far fewer points; use **Smoothness** to say how much.
- **Where it goes**, **How many frames**: the same as [turning shapes into pixels](help:convert-to-pixels). A new layer beside the original is the safe start.
- **More ways to tune it:** **Stacked, no gaps** puts each colour on top of the ones below, so no thin lines show between shapes. **Each blob** gives every separate piece its own shape. **Leave out bits smaller than** drops stray specks.

## What it costs

Every shape is one flat colour. Soft shading, gradients and fine texture become steps or disappear.

**A photo makes a mess.** It has thousands of colours, so tracing it gives a heap of tiny shapes that look like a mosaic and are slow to edit. Frameling says so before you wait, and the button changes to **Turn into shapes anyway**. For photos, lower the colours a lot, or keep them as pixels.

## Good to know

- The new shapes are selected, so you can move or recolour them straight away.
- One **Undo** puts it all back, including the original pixels.
- Pixels that are only partly see-through become fully painted or empty.

The other way round: [Turn shapes into pixels](help:convert-to-pixels).`,
};
