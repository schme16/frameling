// The words of the help topics in gradient-tool.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-gradient': `A gradient is two or more colours blending smoothly into each other.

## Giving a shape a gradient

1. In the **Colours** panel, click the fill or stroke box, then pick **Linear** (colours blend along a straight line) or **Radial** (colours blend out from the middle in a circle).
2. A bar shows the colours. Click a marker under it and pick its colour above, with the picker or a swatch.
3. Draw a shape, or select shapes first with the Select tool (**V**) to change them.

The paint bucket pours the fill box's gradient too.

## Changing the colours

- **Click the bar** to add a colour there.
- **Drag a marker** along the bar to move it. Drag it down off the bar to take it away (a gradient keeps at least two).
- **Reverse** turns the colours round.
- **Direction** turns a linear gradient.

## Setting the direction on the canvas

Pick the **Gradient** tool (**F**), then drag across a shape: the gradient runs from where you press to where you let go. Drag the two square ends to fine-tune it. On a radial gradient the first square is the middle and the second sets how far it reaches. Hold **Shift** to keep to 45 degree steps.

On a pixel layer the same tool paints a dithered gradient into the pixels instead. See [Gradients on pixel layers](help:pixel-gradient).

Gradients come along when you export to SVG, PDF and Lottie, and of course in videos, GIFs and sprite sheets.`,
};
