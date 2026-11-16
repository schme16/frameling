// The words of the help topics in gradient-tool.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-gradient': `A gradient is two or more colours blending smoothly into each other.

## Giving a shape a gradient

1. In the **Colours** panel, click the fill or stroke box, then pick **Linear** (colours blend along a straight line), **Radial** (colours blend out from the middle in a circle) **Angular** (colours sweep round the middle like a colour wheel, see [Angular gradients](help:gradient-angular)) or **Diamond** (colours step out from the middle in a square turned on its corner, see [Diamond gradients](help:gradient-diamond)).
2. A bar shows the colours. Click a marker under it and pick its colour above, with the picker or a swatch.
3. Draw a shape, or select shapes first with the Select tool (**V**) to change them.

The paint bucket pours the fill box's gradient too.

## Changing a gradient you've already made

Pick the shape with the Select tool (**V**). The **Colours** panel shows its gradient, on whichever side has one: the fill, or the outline when only that has a gradient. Change it the same way as below. The shape changes as you go, and the colour box takes the same gradient (just like a plain colour does), so the next shape you draw gets it too. Only picking a shape leaves the box alone.

Pick several shapes with different gradients and the panel says so. **Make them all match the first** gives every one the first one's colours and direction.

## Changing the colours

- **Click the bar** to add a colour there.
- **Drag a marker** along the bar to move it. Drag it down off the bar to take it away (a gradient keeps at least two).
- **Reverse** turns the colours round.
- **Direction** turns a linear gradient.

## Setting the direction on the canvas

Pick the **Gradient** tool (**F**), then drag across a shape: the gradient runs from where you press to where you let go. Drag the two square ends to fine-tune it. On a radial gradient the first square is the middle and the second sets how far it reaches. On an angular one the first square is the middle and the second sets where the sweep starts. On a diamond one the first square is the middle and the second is the corner it steps out to. Hold **Shift** to keep to 45 degree steps.

On a pixel layer the same tool paints a dithered gradient into the pixels instead. See [Gradients on pixel layers](help:pixel-gradient).

Gradients come along when you export to SVG, PDF and Lottie, and of course in videos, GIFs and sprite sheets. (Lottie has no angular or diamond gradient: see [Angular gradients](help:gradient-angular) and [Diamond gradients](help:gradient-diamond).)`,
  'gradient-angular': `An angular gradient sweeps its colours once round a middle point, like a colour wheel, a pie or the shine on a spinning coin. It is the one for brushed metal, for a pie shape and for a shine that turns. In other programs it is called a **conic** gradient.

**Try it:** pick a shape, click its fill box in the **Colours** panel and choose **Angular**. Or press **Ctrl+K** and type **angular**. The colours run clockwise round the middle of the shape, and the two ends meet where the sweep starts.

**Move it:** pick the **Gradient** tool (**F**) and drag across the shape. Where you press is the middle, and where you let go is where the sweep starts. Drag the two square ends to fine-tune it.

**Make it look like metal:** a new angular gradient goes from your colour to a lighter one and back, so there is no seam. Click the bar to add more colours, and put light and dark ones side by side. For a pie, make two colours sit right next to each other at the same spot for a hard edge.

**Turn it:** the sweep starts where the second square is, so moving that end round the middle turns the whole sweep, and the shine with it.

**On a pixel layer:** the same tool has an **Angular** shape. It sweeps the Paint colour into the Back colour once round, in the dithered way of [Gradients on pixel layers](help:pixel-gradient). With only two colours it has a seam where it starts.

**Exporting:** pictures and videos draw it as it is. SVG, PDF and Illustrator have no angular gradient of their own, so they draw it as 90 thin wedges of plain colour: it looks the same and the file is bigger. Lottie has none either, so there the shape keeps its own plain colour. The Export window says so before you export.

Next: [Gradients](help:tool-gradient), [Colours](help:fill-and-stroke).`,
  'gradient-diamond': `A diamond gradient steps its colours out from a middle point in a square turned on its corner. It is the one for a sheen on a flat panel, a soft box of light, a glint on a jewel or a button that catches the light.

**Try it:** pick a shape, click its fill box in the **Colours** panel and choose **Diamond**. Or press **Ctrl+K** and type **diamond**. The first colour sits in the middle of the shape and the last one on the corners of the diamond, and it carries on past them.

**Move it:** pick the **Gradient** tool (**F**) and drag across the shape. Where you press is the middle, and where you let go is one corner of the diamond, so dragging further makes it bigger. Drag the two square ends to fine-tune it.

**Turn it:** the diamond's corner points to the second square, so moving that end round the middle turns it. Drag at 45 degrees (hold **Shift**) and the diamond stands up straight as a square with its sides level.

**Make a sheen:** give a flat panel a diamond gradient from a pale colour in the middle to the panel's own colour, with the middle off to one side where the light would hit. Make the pale colour see-through at the middle end for a softer glint.

**A soft box of light:** make the middle a bright, see-through colour and the outside fully see-through, on a shape over a dark background.

**On a pixel layer:** the same tool has a **Diamond** shape. It steps the Paint colour into the Back colour out to the corner you drag to, in the dithered way of [Gradients on pixel layers](help:pixel-gradient).

**Exporting:** pictures and videos draw it as it is. SVG, PDF and Illustrator have no diamond gradient of their own, so they draw it as four straight gradients, one in each quarter: it looks the same and the file is a little bigger. Lottie has none either, so there the shape keeps its own plain colour. The Export window says so before you export.

Next: [Gradients](help:tool-gradient), [Angular gradients](help:gradient-angular), [Colours](help:fill-and-stroke).`,
};
