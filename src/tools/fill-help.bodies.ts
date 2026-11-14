// The words of the help topics in fill-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  fill: `The **paint bucket** (press **G**) fills the area you click with your current colour.

## How to use it

1. Draw your lines with the brush.
2. Pick a colour.
3. Choose the paint bucket and click inside a shape.

The colour goes **behind** your lines, so you can fill first or last and the lines always stay on top. If you change your mind, click the same area again with a new colour and it changes colour instead of piling up.

## Filling a shape that is split up later

If you draw a new line across an area you already filled, then click one side with the paint bucket, only that side gets the new colour.

## If nothing fills

- **"That area isn't closed in."** There is a gap in your lines and the colour would spill out over the whole page. Try a bigger **Close gaps** setting, or draw a short line to close it. See [Closing gaps](help:fill-gaps).
- **"You clicked right on a line."** Click inside the shape instead, in the open space.
- **Locked or hidden layer.** Unlock or show the layer in the timeline first.

## On pixel layers

On a pixel layer the paint bucket fills the joined-up pixels of the colour you click. Left alone it wants an exact match, so a slightly different pixel stops the fill. Two options change that, and they work the way the vector bucket's do: see [Filling pixel art under your lines](help:fill-pixel).

## Options

- **Close gaps**: how big a gap in your lines still counts as closed.
- **Fill on top**: put the colour above your lines instead of behind them. Most of the time you want it off.
- **Use lines from all layers**: the bucket sees lines on every visible layer, not just the one you are on. Keep your line art on one layer, pick a colour layer underneath, and fill there. Your lines stay clean and the colour is easy to change later. It works on pixel layers too.
- **Colour match** (pixel layers): how alike a colour has to be to get filled as well. **Exact colour** fills only the very same colour; raise it for art whose colours drift a little. See [Filling pixel art under your lines](help:fill-pixel).
- **Fill all of this colour** (pixel layers): recolour every pixel of that colour on the frame, joined up or not.

## Tips

- Zoom in if you are not sure a line really meets. A gap you cannot see still lets colour out.
- Fill the big areas first, then the small ones. Small shapes next to each other are easier to click that way.
- Fills on vector layers are real shapes, so they stay sharp at any size.`,
  'fill-pixel': `The paint bucket works on pixel art the way it does on vectors: keep your lines on one layer, your flat colour on the one below, and fill inside the lines. Without help a pixel layer only sees itself, so a colour layer under your line art would flood the whole page.

**Fill under your lines:**
1. Put your line art on one pixel layer and add an empty pixel layer under it.
2. Pick the lower layer, then the **Paint bucket** (**G**).
3. Tick **Use lines from all layers** (or search the palette for **Paint bucket sees lines on all layers**).
4. Click inside a shape. The colour stops at your lines.

The lines can be pixels or vector shapes on any visible layer. A layer that covers most of the picture, like a background, is treated as a backdrop and ignored, so it can't wall everything in. Click right on a line and Frameling says so instead of filling.

**Colours that are close but not the same:** raise **Colour match**. The bucket then fills every joined-up pixel within that many per cent of the colour you clicked, which tidies noisy or smoothed art in one go. Pixels more different than that stay, so a lighter edge survives. **Exact colour** (the default) fills only the very same colour.

Both work with **Fill all of this colour**, mirror drawing, tile mode, a selection (the colour stays inside it) and a locked palette.

## Good to know

- Lines on the layer you are filling still stop the fill, as they always did.
- Each click is one undo step.
- Fills on a pixel layer are pixels, so they stay as crisp as the rest of the art.

See [Fill](help:fill) for the vector bucket and [Pixel art](help:pixel-art) to start a pixel layer.`,
  'fill-gaps': `When you draw a shape by hand the line almost never joins back up exactly. Left alone, the colour would find the tiny opening and spill out into everything around it, so the paint bucket would have nothing sensible to fill.

**Close gaps** tells the paint bucket to pretend small openings are shut.

| Setting | Good for |
| --- | --- |
| **None** | Shapes whose lines really meet, like boxes and circles drawn with the shape tools. |
| **Small** | Normal sketching. This is the default. |
| **Medium** | Loose, quick drawing where lines stop a little short of each other. |
| **Large** | Very rough drawing. Thin shapes near each other can merge, so use it only when you need it. |

The sizes are measured on the page, not on your screen, so zooming in or out does not change them. They grow a little when your brush is chunky.

## What it does at the gap

The colour stops at the invisible line across the gap, with a slightly rounded end. If that bothers you, draw a tiny line across the gap and fill again.

## Tips

- If the message says the area "isn't closed in", step the setting up one size and click again.
- If the colour fills too much and runs into a neighbouring shape, step the setting down, or close the gap with a short line.
- A very small shape inside a bigger one, like an eye, is left alone when you fill the bigger shape.`,
};
