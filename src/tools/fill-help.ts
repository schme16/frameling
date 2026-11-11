import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'fill',
    title: 'Fill',
    section: 'Drawing',
    summary: 'The paint bucket pours colour into any area your lines close off. Click inside a shape to fill it.',
    keywords: ['paint bucket', 'colour', 'color', 'flood', 'fill in', 'bucket'],
    body: `The **paint bucket** (press **G**) fills the area you click with your current colour.

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

On a pixel layer the paint bucket fills the joined-up pixels of the colour you click. Turn on **Fill all of this colour** to recolour every pixel of that colour on the frame, even the ones that are not joined up. Pixel fills match colours exactly, so a pixel that is only slightly different is treated as a different colour.

## Options

- **Close gaps**: how big a gap in your lines still counts as closed.
- **Fill on top**: put the colour above your lines instead of behind them. Most of the time you want it off.
- **Fill all of this colour** (pixel layers): recolour every pixel of the clicked colour.

## Tips

- Zoom in if you are not sure a line really meets. A gap you cannot see still lets colour out.
- Fill the big areas first, then the small ones. Small shapes next to each other are easier to click that way.
- Fills on vector layers are real shapes, so they stay sharp at any size.`,
  },
  {
    id: 'fill-gaps',
    title: 'Closing gaps',
    section: 'Drawing',
    summary: 'Hand-drawn lines rarely meet perfectly. The Close gaps setting lets the paint bucket treat small gaps as closed.',
    keywords: ['gap', 'leak', 'not closed', 'spills', 'open shape', 'close gaps'],
    body: `When you draw a shape by hand the line almost never joins back up exactly. Left alone, the colour would find the tiny opening and spill out into everything around it, so the paint bucket would have nothing sensible to fill.

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
  },
]);
