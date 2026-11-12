// The words of the help topics in wells.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'fill-and-stroke': `The Colours panel has two boxes. The **fill** box (the solid square) colours the inside of shapes and is what the **paint bucket** pours. The **stroke** box (the square with a hole) colours **lines**: the brush, the pencil, pixel lines and the outline of shapes.

Click a box to bring it to the front. The picker, the swatches and the eyedropper change whichever box is in front. Picking a tool brings its box forward for you: the paint bucket brings the fill, and the brush, pencil and line bring the stroke, so the colour you click next is the one you paint with.

## Shapes

Rectangles and ellipses use both: the fill inside and the stroke round the edge. Want just an outline? Set the fill to **none**. Just a solid shape? Set the stroke to none.

## Quick keys

- **X** brings the other box to the front.
- **Shift+X** swaps the two colours. Gradients swap too, so a gradient fill becomes a gradient outline.
- **Shift+D** goes back to the default colours: a black stroke, and a fill in your theme's highlight colour (gold in most themes, aqua or lavender in others). New shapes start with that fill too, so they show up on white paper.
- **/** sets the box in front to none.

## Changing shapes you've already drawn

Select shapes with the Select tool (**V**), then pick a colour. The box in front decides whether you change their fill or their outline.`,
};
